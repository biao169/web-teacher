import { DatabaseError } from './errors'
import { validateSingleStatement } from './statement'

export type SqlValue = string | number | null
export type RawRow = Record<string, SqlValue>
export interface SqlCommand {
  readonly sql: string
  readonly params: readonly SqlValue[]
  readonly mode: 'rows' | 'run'
  readonly write: boolean
}
export interface QueryResult {
  rows: RawRow[]
  changes: number
  lastInsertRowid: number | null
}
export interface DatabaseMetrics { calls: number; statements: number }
export interface DatabaseAdapter {
  readonly kind: 'sqlite' | 'd1'
  readonly metrics: DatabaseMetrics
  execute(command: SqlCommand): Promise<QueryResult>
  /** One atomic group. No interactive callback or await inside a transaction. */
  batch(commands: readonly SqlCommand[]): Promise<QueryResult[]>
}
export const DATABASE_LIMITS = Object.freeze({
  parameters: 100,
  sqlBytes: 100_000,
  batchStatements: 50,
  textBytes: 1_000_000,
  boundBytes: 1_900_000,
  pageSize: 100,
  maxOffset: 10_000,
  bulkKeys: 1_000,
  keyChunk: 90,
})
const encoder = new TextEncoder()

export function validateCommand(command: SqlCommand): void {
  if (typeof command.sql !== 'string' || !command.sql.trim()) throw new DatabaseError('DB_INPUT', 'SQL is required')
  if (encoder.encode(command.sql).byteLength > DATABASE_LIMITS.sqlBytes) throw new DatabaseError('DB_LIMIT', 'SQL exceeds the byte budget')
  validateSingleStatement(command.sql)
  if (!Array.isArray(command.params) || command.params.length > DATABASE_LIMITS.parameters) throw new DatabaseError('DB_LIMIT', 'Too many bound parameters')
  if (!['rows', 'run'].includes(command.mode) || typeof command.write !== 'boolean') throw new DatabaseError('DB_INPUT', 'Invalid command mode')
  let bytes = 0
  for (const value of command.params) {
    if (value === null) continue
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new DatabaseError('DB_INPUT', 'Invalid numeric parameter')
      bytes += 8
    }
    else if (typeof value === 'string') {
      const size = encoder.encode(value).byteLength
      if (size > DATABASE_LIMITS.textBytes) throw new DatabaseError('DB_LIMIT', 'Text exceeds the byte budget')
      bytes += size
    }
    else throw new DatabaseError('DB_INPUT', 'Parameters must be string, number or null')
  }
  if (bytes > DATABASE_LIMITS.boundBytes) throw new DatabaseError('DB_LIMIT', 'Parameters exceed the row byte budget')
}
export function validateBatch(commands: readonly SqlCommand[]): void {
  if (commands.length > DATABASE_LIMITS.batchStatements) throw new DatabaseError('DB_LIMIT', 'Too many statements in one atomic batch')
  commands.forEach(validateCommand)
}
export function safeInteger(value: unknown, field: string): number {
  const number = typeof value === 'bigint' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isSafeInteger(number)) throw new DatabaseError('DB_PROTOCOL', `Invalid integer result: ${field}`)
  return number
}
export function normalizeRows(rows: unknown): RawRow[] {
  if (!Array.isArray(rows)) throw new DatabaseError('DB_PROTOCOL', 'Database did not return rows')
  return rows.map((row: unknown) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) throw new DatabaseError('DB_PROTOCOL', 'Invalid database row')
    const normalized: RawRow = {}
    for (const [key, value] of Object.entries(row)) {
      if (value === null || typeof value === 'string') normalized[key] = value
      else if (typeof value === 'bigint') normalized[key] = safeInteger(value, key)
      else if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) normalized[key] = value
      else throw new DatabaseError('DB_PROTOCOL', 'Unsupported database result value')
    }
    return normalized
  })
}
