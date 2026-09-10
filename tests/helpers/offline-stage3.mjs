import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations, applyMigrations } from '../../scripts/db/migrations.mjs'

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const temporaryRoot = resolve(root, '.tmp')
const compiledRoot = process.env.STAGE3_CORE_OUTPUT
  ? resolve(process.env.STAGE3_CORE_OUTPUT)
  : resolve(temporaryRoot, 'stage3-core')
if (compiledRoot !== temporaryRoot && !compiledRoot.startsWith(`${temporaryRoot}${sep}`)) {
  throw new Error('STAGE3_CORE_OUTPUT must stay inside the project temporary directory')
}
const require = createRequire(import.meta.url)
export const load = name => require(resolve(compiledRoot, name))
export const core = {
  ...load('db/query.js'), ...load('db/contracts.js'), ...load('db/adapters/sqlite.js'), ...load('db/adapters/d1.js'),
  ...load('server/i18n/errors.js'), ...load('server/i18n/source-ref.js'), ...load('server/i18n/fingerprint.js'),
  ...load('server/services/i18n/translation-store.js'), ...load('server/services/i18n/translation-reader.js'),
  ...load('server/cache/errors.js'), ...load('server/cache/generation-store.js'), ...load('server/cache/invalidation-map.js'),
  ...load('server/cache/value-cache.js'), ...load('server/cache/memory-adapter.js'), ...load('server/cache/cloudflare-adapter.js'), ...load('server/cache/public-cache.js'),
  ...load('server/cache/keys.js'), ...load('server/cache/policies.js'),
  ...load('server/media/errors.js'), ...load('server/media/object-key.js'), ...load('server/media/http.js'), ...load('server/media/store.js'),
  ...load('server/media/local-store.js'), ...load('server/media/r2-store.js'), ...load('server/media/fetch-store.js'),
  ...load('server/media/grants.js'), ...load('server/services/media/media-catalog-store.js'), ...load('server/services/media/media-service.js'),
  ...load('server/view-model/serializer.js'),
}
export const migrations = await loadMigrations(resolve(root, 'migrations'))

class D1ProtocolDouble {
  constructor(db) { this.db = db }
  prepare(sql) {
    const db = this.db
    const build = params => {
      const execute = () => {
        const statement = db.prepare(sql)
        const rows = statement.all(...params)
        const readOnly = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA)\b/i.test(sql)
        const meta = db.prepare('SELECT changes() changes, last_insert_rowid() last_row_id').get()
        return { success: true, results: rows, meta: { changes: readOnly ? 0 : Number(meta.changes), last_row_id: Number(meta.last_row_id) } }
      }
      return { bind: (...values) => build(values), all: async () => execute(), run: async () => execute(), _execute: execute }
    }
    return build([])
  }
  async batch(statements) {
    try {
      this.db.exec('BEGIN IMMEDIATE')
      const results = statements.map(statement => statement._execute())
      this.db.exec('COMMIT')
      return results
    }
    catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK')
      throw new Error(`D1_ERROR: ${error.message}`, { cause: error })
    }
  }
}
function syncConnection(db) {
  return { prepare: sql => db.prepare(sql), exec: sql => db.exec(sql), get inTransaction() { return db.isTransaction } }
}
export function createHarness(kind = 'sqlite') {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const connection = syncConnection(db)
  applyMigrations(connection, migrations)
  const adapter = kind === 'sqlite' ? new core.SqliteAdapter(connection) : new core.D1Adapter(new D1ProtocolDouble(db))
  return { db, adapter, close() { db.close() } }
}
export function insert(db, sql, ...params) { return db.prepare(sql).run(...params) }
export function iso(ms = Date.UTC(2026, 7, 29, 0, 0, 0)) { return new Date(ms).toISOString() }
