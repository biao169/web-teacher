import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { resolve } from 'node:path'
import { SqliteAdapter } from '../adapters/sqlite'
import { Repository } from '../repository'

export function openNodeDatabase(path: string) {
  if (!path.trim() || path === ':memory:') throw new Error('Production requires an existing persistent SQLite file')
  const connection = new Database(resolve(path), { fileMustExist: true })
  try {
    if (!connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_cms_migrations'").get()) throw new Error('Database is not initialized by the CMS migration tool')
    for (const migration of ['0001_initial.sql', '0002_auth_security.sql', '0003_media_i18n_cache.sql', '0004_public_content_indexes.sql', '0005_public_interactions_and_demo_seed.sql']) {
      if (!connection.prepare('SELECT name FROM _cms_migrations WHERE name = ?').get(migration)) throw new Error(`Database is missing required CMS migration: ${migration}`)
    }
    connection.pragma('foreign_keys = ON')
    connection.pragma('journal_mode = WAL')
    connection.pragma('synchronous = FULL')
    connection.pragma('busy_timeout = 5000')
    const adapter = new SqliteAdapter(connection)
    // Explicit table imports retain Drizzle type safety without relational schema registration.
    const orm = drizzle(connection)
    return { adapter, orm, repository: new Repository(adapter), close() { adapter.clearStatementCache(); connection.close() } }
  }
  catch (error) { connection.close(); throw error }
}
