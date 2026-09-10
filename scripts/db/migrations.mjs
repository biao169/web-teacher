import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const MIGRATION_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/
export const sha256 = data => createHash('sha256').update(data).digest('hex')
export async function loadMigrations(directory) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'))
  if (manifest.version !== 1 || !Array.isArray(manifest.migrations) || !manifest.migrations.length) throw new Error('Invalid migration manifest')
  const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
  if (new Set(manifest.migrations.map(item => item.name)).size !== manifest.migrations.length) throw new Error('Duplicate migration in manifest')
  if (JSON.stringify(names) !== JSON.stringify(manifest.migrations.map(item => item.name))) throw new Error('SQL files and manifest differ')
  const migrations = []
  for (let index = 0; index < manifest.migrations.length; index += 1) {
    const entry = manifest.migrations[index]
    const match = MIGRATION_NAME.exec(entry.name)
    if (!match || Number(match[1]) !== index + 1) throw new Error('Migrations must have consecutive four-digit versions')
    const sql = await readFile(resolve(directory, entry.name), 'utf8')
    if (sha256(sql) !== entry.sha256) throw new Error(`Migration checksum mismatch: ${entry.name}`)
    validateMigrationSql(sql)
    migrations.push({ name: entry.name, sha256: entry.sha256, sql })
  }
  return migrations
}
export function planMigrations(db, migrations) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name)
  if (!tables.includes('_cms_migrations')) {
    if (tables.length) throw new Error('Existing database has no CMS migration ledger; explicit legacy import is required')
    return { pending: migrations, applied: [] }
  }
  const applied = db.prepare('SELECT name, sha256 FROM _cms_migrations ORDER BY name').all()
  for (let index = 0; index < applied.length; index += 1) {
    const item = applied[index], expected = migrations[index]
    if (!expected || item.name !== expected.name) throw new Error('Unknown or non-prefix migration history')
    if (item.sha256 !== expected.sha256) throw new Error(`Applied migration changed: ${item.name}`)
  }
  return { pending: migrations.slice(applied.length), applied: applied.map(item => item.name) }
}
/** Synchronous transactions avoid interleaving await with writes on a shared connection. */
export function applyMigrations(db, migrations) {
  if (db.inTransaction) throw new Error('Migration runner cannot use a connection already in a transaction')
  for (const migration of migrations) validateMigrationSql(migration.sql)
  db.exec('PRAGMA foreign_keys = ON')
  const plan = planMigrations(db, migrations), applied = []
  for (const migration of plan.pending) {
    try {
      db.exec('BEGIN IMMEDIATE')
      db.exec("CREATE TABLE IF NOT EXISTS _cms_migrations (name TEXT PRIMARY KEY NOT NULL, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))")
      db.exec(migration.sql)
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Foreign key validation failed')
      db.prepare('INSERT INTO _cms_migrations (name, sha256) VALUES (?, ?)').run(migration.name, migration.sha256)
      db.exec('COMMIT')
      applied.push(migration.name)
    }
    catch (error) {
      if (db.inTransaction) db.exec('ROLLBACK')
      throw new Error(`Migration failed and rolled back: ${migration.name}`, { cause: error })
    }
  }
  return { applied, skipped: plan.applied }
}
/** Migration files cannot take transaction ownership or modify attached databases. */
export function validateMigrationSql(sql) {
  for (const statement of splitSql(sql)) {
    const text = statement.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '')
    if (/^(?:BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE|ATTACH|DETACH)\b/i.test(text)) throw new Error('Migration SQL must not contain transaction or attachment control')
    if (/^CREATE\s+(?:(?:TEMP|TEMPORARY)\s+)?TRIGGER\b/i.test(text)) throw new Error('Trigger migrations require a separately validated migration parser')
    if (/^PRAGMA\s+(?:(?:main|temp)\s*\.\s*)?foreign_keys\s*(?:=\s*|\(\s*)(?:OFF|0|FALSE)\b/i.test(text)) throw new Error('Migrations must not disable foreign key enforcement')
  }
}
/** Quote/comment-aware splitting; triggers are deliberately outside the stage-1 contract. */
export function splitSql(sql) {
  const result = []; let start = 0, quote = null, lineComment = false, blockComment = false
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i], next = sql[i + 1]
    if (lineComment) { if (c === '\n') lineComment = false; continue }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i += 1 }; continue }
    if (quote) { if (c === quote) { if (next === quote) i += 1; else quote = null }; continue }
    if (c === '-' && next === '-') { lineComment = true; i += 1; continue }
    if (c === '/' && next === '*') { blockComment = true; i += 1; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === ';') { const statement = sql.slice(start, i).trim(); if (statement) result.push(statement); start = i + 1 }
  }
  if (quote || blockComment) throw new Error('Unterminated SQL literal or comment')
  const tail = sql.slice(start).trim(); if (tail) result.push(tail)
  return result
}
