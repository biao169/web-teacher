import { columnSpec, encodeValue, identifier, tableSpec } from './codec'
import { DATABASE_LIMITS, type SqlCommand, type SqlValue, validateCommand } from './contracts'
import { DatabaseError } from './errors'
import type { ColumnSpec } from './schema-types'
import type { TableName } from './models'

export type Filter = { field: string; op: 'eq' | 'ne' | 'gte' | 'lte' | 'in' | 'isNull' | 'contains'; value: unknown }
export interface Sort { field: string; direction: 'asc' | 'desc' }
export interface ListQuery { filters?: readonly Filter[]; sort?: readonly Sort[]; search?: string; limit?: number; offset?: number; select?: readonly string[] }
export interface ListPlan { data: SqlCommand; count: SqlCommand; limit: number; offset: number }
export function read(sql: string, params: readonly SqlValue[] = []): SqlCommand { return { sql, params, mode: 'rows', write: false } }
export function write(sql: string, params: readonly SqlValue[] = [], returning = false): SqlCommand { return { sql, params, mode: returning ? 'rows' : 'run', write: true } }

// Exact non-negative decimal ordering: fixed-width integer/fraction keys, never REAL.
function comparableField(column: ColumnSpec, field: string): string {
  if (column.format !== 'decimal') return field
  const whole = `CASE WHEN instr(${field}, '.') = 0 THEN ${field} ELSE substr(${field}, 1, instr(${field}, '.') - 1) END`
  const fraction = `CASE WHEN instr(${field}, '.') = 0 THEN '' ELSE substr(${field}, instr(${field}, '.') + 1) END`
  return `(CASE WHEN ${field} IS NULL THEN NULL ELSE replace(printf('%18s', ${whole}), ' ', '0') || substr((${fraction}) || '0000', 1, 4) END)`
}
function comparableValue(column: ColumnSpec, value: SqlValue): SqlValue {
  if (column.format !== 'decimal' || value === null) return value
  const [whole = '', fraction = ''] = String(value).split('.')
  return whole.padStart(18, '0') + fraction.padEnd(4, '0')
}

