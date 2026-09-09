import { type DatabaseAdapter, type DatabaseMetrics, type QueryResult, type SqlCommand, type SqlValue, normalizeRows, safeInteger, validateBatch, validateCommand } from '../contracts'
import { DatabaseError, databaseError } from '../errors'

/** Structural subset implemented by better-sqlite3; no native import in shared code. */
export interface SyncStatement {
  all(...params: SqlValue[]): unknown[]
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint }
}
export interface SyncConnection {
  prepare(sql: string): SyncStatement
  exec(sql: string): unknown
  readonly inTransaction: boolean
}

export class SqliteAdapter implements DatabaseAdapter {
  readonly kind = 'sqlite' as const
  readonly metrics: DatabaseMetrics = { calls: 0, statements: 0 }
  private readonly statements = new Map<string, SyncStatement>()
  constructor(private readonly connection: SyncConnection, private readonly maxCachedStatements = 64) {
    if (!Number.isInteger(maxCachedStatements) || maxCachedStatements < 0 || maxCachedStatements > 512) throw new DatabaseError('DB_INPUT', 'Invalid statement cache limit')
  }
  private prepare(sql: string): SyncStatement {
    const existing = this.statements.get(sql)
    if (existing) { this.statements.delete(sql); this.statements.set(sql, existing); return existing }
    const statement = this.connection.prepare(sql)
    if (this.maxCachedStatements > 0) {
      this.statements.set(sql, statement)
      while (this.statements.size > this.maxCachedStatements) this.statements.delete(this.statements.keys().next().value!)
    }
    return statement
  }
  clearStatementCache(): void { this.statements.clear() }
  private perform(command: SqlCommand): QueryResult {
    const statement = this.prepare(command.sql)
    if (command.mode === 'rows') {
      const rows = normalizeRows(statement.all(...command.params))
      return { rows, changes: command.write ? rows.length : 0, lastInsertRowid: null }
    }
    const result = statement.run(...command.params)
    return { rows: [], changes: safeInteger(result.changes, 'changes'), lastInsertRowid: safeInteger(result.lastInsertRowid, 'lastInsertRowid') }
  }
  async execute(command: SqlCommand): Promise<QueryResult> {
    validateCommand(command)
    this.metrics.calls += 1; this.metrics.statements += 1
    try { return this.perform(command) }
    catch (error) { throw databaseError(error) }
  }
  async batch(commands: readonly SqlCommand[]): Promise<QueryResult[]> {
    validateBatch(commands)
    if (commands.length === 0) return []
    if (this.connection.inTransaction) throw new DatabaseError('DB_TRANSACTION', 'Nested adapter transactions are not supported')
    this.metrics.calls += 1; this.metrics.statements += commands.length
    try {
      this.connection.exec(commands.some(command => command.write) ? 'BEGIN IMMEDIATE' : 'BEGIN')
      const results = commands.map(command => this.perform(command))
      this.connection.exec('COMMIT')
      return results
    }
    catch (error) {
      if (this.connection.inTransaction) this.connection.exec('ROLLBACK')
      throw databaseError(error)
    }
  }
}
