import { buildAuditCommand } from '../../audit/commands'
import { cacheTagsForMutation } from '../../cache/invalidation-map'
import { decodeRow, encodeValue, identifier, timestamp } from '../../../db/codec'
import * as codecModule from '../../../db/codec'
import type { DatabaseAdapter, QueryResult, RawRow, SqlCommand, SqlValue } from '../../../db/contracts'
import { safeInteger } from '../../../db/contracts'
import type { Row } from '../../../db/models'
import { buildListPlan, read, write } from '../../../db/query'
import { ADMIN_CONTENT_BATCH_LIMIT, type AdminContentModuleDefinition, type AdminContentValue, type AdminContentValues } from '../../../shared/admin/content-modules'
import type { AdminContentDetailView, AdminContentListItem, AdminFacetOption } from '../../../shared/contracts/admin-content'
import { normalizeAdminUid } from '../../../shared/admin/identity'
import type { AuthenticatedPrincipal } from '../../security/permissions'
import { AdminContentError } from './content-errors'
import { ADMIN_FACET_LIMIT, type ParsedAdminContentQuery, toRepositoryListQuery } from './content-query'

const encoder = new TextEncoder()
export const ADMIN_BATCH_LIMIT = ADMIN_CONTENT_BATCH_LIMIT

export interface AdminContentStoreOptions {
  readonly now?: () => Date
  readonly newUid?: () => string
}

function requiredText(value: unknown, field: string, maximum = 2048): string {
  if (typeof value !== 'string' || !value || encoder.encode(value).byteLength > maximum) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', `Invalid database field: ${field}`)
  return value
}

function normalizedAt(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', 'Admin content clock is invalid')
  return value.toISOString()
}

function valueForView(value: unknown, field: string): AdminContentValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return value
  throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', `Unsupported view value: ${field}`)
}

function projectedValues(definition: AdminContentModuleDefinition, row: Record<string, unknown>, detail: boolean): AdminContentValues {
  const selected = new Set(detail ? definition.fields.map(field => field.name) : definition.columns.map(column => column.field))
  const values: Record<string, AdminContentValue> = Object.create(null) as Record<string, AdminContentValue>
  for (const field of selected) {
    if (!Object.hasOwn(row, field)) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', `Database row is missing ${field}`)
    values[field] = valueForView(row[field], field)
  }
  return Object.freeze(values)
}

