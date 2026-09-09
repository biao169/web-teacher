import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations, applyMigrations } from '../../scripts/db/migrations.mjs'

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const require = createRequire(import.meta.url)
export const load = name => require(resolve(root, '.tmp/database-core', name))
export const core = {
  ...load('db/repository.js'), ...load('db/query.js'), ...load('db/contracts.js'),
  ...load('db/read-plans.js'), ...load('db/adapters/sqlite.js'), ...load('db/adapters/d1.js'),
}
export const migrations = await loadMigrations(resolve(root, 'migrations'))

/** Real SQLite storage behind a D1-shaped protocol TEST DOUBLE, not workerd. */
export class D1ProtocolDouble {
  constructor(db) { this.db = db }
  prepare(sql) {
    const db = this.db
    if (new TextEncoder().encode(sql).byteLength > 100_000) throw new Error('D1 SQL limit')
    const build = params => {
      const execute = () => {
        const statement = db.prepare(sql)
        const rows = statement.all(...params)
        const readOnly = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA)\b/i.test(sql)
        const meta = db.prepare('SELECT changes() changes, last_insert_rowid() last_row_id').get()
        return { success: true, results: rows, meta: { changes: readOnly ? 0 : Number(meta.changes), last_row_id: Number(meta.last_row_id) } }
      }
      return { bind: (...values) => { if (values.length > 100) throw new Error('D1 parameter limit'); return build(values) }, all: async () => execute(), run: async () => execute(), _execute: execute }
    }
    return build([])
  }
  async batch(statements) {
    try {
      this.db.exec('BEGIN IMMEDIATE')
      const results = statements.map(statement => statement._execute())
      this.db.exec('COMMIT'); return results
    }
    catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK')
      throw new Error('D1_ERROR: ' + error.message, { cause: error })
    }
  }
}
export function syncConnection(db) {
  return { prepare: sql => db.prepare(sql), exec: sql => db.exec(sql), get inTransaction() { return db.isTransaction } }
}
export function createHarness(kind = 'sqlite') {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const connection = syncConnection(db)
  applyMigrations(connection, migrations)
  const adapter = kind === 'sqlite' ? new core.SqliteAdapter(connection) : new core.D1Adapter(new D1ProtocolDouble(db))
  return { db, connection, adapter, close() { db.close() } }
}
