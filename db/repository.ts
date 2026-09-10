import { columnSpec, decodeRow, encodeValue, identifier, tableSpec, timestamp } from './codec'
import { type DatabaseAdapter, type RawRow, type SqlCommand, type SqlValue, safeInteger } from './contracts'
import { DatabaseError } from './errors'
import type { Insert, Patch, Row, TableName } from './models'
import { buildListPlan, buildLookupCommands, read, type ListQuery, uniqueKeys, write } from './query'

export interface Page<T> { items: T[]; total: number; limit: number; offset: number; hasMore: boolean }
export interface UpdateOptions { expectedUpdatedAt?: string }
export interface RepositoryOptions { now?: () => Date; newUid?: () => string }

/** Storage-only API. Module/record authorization belongs to the Service layer. */
export class Repository {
  private readonly now: () => Date
  private readonly newUid: () => string
  constructor(readonly adapter: DatabaseAdapter, options: RepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.newUid = options.newUid ?? (() => crypto.randomUUID())
  }
  private clock(after?: string): string {
    const current = timestamp(this.now().toISOString())
    if (!after) return current
    timestamp(after)
    return Date.parse(current) <= Date.parse(after) ? new Date(Date.parse(after) + 1).toISOString() : current
  }
  private values(table: TableName, data: Record<string, unknown>, mode: 'insert' | 'update'): Record<string, SqlValue> {
    const values: Record<string, SqlValue> = {}
    for (const [field, value] of Object.entries(data)) {
      const spec = columnSpec(table, field)
      if (field === 'id' || (mode === 'update' && ['uid', 'created_at', 'updated_at'].includes(field))) throw new DatabaseError('DB_INPUT', 'Read-only field cannot be written')
      values[field] = encodeValue(spec, value)
    }
    return values
  }
  private insertCommand<T extends TableName>(table: T, data: Insert<T>, merge: boolean): SqlCommand {
    const values = this.values(table, data as unknown as Record<string, unknown>, 'insert')
    values.uid ??= encodeValue(columnSpec(table, 'uid'), this.newUid())
    const now = this.clock()
    values.created_at ??= now; values.updated_at ??= now
    for (const [field, spec] of Object.entries(tableSpec(table).columns)) {
      if (field === 'id') continue
      if (!spec.nullable && spec.defaultSql === undefined && !Object.hasOwn(spec, 'default') && !Object.hasOwn(values, field)) throw new DatabaseError('DB_NOT_NULL', 'Required field is missing')
    }
    const fields = Object.keys(values)
    const assignments = fields.filter(field => !['uid', 'created_at'].includes(field)).map(field => field === 'updated_at'
      ? `"updated_at" = CASE WHEN ${identifier(table)}."updated_at" >= excluded."updated_at" THEN strftime('%Y-%m-%dT%H:%M:%fZ', ${identifier(table)}."updated_at", '+0.001 seconds') ELSE excluded."updated_at" END`
      : `${identifier(field)} = excluded.${identifier(field)}`)
    return write(`INSERT INTO ${identifier(table)} (${fields.map(identifier).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})${merge ? ` ON CONFLICT ("uid") DO UPDATE SET ${assignments.join(', ')}` : ''} RETURNING *`, Object.values(values), true)
  }
  async create<T extends TableName>(table: T, data: Insert<T>): Promise<Row<T>> {
    const result = await this.adapter.execute(this.insertCommand(table, data, false))
    if (result.rows.length !== 1) throw new DatabaseError('DB_PROTOCOL', 'Insert did not return one row')
    return decodeRow(table, result.rows[0]!)
  }
  async upsertByUid<T extends TableName>(table: T, data: Insert<T> & { uid: string }): Promise<Row<T>> {
    const result = await this.adapter.execute(this.insertCommand(table, data, true))
    if (result.rows.length !== 1) throw new DatabaseError('DB_PROTOCOL', 'Merge did not return one row')
    return decodeRow(table, result.rows[0]!)
  }
  async findByUid<T extends TableName>(table: T, uid: string): Promise<Row<T> | null> {
    const value = encodeValue(columnSpec(table, 'uid'), uid)
    const result = await this.adapter.execute(read(`SELECT * FROM ${identifier(table)} WHERE "uid" = ? LIMIT 1`, [value]))
    return result.rows[0] ? decodeRow(table, result.rows[0]) : null
  }
  async findByUids<T extends TableName>(table: T, uids: readonly string[]): Promise<Row<T>[]> {
    return this.lookup(table, 'uid', uids)
  }
  async lookup<T extends TableName>(table: T, field: string, keys: readonly string[]): Promise<Row<T>[]> {
    if (!['uid', 'object_key', 'slug', 'key'].includes(field)) throw new DatabaseError('DB_INPUT', 'Bulk lookup requires a supported unique key')
    const ordered = uniqueKeys(keys), commands = buildLookupCommands(table, field, ordered)
    if (commands.length === 0) return []
    const results = await this.adapter.batch(commands)
    const rows = results.flatMap(result => result.rows), byKey = new Map(rows.map(row => [String(row[field]), row]))
    return ordered.flatMap(key => { const row = byKey.get(key); return row ? [decodeRow(table, row)] : [] })
  }
  async list<T extends TableName>(table: T, query: ListQuery = {}): Promise<Page<Row<T>>> {
    const plan = buildListPlan(table, query)
    const results = await this.adapter.batch([plan.data, plan.count])
    const total = safeInteger(results[1]?.rows[0]?.total, 'total')
    const items = results[0]!.rows.map(row => decodeRow(table, row))
    return { items, total, limit: plan.limit, offset: plan.offset, hasMore: plan.offset + items.length < total }
  }
  async updateByUid<T extends TableName>(table: T, uid: string, patch: Patch<T>, options: UpdateOptions = {}): Promise<Row<T>> {
    const values = this.values(table, patch as Record<string, unknown>, 'update')
    if (Object.keys(values).length === 0) throw new DatabaseError('DB_INPUT', 'Empty update is not allowed')
    const nextTimestamp = this.clock(options.expectedUpdatedAt)
    const assignments = Object.keys(values).map(field => `${identifier(field)} = ?`)
    // Resolve against the stored value in the same statement, including non-CAS writes.
    assignments.push(`"updated_at" = CASE WHEN "updated_at" >= ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0.001 seconds') ELSE ? END`)
    const params = [...Object.values(values), nextTimestamp, nextTimestamp, encodeValue(columnSpec(table, 'uid'), uid)]
    let where = '"uid" = ?'
    if (options.expectedUpdatedAt !== undefined) { where += ' AND "updated_at" = ?'; params.push(timestamp(options.expectedUpdatedAt)) }
    const result = await this.adapter.execute(write(`UPDATE ${identifier(table)} SET ${assignments.join(', ')} WHERE ${where} RETURNING *`, params, true))
    if (!result.rows[0]) throw new DatabaseError(options.expectedUpdatedAt === undefined ? 'DB_NOT_FOUND' : 'DB_CONFLICT', 'Record is missing or has changed')
    return decodeRow(table, result.rows[0])
  }
  async deleteByUid<T extends TableName>(table: T, uid: string): Promise<boolean> {
    if (!tableSpec(table).deletable) throw new DatabaseError('DB_FORBIDDEN', 'Deletion requires a dedicated domain service')
    const value = encodeValue(columnSpec(table, 'uid'), uid)
    const result = await this.adapter.execute(write(`DELETE FROM ${identifier(table)} WHERE "uid" = ?`, [value]))
    return result.changes > 0
  }
  async mediaByKeys(keys: readonly string[]): Promise<Row<'media_assets'>[]> { return this.lookup('media_assets', 'object_key', keys) }
}
export type DatabaseRecord = RawRow