function predicate(table: TableName, filters: readonly Filter[], search?: string): { sql: string; params: SqlValue[] } {
  if (filters.length > 12) throw new DatabaseError('DB_LIMIT', 'Too many filters')
  const clauses: string[] = [], params: SqlValue[] = []
  for (const filter of filters) {
    const column = columnSpec(table, filter.field), field = comparableField(column, identifier(filter.field))
    if (filter.op === 'isNull') {
      if (typeof filter.value !== 'boolean') throw new DatabaseError('DB_INPUT', 'isNull expects a boolean')
      clauses.push(`${field} IS ${filter.value ? '' : 'NOT '}NULL`)
    }
    else if (filter.op === 'in') {
      if (!Array.isArray(filter.value)) throw new DatabaseError('DB_INPUT', 'IN expects an array')
      if (filter.value.length > DATABASE_LIMITS.parameters) throw new DatabaseError('DB_LIMIT', 'IN filter is too large')
      if (filter.value.length === 0) { clauses.push('0 = 1'); continue }
      const values = [...new Set(filter.value.map((value: unknown) => comparableValue(column, encodeValue(column, value))))]
      const nonNull = values.filter((value): value is string | number => value !== null)
      const parts: string[] = []
      if (nonNull.length) { parts.push(`${field} IN (${nonNull.map(() => '?').join(', ')})`); params.push(...nonNull) }
      if (values.includes(null)) parts.push(`${field} IS NULL`)
      clauses.push(`(${parts.join(' OR ')})`)
    }
    else if (filter.op === 'contains') {
      if (typeof filter.value !== 'string' || new TextEncoder().encode(filter.value).byteLength > 256) throw new DatabaseError('DB_INPUT', 'contains expects at most 256 UTF-8 bytes')
      clauses.push(`instr(lower(COALESCE(${identifier(filter.field)}, '')), lower(?)) > 0`)
      params.push(filter.value)
    }
    else if (['eq', 'ne', 'gte', 'lte'].includes(filter.op)) {
      const value = comparableValue(column, encodeValue(column, filter.value))
      if (value === null) {
        if (filter.op !== 'eq' && filter.op !== 'ne') throw new DatabaseError('DB_INPUT', 'NULL cannot be range compared')
        clauses.push(`${field} IS ${filter.op === 'ne' ? 'NOT ' : ''}NULL`)
      }
      else {
        const operators = { eq: '=', ne: '<>', gte: '>=', lte: '<=' } as const
        clauses.push(`${field} ${operators[filter.op as keyof typeof operators]} ?`)
        params.push(value)
      }
    }
    else throw new DatabaseError('DB_INPUT', 'Unknown filter operator')
  }
  if (search !== undefined) {
    if (typeof search !== 'string' || new TextEncoder().encode(search).byteLength > 256) throw new DatabaseError('DB_LIMIT', 'Search exceeds 256 UTF-8 bytes')
    const term = search.trim(), fields = tableSpec(table).search
    if (term && fields.length) {
      clauses.push(`(${fields.map(field => `instr(lower(COALESCE(${identifier(field)}, '')), lower(?)) > 0`).join(' OR ')})`)
      params.push(...fields.map(() => term))
    }
    else if (term) throw new DatabaseError('DB_INPUT', 'This table is not searchable')
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params }
}
export function buildListPlan(table: TableName, query: ListQuery = {}): ListPlan {
  const spec = tableSpec(table)
  const limit = query.limit ?? 20, offset = query.offset ?? 0
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DATABASE_LIMITS.pageSize) throw new DatabaseError('DB_LIMIT', 'Page size must be between 1 and 100')
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > DATABASE_LIMITS.maxOffset) throw new DatabaseError('DB_LIMIT', 'Offset is outside the supported range')
  const sort = [...(query.sort?.length ? query.sort : [{ field: Object.hasOwn(spec.columns, 'sort_order') ? 'sort_order' : 'id', direction: 'asc' as const }])]
  if (sort.length > 4) throw new DatabaseError('DB_LIMIT', 'Too many sort fields')
  if (!sort.some(item => item.field === 'id')) sort.push({ field: 'id', direction: 'asc' })
  for (const item of sort) {
    columnSpec(table, item.field)
    if (!['asc', 'desc'].includes(item.direction)) throw new DatabaseError('DB_INPUT', 'Invalid sort direction')
  }
  const where = predicate(table, query.filters ?? [], query.search)
  const order = sort.map(item => `${comparableField(columnSpec(table, item.field), identifier(item.field))} ${item.direction.toUpperCase()}`).join(', ')
  let projection = '*'
  if (query.select !== undefined) {
    if (!Array.isArray(query.select) || query.select.length < 1 || query.select.length > 64) throw new DatabaseError('DB_LIMIT', 'Invalid list projection')
    const fields = [...new Set(query.select)]
    if (fields.length !== query.select.length) throw new DatabaseError('DB_INPUT', 'List projection contains duplicate fields')
    for (const field of fields) columnSpec(table, field)
    projection = fields.map(identifier).join(', ')
  }
  const data = read(`SELECT ${projection} FROM ${identifier(table)}${where.sql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...where.params, limit, offset])
  const count = read(`SELECT count(*) AS total FROM ${identifier(table)}${where.sql}`, where.params)
  validateCommand(data); validateCommand(count)
  return { data, count, limit, offset }
}

export function uniqueKeys(keys: readonly string[]): string[] {
  if (!Array.isArray(keys) || keys.length > DATABASE_LIMITS.bulkKeys) throw new DatabaseError('DB_LIMIT', 'Too many lookup keys')
  for (const key of keys) if (typeof key !== 'string' || !key.trim() || new TextEncoder().encode(key).byteLength > 2048) throw new DatabaseError('DB_INPUT', 'Invalid lookup key')
  return [...new Set(keys)]
}
export function buildLookupCommands(table: TableName, field: string, keys: readonly string[]): SqlCommand[] {
  const column = columnSpec(table, field)
  const values = uniqueKeys(keys).map(key => encodeValue(column, key)), commands: SqlCommand[] = []
  for (let start = 0; start < values.length; start += DATABASE_LIMITS.keyChunk) {
    const chunk = values.slice(start, start + DATABASE_LIMITS.keyChunk)
    commands.push(read(`SELECT * FROM ${identifier(table)} WHERE ${identifier(field)} IN (${chunk.map(() => '?').join(', ')})`, chunk))
  }
  return commands
}
