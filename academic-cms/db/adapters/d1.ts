import { type DatabaseAdapter, type DatabaseMetrics, type QueryResult, type SqlCommand, type SqlValue, normalizeRows, safeInteger, validateBatch, validateCommand } from '../contracts'
import { DatabaseError, databaseError } from '../errors'
import { normalizeSingleStatement } from '../statement'

/** Accepts a D1 binding or a request-scoped D1 session. */
export interface D1ResultLike {
  success: boolean
  results?: unknown[]
  error?: string
  meta?: { changes?: number; last_row_id?: number }
}
export interface D1StatementLike {
  bind(...params: SqlValue[]): D1StatementLike
  all(): Promise<D1ResultLike>
  run(): Promise<D1ResultLike>
}
export interface D1BindingLike {
  prepare(sql: string): D1StatementLike
  batch(statements: D1StatementLike[]): Promise<D1ResultLike[]>
}
function normalizeResult(result: D1ResultLike, command: SqlCommand): QueryResult {
  if (!result || result.success !== true) throw databaseError(new Error(result?.error ?? 'D1 returned an unsuccessful result'))
  const rows = command.mode === 'rows' ? normalizeRows(result.results) : []
  const changes = result.meta?.changes === undefined ? (command.write ? rows.length : 0) : safeInteger(result.meta.changes, 'changes')
  return { rows, changes, lastInsertRowid: command.mode === 'rows' || result.meta?.last_row_id === undefined ? null : safeInteger(result.meta.last_row_id, 'last_row_id') }
}
export class D1Adapter implements DatabaseAdapter {
  readonly kind = 'd1' as const
  readonly metrics: DatabaseMetrics = { calls: 0, statements: 0 }
  constructor(private readonly binding: D1BindingLike) {}
  private prepare(command: SqlCommand): D1StatementLike {
    // D1 rejects otherwise valid statements wrapped in leading/trailing comments.
    // Reuse the shared single-statement scanner so both adapters execute the same SQL.
    const statement = this.binding.prepare(normalizeSingleStatement(command.sql))
    return command.params.length ? statement.bind(...command.params) : statement
  }
  async execute(command: SqlCommand): Promise<QueryResult> {
    validateCommand(command)
    this.metrics.calls += 1; this.metrics.statements += 1
    try {
      const statement = this.prepare(command)
      return normalizeResult(await (command.mode === 'rows' ? statement.all() : statement.run()), command)
    }
    catch (error) { throw databaseError(error) }
  }
  async batch(commands: readonly SqlCommand[]): Promise<QueryResult[]> {
    validateBatch(commands)
    if (commands.length === 0) return []
    this.metrics.calls += 1; this.metrics.statements += commands.length
    try {
      const results = await this.binding.batch(commands.map(command => this.prepare(command)))
      if (!Array.isArray(results) || results.length !== commands.length) throw new DatabaseError('DB_PROTOCOL', 'D1 batch result count mismatch')
      return results.map((result, index) => normalizeResult(result, commands[index]!))
    }
    catch (error) { throw databaseError(error) }
  }
}
