import { catalog } from './catalog'
import type { Row, TableName } from './models'
import type { ColumnSpec, TableSpec } from './schema-types'
import { DATABASE_LIMITS, type RawRow, type SqlValue } from './contracts'
import { DatabaseError } from './errors'

export function tableSpec(table: TableName): TableSpec {
  if (!Object.hasOwn(catalog, table)) throw new DatabaseError('DB_INPUT', 'Unknown table')
  return catalog[table]
}
export function columnSpec(table: TableName, field: string): ColumnSpec {
  const columns = tableSpec(table).columns
  if (!Object.hasOwn(columns, field)) throw new DatabaseError('DB_INPUT', 'Unknown field')
  return columns[field]!
}
export function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new DatabaseError('DB_INPUT', 'Invalid identifier')
  return `"${value}"`
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}
export function timestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new DatabaseError('DB_INPUT', 'Expected a canonical UTC timestamp')
  return value
}
/** Validate before stringify: serialization must not silently discard application data. */
function serializeJson(value: unknown): string {
  const active = new WeakSet<object>()
  let nodes = 0
  function visit(item: unknown, depth: number): void {
    if (++nodes > 10_000 || depth > 32) throw new DatabaseError('DB_LIMIT', 'JSON structure exceeds the complexity budget')
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new DatabaseError('DB_INPUT', 'JSON numbers must be finite')
      return
    }
    if (typeof item !== 'object') throw new DatabaseError('DB_INPUT', 'Unsupported JSON value')
    if (active.has(item)) throw new DatabaseError('DB_INPUT', 'Circular JSON is not supported')
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item)
    if (!array && prototype !== Object.prototype && prototype !== null) throw new DatabaseError('DB_INPUT', 'JSON objects must be plain objects')
    if (Object.getOwnPropertySymbols(item).length) throw new DatabaseError('DB_INPUT', 'JSON symbol keys are not supported')
    const descriptors = Object.getOwnPropertyDescriptors(item)
    if (array && Object.keys(descriptors).length !== item.length + 1) throw new DatabaseError('DB_INPUT', 'Sparse or extended JSON arrays are not supported')
    active.add(item)
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new DatabaseError('DB_INPUT', 'JSON accessors and hidden properties are not supported')
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) throw new DatabaseError('DB_INPUT', 'JSON array has unsupported properties')
      visit(descriptor.value, depth + 1)
    }
    active.delete(item)
  }
  visit(value, 0)
  const result = JSON.stringify(value)
  if (result === undefined) throw new DatabaseError('DB_INPUT', 'Invalid JSON value')
  if (new TextEncoder().encode(result).byteLength > DATABASE_LIMITS.textBytes) throw new DatabaseError('DB_LIMIT', 'JSON exceeds the byte budget')
  return result
}
export function encodeValue(column: ColumnSpec, value: unknown): SqlValue {
  if (value === null) {
    if (!column.nullable) throw new DatabaseError('DB_NOT_NULL', 'Required field cannot be null')
    return null
  }
  if (value === undefined) throw new DatabaseError('DB_INPUT', 'Undefined is not a database value')
  if (column.kind === 'boolean') {
    if (typeof value !== 'boolean') throw new DatabaseError('DB_INPUT', 'Expected a boolean')
    return value ? 1 : 0
  }
  if (column.kind === 'integer') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new DatabaseError('DB_INPUT', 'Expected a safe integer')
    if ((column.min !== undefined && value < column.min) || (column.max !== undefined && value > column.max)) throw new DatabaseError('DB_CHECK', 'Integer is outside the allowed range')
    return value
  }
  if (column.kind === 'json') {
    if (column.jsonType === 'array' && !Array.isArray(value)) throw new DatabaseError('DB_INPUT', 'Expected a JSON array')
    if (column.jsonType === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) throw new DatabaseError('DB_INPUT', 'Expected a JSON object')
    return serializeJson(value)
  }
  if (typeof value !== 'string') throw new DatabaseError('DB_INPUT', 'Expected a string')
  if (column.required && !value.trim()) throw new DatabaseError('DB_CHECK', 'Required text cannot be empty')
  if ((column.minLength !== undefined && [...value].length < column.minLength) || (column.maxLength !== undefined && [...value].length > column.maxLength)) throw new DatabaseError('DB_CHECK', 'Text length is outside the allowed range')
  if (new TextEncoder().encode(value).byteLength > DATABASE_LIMITS.textBytes) throw new DatabaseError('DB_LIMIT', 'Text is too large')
  if (column.enum && !column.enum.includes(value)) throw new DatabaseError('DB_CHECK', 'Unknown enum value')
  if (column.format === 'date' && !validDate(value)) throw new DatabaseError('DB_INPUT', 'Expected a valid calendar date')
  if (column.format === 'timestamp') timestamp(value)
  if (column.format === 'decimal' && !/^(0|[1-9]\d{0,17})(\.\d{1,4})?$/.test(value)) throw new DatabaseError('DB_INPUT', 'Expected a non-negative exact decimal string')
  return value
}
export function decodeRow<T extends TableName>(table: T, raw: RawRow): Row<T> {
  const row: Record<string, unknown> = {}
  for (const [field, column] of Object.entries(tableSpec(table).columns)) {
    if (!Object.hasOwn(raw, field)) throw new DatabaseError('DB_PROTOCOL', 'Incomplete database row')
    const stored = raw[field]
    let value: unknown = stored
    try {
      if (stored !== null && column.kind === 'boolean') {
        if (stored !== 0 && stored !== 1) throw new Error('Invalid stored boolean')
        value = stored === 1
      }
      else if (stored !== null && column.kind === 'json') {
        if (typeof stored !== 'string') throw new Error('Invalid stored JSON')
        value = JSON.parse(stored) as unknown
      }
      // Raw SQL/imports must meet the same field contract as Repository writes.
      encodeValue(column, value)
      row[field] = value
    }
    catch (error) { throw new DatabaseError('DB_PROTOCOL', 'Stored field violates the database contract', { cause: error }) }
  }
  return row as unknown as Row<T>
}
