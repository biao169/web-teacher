import type { H3Event } from 'h3'
import { getPlatformDatabase } from '#database-platform'
import type { DatabaseAdapter, QueryResult, SqlValue as CoreSqlValue } from '../../../db/contracts'
import { read, write } from '../../../db/query'

export type SqlValue = CoreSqlValue
export interface SqlOperation { sql: string; params?: readonly SqlValue[]; expectChanges?: number | { min?: number; max?: number } }
export interface SqlRunResult { changes: number; lastInsertRowid?: number }
export interface SqlAdapter {
  readonly kind: 'd1' | 'sqlite'
  all<T extends Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T[]>
  first<T extends Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T | null>
  run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult>
  batch(operations: readonly SqlOperation[]): Promise<SqlRunResult[]>
}

function checkExpectation(result: SqlRunResult, expected: SqlOperation['expectChanges']): void {
  if (expected === undefined) return
  if (typeof expected === 'number') {
    if (result.changes !== expected) throw new Error(`SQL_EXPECTED_CHANGES:${expected}:${result.changes}`)
    return
  }
  if (expected.min !== undefined && result.changes < expected.min) throw new Error(`SQL_MIN_CHANGES:${expected.min}:${result.changes}`)
  if (expected.max !== undefined && result.changes > expected.max) throw new Error(`SQL_MAX_CHANGES:${expected.max}:${result.changes}`)
}

function runResult(value: QueryResult): SqlRunResult {
  return value.lastInsertRowid === null
    ? { changes: value.changes }
    : { changes: value.changes, lastInsertRowid: value.lastInsertRowid }
}

/**
 * Preserve the focused complete-admin service API while delegating all SQL to
 * the build-selected database adapter. Node uses its native driver and
 * Cloudflare uses D1 without bundling both platform implementations together.
 */
function serviceAdapter(database: DatabaseAdapter): SqlAdapter {
  return {
    kind: database.kind,
    async all<T extends Record<string, unknown>>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
      return (await database.execute(read(sql, params))).rows as T[]
    },
    async first<T extends Record<string, unknown>>(sql: string, params: readonly SqlValue[] = []): Promise<T | null> {
      return ((await database.execute(read(sql, params))).rows[0] as T | undefined) ?? null
    },
    async run(sql: string, params: readonly SqlValue[] = []): Promise<SqlRunResult> {
      return runResult(await database.execute(write(sql, params)))
    },
    async batch(operations: readonly SqlOperation[]): Promise<SqlRunResult[]> {
      const results = await database.batch(operations.map(operation => write(operation.sql, operation.params ?? [])))
      const output = results.map(runResult)
      output.forEach((result, index) => checkExpectation(result, operations[index]?.expectChanges))
      return output
    },
  }
}

export async function resolveAdminDatabase(event: H3Event): Promise<SqlAdapter> {
  return serviceAdapter(getPlatformDatabase(event).adapter)
}