function decodeProjectedRow(definition: AdminContentModuleDefinition, raw: RawRow): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const [field, stored] of Object.entries(raw)) {
    const column = codecModule.columnSpec(definition.table, field)
    let value: unknown = stored
    if (stored !== null && column.kind === 'boolean') {
      if (stored !== 0 && stored !== 1) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', `Invalid stored boolean: ${field}`)
      value = stored === 1
    }
    else if (stored !== null && column.kind === 'json') {
      if (typeof stored !== 'string') throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', `Invalid stored JSON: ${field}`)
      try { value = JSON.parse(stored) as unknown }
      catch (error) { throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', `Invalid stored JSON: ${field}`, { cause: error }) }
    }
    try { encodeValue(column, value) }
    catch (error) { throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', `Stored field violates the database contract: ${field}`, { cause: error }) }
    result[field] = value
  }
  return result
}

function listItem(definition: AdminContentModuleDefinition, record: Record<string, unknown>): AdminContentListItem {
  return Object.freeze({
    uid: requiredText(record.uid, 'uid', 256),
    createdAt: timestamp(requiredText(record.created_at, 'created_at', 64)),
    updatedAt: timestamp(requiredText(record.updated_at, 'updated_at', 64)),
    values: projectedValues(definition, record, false),
  })
}

function detailView(definition: AdminContentModuleDefinition, row: Row<AdminContentModuleDefinition['table']>, permissions: AdminContentDetailView['permissions']): AdminContentDetailView {
  const record = row as unknown as Record<string, unknown>
  return Object.freeze({
    module: definition.module,
    uid: requiredText(record.uid, 'uid', 256),
    createdAt: timestamp(requiredText(record.created_at, 'created_at', 64)),
    updatedAt: timestamp(requiredText(record.updated_at, 'updated_at', 64)),
    values: projectedValues(definition, record, true),
    permissions,
  })
}

function facetCommand(definition: AdminContentModuleDefinition, field: string): SqlCommand {
  const table = identifier(definition.table)
  const column = identifier(field)
  return read(`SELECT ${column} AS value, count(*) AS total FROM ${table} WHERE ${column} IS NOT NULL AND trim(CAST(${column} AS TEXT)) <> '' GROUP BY ${column} ORDER BY total DESC, ${column} ASC LIMIT ?`, [ADMIN_FACET_LIMIT])
}

function parseFacetRows(rows: readonly RawRow[], field: string): readonly AdminFacetOption[] {
  if (rows.length > ADMIN_FACET_LIMIT) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', `Facet result exceeded its budget: ${field}`)
  const seen = new Set<string>()
  return Object.freeze(rows.map(row => {
    const raw = row.value
    const value = typeof raw === 'number' ? String(raw) : requiredText(raw, field, 1024)
    if (seen.has(value)) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', `Facet returned duplicate value: ${field}`)
    seen.add(value)
    return Object.freeze({ value, label: value, count: safeInteger(row.total, `${field}.total`) })
  }))
}

function permissionsFor(principal: AuthenticatedPrincipal, definition: AdminContentModuleDefinition): AdminContentDetailView['permissions'] {
  const grant = principal.permissions[definition.module]
  return Object.freeze({
    create: definition.canCreate && grant.create,
    edit: grant.edit,
    delete: definition.canDelete && grant.delete,
    export: grant.export,
  })
}

function monotonicTimestampSql(): string {
  return `CASE WHEN "updated_at" >= ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0.001 seconds') ELSE ? END`
}

function createCommand(definition: AdminContentModuleDefinition, uid: string, values: Readonly<Record<string, AdminContentValue>>, at: string): SqlCommand {
  const fields = ['uid', 'created_at', 'updated_at', ...Object.keys(values)]
  const params: SqlValue[] = [uid, at, at]
  for (const [field, value] of Object.entries(values)) params.push(encodeValue(codecModule.columnSpec(definition.table, field), value))
  return write(`INSERT INTO ${identifier(definition.table)} (${fields.map(identifier).join(', ')}) VALUES (${fields.map(() => '?').join(', ')}) RETURNING *`, params, true)
}

function updateCommand(definition: AdminContentModuleDefinition, uid: string, expectedUpdatedAt: string, values: Readonly<Record<string, AdminContentValue>>, at: string, guardUid: string): SqlCommand {
  const assignments: string[] = []
  const params: SqlValue[] = []
  for (const [field, value] of Object.entries(values)) {
    assignments.push(`${identifier(field)} = ?`)
    params.push(encodeValue(codecModule.columnSpec(definition.table, field), value))
  }
  assignments.push(`"updated_at" = ${monotonicTimestampSql()}`)
  params.push(at, at, uid, expectedUpdatedAt, guardUid)
  return write(`UPDATE ${identifier(definition.table)} SET ${assignments.join(', ')} WHERE "uid" = ? AND "updated_at" = ? AND EXISTS (SELECT 1 FROM admin_mutation_guards WHERE uid = ?) RETURNING *`, params, true)
}

function guardInsertCommand(definition: AdminContentModuleDefinition, guardUid: string, targetUid: string, expectedUpdatedAt: string, at: string): SqlCommand {
  return write(`INSERT INTO admin_mutation_guards (uid, module, target_uid, expected_updated_at, created_at)
    SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM ${identifier(definition.table)} WHERE uid = ? AND updated_at = ?)`,
  [guardUid, definition.module, targetUid, expectedUpdatedAt, at, targetUid, expectedUpdatedAt])
}

function batchGuardInsertCommand(definition: AdminContentModuleDefinition, guardUid: string, uids: readonly string[], versions: Readonly<Record<string, string>>, at: string): SqlCommand {
  const predicates: string[] = []
  const params: SqlValue[] = [guardUid, definition.module, '*', at, at]
  for (const uid of uids) {
    predicates.push('(uid = ? AND updated_at = ?)')
    params.push(uid, versions[uid]!)
  }
  params.push(uids.length)
  return write(`INSERT INTO admin_mutation_guards (uid, module, target_uid, expected_updated_at, created_at)
    SELECT ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM ${identifier(definition.table)} WHERE ${predicates.join(' OR ')}) = ?`, params)
}

function batchUpdateCommand(definition: AdminContentModuleDefinition, guardUid: string, uids: readonly string[], values: Readonly<Record<string, AdminContentValue>>, at: string): SqlCommand {
  const assignments: string[] = []
  const params: SqlValue[] = []
  for (const [field, value] of Object.entries(values)) {
    assignments.push(`${identifier(field)} = ?`)
    params.push(encodeValue(codecModule.columnSpec(definition.table, field), value))
  }
  assignments.push(`"updated_at" = ${monotonicTimestampSql()}`)
  params.push(at, at, ...uids, guardUid)
  return write(`UPDATE ${identifier(definition.table)} SET ${assignments.join(', ')} WHERE uid IN (${uids.map(() => '?').join(', ')}) AND EXISTS (SELECT 1 FROM admin_mutation_guards WHERE uid = ?) RETURNING uid`, params, true)
}

function deleteCommand(definition: AdminContentModuleDefinition, uid: string, expectedUpdatedAt: string, guardUid: string): SqlCommand {
  return write(`DELETE FROM ${identifier(definition.table)} WHERE uid = ? AND updated_at = ? AND EXISTS (SELECT 1 FROM admin_mutation_guards WHERE uid = ?) RETURNING uid`, [uid, expectedUpdatedAt, guardUid], true)
}

function generationCommand(tag: string, at: string, guardUid?: string): SqlCommand {
  const source = guardUid === undefined ? 'VALUES (?, 1, ?)' : 'SELECT ?, 1, ? WHERE EXISTS (SELECT 1 FROM admin_mutation_guards WHERE uid = ?)'
  const params: SqlValue[] = guardUid === undefined ? [tag, at] : [tag, at, guardUid]
  return write(`INSERT INTO cache_generations (tag, generation, updated_at) ${source}
    ON CONFLICT(tag) DO UPDATE SET generation = cache_generations.generation + 1,
      updated_at = CASE WHEN cache_generations.updated_at >= excluded.updated_at
        THEN strftime('%Y-%m-%dT%H:%M:%fZ', cache_generations.updated_at, '+0.001 seconds') ELSE excluded.updated_at END
    RETURNING tag, generation`, params, true)
}

function cleanupGuardCommand(guardUid: string): SqlCommand { return write('DELETE FROM admin_mutation_guards WHERE uid = ?', [guardUid]) }
function guardCondition(guardUid: string): { sql: string; params: readonly SqlValue[] } { return { sql: 'EXISTS (SELECT 1 FROM admin_mutation_guards WHERE uid = ?)', params: [guardUid] } }

function assertMutationResults(results: readonly QueryResult[], expectedCacheRows: number, guarded: boolean, expectedRows = 1): void {
  const mutationIndex = guarded ? 1 : 0
  if (guarded && results[0]?.changes !== 1) throw new AdminContentError('ADMIN_CONTENT_CONFLICT')
  const mutation = results[mutationIndex]
  if (!mutation || mutation.rows.length !== expectedRows) throw new AdminContentError(guarded ? 'ADMIN_CONTENT_CONFLICT' : 'ADMIN_CONTENT_PROTOCOL', 'Mutation result count mismatch')
  const audit = results[mutationIndex + 1]
  if (!audit || audit.changes !== 1) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', 'Audit write did not complete')
  const cacheStart = mutationIndex + 2
  for (let index = 0; index < expectedCacheRows; index += 1) {
    if (results[cacheStart + index]?.rows.length !== 1) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', 'Cache generation write did not complete')
  }
  if (guarded && results.at(-1)?.changes !== 1) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', 'Mutation guard was not cleaned up')
}

export class AdminContentStore {
  private readonly now: () => Date
  private readonly newUid: () => string
  constructor(private readonly adapter: DatabaseAdapter, options: AdminContentStoreOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.newUid = options.newUid ?? (() => crypto.randomUUID())
  }

  async list(definition: AdminContentModuleDefinition, query: ParsedAdminContentQuery, principal: AuthenticatedPrincipal): Promise<{
    items: readonly AdminContentListItem[]
    total: number
    facets: Readonly<Record<string, readonly AdminFacetOption[]>>
    permissions: AdminContentDetailView['permissions']
  }> {
    const projection = [...new Set(['uid', 'created_at', 'updated_at', ...definition.columns.map(column => column.field)])]
    const plan = buildListPlan(definition.table, { ...toRepositoryListQuery(query), select: projection })
    const dynamic = definition.filters.filter(filter => filter.dynamic)
    const commands = [plan.data, plan.count, ...dynamic.map(filter => facetCommand(definition, filter.field))]
    const results = await this.adapter.batch(commands)
    if (results.length !== commands.length) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', 'List batch result count mismatch')
    const total = safeInteger(results[1]?.rows[0]?.total, 'total')
    const items = Object.freeze(results[0]!.rows.map(row => listItem(definition, decodeProjectedRow(definition, row))))
    const facets: Record<string, readonly AdminFacetOption[]> = Object.create(null) as Record<string, readonly AdminFacetOption[]>
    dynamic.forEach((filter, index) => { facets[filter.field] = parseFacetRows(results[index + 2]!.rows, filter.field) })
    return Object.freeze({ items, total, facets: Object.freeze(facets), permissions: permissionsFor(principal, definition) })
  }

  async find(definition: AdminContentModuleDefinition, uid: string, principal: AuthenticatedPrincipal): Promise<AdminContentDetailView | null> {
    const result = await this.adapter.execute(read(`SELECT * FROM ${identifier(definition.table)} WHERE uid = ? LIMIT 1`, [uid]))
    if (!result.rows[0]) return null
    return detailView(definition, decodeRow(definition.table, result.rows[0]), permissionsFor(principal, definition))
  }

  async create(definition: AdminContentModuleDefinition, values: Readonly<Record<string, AdminContentValue>>, principal: AuthenticatedPrincipal, requestedUid?: string): Promise<AdminContentDetailView> {
    const at = normalizedAt(this.now())
    const uid = requestedUid === undefined ? normalizeAdminUid(`${definition.module}:${this.newUid()}`) : normalizeAdminUid(requestedUid)
    if (encoder.encode(uid).byteLength > 128) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', 'Generated UID exceeds database limit')
    const tags = await cacheTagsForMutation({ module: definition.module, uid })
    const commands: SqlCommand[] = [
      createCommand(definition, uid, values, at),
      buildAuditCommand({ uid: `audit:${this.newUid()}`, at, actor: { uid: principal.userUid, name: principal.displayName ?? principal.username }, action: 'create', module: definition.module, targetUid: uid, summary: `创建${definition.singularTitle}`, detail: { fields: Object.keys(values) }, status: 'success' }),
      ...tags.map(tag => generationCommand(tag, at)),
    ]
    const results = await this.adapter.batch(commands)
    assertMutationResults(results, tags.length, false)
    return detailView(definition, decodeRow(definition.table, results[0]!.rows[0]!), permissionsFor(principal, definition))
  }

  async update(definition: AdminContentModuleDefinition, uid: string, expectedUpdatedAt: string, values: Readonly<Record<string, AdminContentValue>>, principal: AuthenticatedPrincipal): Promise<AdminContentDetailView> {
    const at = normalizedAt(this.now())
    const expected = timestamp(expectedUpdatedAt)
    const guardUid = `guard:${this.newUid()}`
    const tags = await cacheTagsForMutation({ module: definition.module, uid })
    const commands: SqlCommand[] = [
      guardInsertCommand(definition, guardUid, uid, expected, at),
      updateCommand(definition, uid, expected, values, at, guardUid),
      buildAuditCommand({ uid: `audit:${this.newUid()}`, at, actor: { uid: principal.userUid, name: principal.displayName ?? principal.username }, action: 'update', module: definition.module, targetUid: uid, summary: `更新${definition.singularTitle}`, detail: { fields: Object.keys(values), expectedUpdatedAt: expected }, status: 'success', condition: guardCondition(guardUid) }),
      ...tags.map(tag => generationCommand(tag, at, guardUid)),
      cleanupGuardCommand(guardUid),
    ]
    const results = await this.adapter.batch(commands)
    assertMutationResults(results, tags.length, true)
    return detailView(definition, decodeRow(definition.table, results[1]!.rows[0]!), permissionsFor(principal, definition))
  }

  async delete(definition: AdminContentModuleDefinition, uid: string, expectedUpdatedAt: string, principal: AuthenticatedPrincipal): Promise<void> {
    const at = normalizedAt(this.now())
    const expected = timestamp(expectedUpdatedAt)
    const guardUid = `guard:${this.newUid()}`
    const tags = await cacheTagsForMutation({ module: definition.module, uid })
    const commands: SqlCommand[] = [
      guardInsertCommand(definition, guardUid, uid, expected, at),
      deleteCommand(definition, uid, expected, guardUid),
      buildAuditCommand({ uid: `audit:${this.newUid()}`, at, actor: { uid: principal.userUid, name: principal.displayName ?? principal.username }, action: 'delete', module: definition.module, targetUid: uid, summary: `删除${definition.singularTitle}`, detail: { expectedUpdatedAt: expected }, status: 'success', condition: guardCondition(guardUid) }),
      ...tags.map(tag => generationCommand(tag, at, guardUid)),
      cleanupGuardCommand(guardUid),
    ]
    const results = await this.adapter.batch(commands)
    assertMutationResults(results, tags.length, true)
  }

  async batchUpdate(definition: AdminContentModuleDefinition, uids: readonly string[], versions: Readonly<Record<string, string>>, values: Readonly<Record<string, AdminContentValue>>, principal: AuthenticatedPrincipal): Promise<number> {
    const at = normalizedAt(this.now())
    const guardUid = `guard:${this.newUid()}`
    const tags = await cacheTagsForMutation({ module: definition.module })
    const commands: SqlCommand[] = [
      batchGuardInsertCommand(definition, guardUid, uids, versions, at),
      batchUpdateCommand(definition, guardUid, uids, values, at),
      buildAuditCommand({ uid: `audit:${this.newUid()}`, at, actor: { uid: principal.userUid, name: principal.displayName ?? principal.username }, action: 'batch_update', module: definition.module, summary: `批量更新${definition.title}`, detail: { count: uids.length, fields: Object.keys(values) }, status: 'success', condition: guardCondition(guardUid) }),
      ...tags.map(tag => generationCommand(tag, at, guardUid)),
      cleanupGuardCommand(guardUid),
    ]
    const results = await this.adapter.batch(commands)
    assertMutationResults(results, tags.length, true, uids.length)
    return uids.length
  }
}
