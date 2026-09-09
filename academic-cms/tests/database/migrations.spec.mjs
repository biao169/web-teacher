import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { applyMigrations, planMigrations, loadMigrations, sha256, splitSql } from '../../scripts/db/migrations.mjs'
import { migrations, syncConnection, root } from '../helpers/offline-db.mjs'
function memory(run) { const raw = new DatabaseSync(':memory:'); try { return run(syncConnection(raw), raw) } finally { raw.close() } }
function migration(name, sql) { return { name, sql, sha256: sha256(sql) } }

test('migration apply is idempotent and preserves existing records', () => memory(db => {
  assert.deepEqual(applyMigrations(db, migrations).applied, migrations.map(item => item.name))
  db.prepare('INSERT INTO profiles(uid,name) VALUES (?,?)').run('keep', 'Keep me')
  assert.deepEqual(applyMigrations(db, migrations).applied, [])
  assert.equal(db.prepare('SELECT name FROM profiles WHERE uid=?').all('keep')[0].name, 'Keep me')
}))
test('a failing incremental migration rolls back DDL, data and ledger', () => memory(db => {
  applyMigrations(db, migrations)
  const bad = migration('0004_fail.sql', "CREATE TABLE temporary_data(x TEXT); INSERT INTO profiles(uid,name) VALUES ('rollback','x'); INSERT INTO profiles(uid,name) VALUES ('rollback','duplicate');")
  assert.throws(() => applyMigrations(db, [...migrations, bad]), /rolled back/)
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='temporary_data'").all().length, 0)
  assert.equal(db.prepare("SELECT uid FROM profiles WHERE uid='rollback'").all().length, 0)
  assert.equal(db.prepare('SELECT name FROM _cms_migrations').all().length, migrations.length)
  const good = migration('0004_fail.sql', 'CREATE TABLE temporary_data(x TEXT);')
  assert.deepEqual(applyMigrations(db, [...migrations, good]).applied, ['0004_fail.sql'])
}))
test('first-migration failure leaves no application or ledger tables', () => memory(db => {
  const bad = migration('0001_fail.sql', 'CREATE TABLE temporary_data(x TEXT); THIS IS NOT SQL;')
  assert.throws(() => applyMigrations(db, [bad]), /rolled back/)
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length, 0)
}))
test('changed applied migration is rejected before any new SQL runs', () => memory(db => {
  applyMigrations(db, migrations)
  const changed = { ...migrations[0], sha256: 'f'.repeat(64) }
  assert.throws(() => planMigrations(db, [changed]), /Applied migration changed/)
}))
test('unknown migration history is rejected', () => memory(db => {
  applyMigrations(db, migrations)
  db.prepare('INSERT INTO _cms_migrations(name,sha256) VALUES (?,?)').run('0099_unknown.sql', 'x')
  assert.throws(() => planMigrations(db, migrations), /Unknown or non-prefix/)
}))
test('an unversioned existing database is not silently adopted', () => memory(db => {
  db.exec('CREATE TABLE profiles(uid TEXT, name TEXT)')
  db.prepare('INSERT INTO profiles VALUES (?,?)').run('legacy', 'preserve')
  assert.throws(() => applyMigrations(db, migrations), /explicit legacy import/)
  assert.equal(db.prepare('SELECT name FROM profiles').all()[0].name, 'preserve')
}))
test('nested migration execution is rejected without ending the caller transaction', () => memory(db => {
  db.exec('BEGIN')
  assert.throws(() => applyMigrations(db, migrations), /already in a transaction/)
  assert.equal(db.inTransaction, true); db.exec('ROLLBACK')
}))
test('manifest detects modified SQL before database access', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'cms-manifest-'))
  try {
    await writeFile(resolve(temp, 'manifest.json'), JSON.stringify({ version: 1, migrations: [{ name: '0001_initial.sql', sha256: migrations[0].sha256 }] }))
    await writeFile(resolve(temp, '0001_initial.sql'), migrations[0].sql + '\n--tampered')
    await assert.rejects(loadMigrations(temp), /checksum mismatch/)
  }
  finally { await rm(temp, { recursive: true, force: true }) }
})
test('planning an absent SQLite database creates no file or directory', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'cms-plan-'))
  try {
    const path = resolve(temp, 'nested/site.sqlite3')
    const result = spawnSync(process.execPath, ['scripts/db/migrate.mjs', '--plan', '--database', path], { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout).pending, migrations.map(item => item.name))
    assert.equal(await access(resolve(temp, 'nested')).then(() => true, () => false), false)
  }
  finally { await rm(temp, { recursive: true, force: true }) }
})
test('remote D1 migration refuses a placeholder ID before invoking Wrangler', () => {
  const result = spawnSync(process.execPath, ['scripts/db/d1.mjs', '--remote', '--confirm-database', 'academic-cms'], { cwd: root, encoding: 'utf8' })
  assert.notEqual(result.status, 0); assert.match(result.stderr, /non-placeholder database ID/)
})
test('offline migration SQL splitter preserves semicolons in quoted values', () => {
  const result = splitSql("CREATE TABLE example(a TEXT); INSERT INTO example VALUES('a;it''s;ok'); -- tail\nSELECT 1;")
  assert.equal(result.length, 3); assert.match(result[1], /it''s/)
  assert.throws(() => splitSql("SELECT 'unterminated"), /Unterminated/)
})
test('migration SQL cannot escape atomicity with an embedded COMMIT', () => memory(db => {
  applyMigrations(db, migrations)
  const escape = migration('0004_escape.sql', 'COMMIT; CREATE TABLE leaked_after_commit(x TEXT); THIS IS NOT SQL;')
  assert.throws(() => applyMigrations(db, [...migrations, escape]))
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='leaked_after_commit'").all().length, 0, 'SQL escaped the runner transaction and left a partial schema')
}))

test('transaction control hidden after comments is rejected before any writes', () => memory(db => {
  const bad = migration('0001_initial.sql', '-- owned by runner\n/* block */ BEGIN; CREATE TABLE partial(x); COMMIT;')
  assert.throws(() => applyMigrations(db, [bad]), /transaction/)
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length, 0)
}))
test('transaction words inside SQL values do not trigger false positives', () => memory(db => {
  const good = migration('0001_initial.sql', "CREATE TABLE words(value TEXT); INSERT INTO words VALUES('COMMIT; BEGIN; ROLLBACK');")
  applyMigrations(db, [good])
  assert.equal(db.prepare('SELECT value FROM words').all()[0].value, 'COMMIT; BEGIN; ROLLBACK')
}))
