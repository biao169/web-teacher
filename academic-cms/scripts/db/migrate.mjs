import { existsSync } from 'node:fs'
import { mkdir, chmod } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { loadMigrations, planMigrations, applyMigrations } from './migrations.mjs'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const args = process.argv.slice(2)
const dryRun = args.includes('--plan')
let path = process.env.CMS_DATABASE_PATH ?? 'data/site.sqlite3'
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--database' && args[i + 1]) { path = args[++i]; continue }
  if (args[i] === '--plan') continue
  throw new Error('Usage: migrate.mjs [--plan] [--database PATH]')
}
if (!path.trim() || path === ':memory:') throw new Error('Migration CLI requires a persistent database path')
const databasePath = resolve(root, path)
const migrations = await loadMigrations(resolve(root, 'migrations'))
const existed = existsSync(databasePath)
if (dryRun && !existed) {
  console.log(JSON.stringify({ databasePath, initialized: false, pending: migrations.map(item => item.name) }, null, 2))
  process.exit(0)
}
let Database
try { ({ default: Database } = await import('better-sqlite3')) }
catch { throw new Error('better-sqlite3 is not installed. Install the pinned project dependencies before running migrations.') }
process.umask(0o077)
await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 })
const db = new Database(databasePath, { readonly: dryRun, fileMustExist: dryRun })
try {
  const plan = planMigrations(db, migrations)
  if (dryRun) console.log(JSON.stringify({ databasePath, applied: plan.applied, pending: plan.pending.map(item => item.name) }, null, 2))
  else {
    let backupPath = null
    if (existed && plan.pending.length) {
      const backupDir = resolve(root, 'data/backups')
      await mkdir(backupDir, { recursive: true, mode: 0o700 })
      backupPath = resolve(backupDir, `before-migration-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.sqlite3`)
      await db.backup(backupPath)
      await chmod(backupPath, 0o600)
    }
    db.pragma('foreign_keys = ON'); db.pragma('journal_mode = WAL'); db.pragma('synchronous = FULL'); db.pragma('busy_timeout = 5000')
    const result = applyMigrations(db, migrations)
    const check = db.pragma('quick_check', { simple: true })
    if (check !== 'ok') throw new Error('SQLite integrity check failed')
    await chmod(databasePath, 0o600)
    console.log(JSON.stringify({ databasePath, backupPath, ...result, integrity: check }, null, 2))
  }
}
finally { db.close() }
