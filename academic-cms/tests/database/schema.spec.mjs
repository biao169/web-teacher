import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHarness, root } from '../helpers/offline-db.mjs'
const spec = JSON.parse(await readFile(resolve(root, 'db/schema-spec.json'), 'utf8'))
const source = await readFile(resolve(root, 'docs/02_database_schema.md'), 'utf8')
const sections = [...source.matchAll(/^## (\w+) [^\n]+\n([\s\S]*?)(?=^## |$)/gm)]

test('all 19 source tables and 343 expanded columns are represented exactly', () => {
  // Split with a heading lookahead rather than a line-end alternation.
  const sourceTables = {}
  for (const section of source.split(/^## /m).slice(1)) {
    const name = /^(\w+) /.exec(section)?.[1]
    if (!name || !spec.tables[name]) continue
    const fields = section.split('\n').filter(line => line.startsWith('- ')).flatMap(line => [...line.split('：')[0].matchAll(/`(\w+)`/g)].map(match => match[1]))
    sourceTables[name] = [...new Set(['id', 'uid', 'created_at', 'updated_at', ...fields])].sort()
  }
  assert.equal(Object.keys(sourceTables).length, 19)
  assert.deepEqual(Object.keys(sourceTables).sort(), Object.keys(spec.tables).sort())
  for (const [name, fields] of Object.entries(sourceTables)) assert.deepEqual(Object.keys(spec.tables[name].columns).sort(), fields, name)
  assert.equal(Object.values(spec.tables).reduce((n, table) => n + Object.keys(table.columns).length, 0), 343)
})
for (const [name, table] of Object.entries(spec.tables)) {
  test(`SQLite schema/constraints match the declared contract: ${name}`, () => {
    const harness = createHarness()
    try {
      const columns = harness.db.prepare(`PRAGMA table_info("${name}")`).all()
      assert.deepEqual(columns.map(column => column.name), Object.keys(table.columns))
      for (const column of columns) {
        const expected = table.columns[column.name]
        assert.equal(column.type, ['boolean', 'integer'].includes(expected.kind) ? 'INTEGER' : 'TEXT')
        assert.equal(column.notnull, expected.nullable ? 0 : 1, `${name}.${column.name}`)
        assert.equal(column.pk, expected.primary ? 1 : 0)
      }
      const fks = harness.db.prepare(`PRAGMA foreign_key_list("${name}")`).all()
      const expectedFks = Object.entries(table.columns).filter(([, col]) => col.references)
      assert.equal(fks.length, expectedFks.length)
      for (const [field, column] of expectedFks) {
        const fk = fks.find(item => item.from === field)
        assert.ok(fk); assert.equal(fk.table, column.references.table); assert.equal(fk.to, column.references.column)
        assert.equal(fk.on_delete, column.references.onDelete.toUpperCase()); assert.equal(fk.on_update, 'RESTRICT')
      }
      const indexes = harness.db.prepare(`PRAGMA index_list("${name}")`).all()
      for (const index of table.indexes) {
        const actual = indexes.find(item => item.name === index.name)
        assert.ok(actual, index.name); assert.equal(actual.unique, index.unique ? 1 : 0); assert.equal(actual.partial, index.where ? 1 : 0)
        const indexedColumns = harness.db.prepare(`PRAGMA index_xinfo("${index.name}")`).all().filter(row => row.key === 1)
        assert.equal(indexedColumns.length, index.columns.length)
        indexedColumns.forEach((col, i) => {
          const expected = typeof index.columns[i] === 'string' ? { field: index.columns[i] } : index.columns[i]
          assert.equal(col.name, expected.field); assert.equal(col.desc, expected.direction === 'desc' ? 1 : 0)
          assert.equal(col.coll, expected.collate === 'nocase' ? 'NOCASE' : 'BINARY')
        })
      }
    }
    finally { harness.close() }
  })
}
test('generated TypeScript artifacts are reproducible', () => {
  const result = spawnSync(process.execPath, ['scripts/db/generate-schema.mjs', '--check'], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
test('initial migration cannot be regenerated over an existing file', async () => {
  const path = resolve(root, 'migrations/0001_initial.sql'), before = await readFile(path)
  const result = spawnSync(process.execPath, ['scripts/db/generate-schema.mjs', '--initial'], { cwd: root, encoding: 'utf8' })
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite/)
  assert.deepEqual(await readFile(path), before)
})

test('stage-2 technical security tables are migration-owned and preserve the original 19-table business contract', () => {
  assert.deepEqual(spec.technicalTables, ['auth_bootstrap_state', 'auth_sessions', 'auth_login_throttles'])
  const harness = createHarness()
  try {
    const names = harness.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('auth_bootstrap_state','auth_sessions','auth_login_throttles') ORDER BY name").all().map(row => row.name)
    assert.deepEqual(names, ['auth_bootstrap_state', 'auth_login_throttles', 'auth_sessions'])
    const sessionColumns = harness.db.prepare('PRAGMA table_info(auth_sessions)').all().map(row => row.name)
    assert.deepEqual(sessionColumns, ['id', 'uid', 'user_uid', 'token_hash', 'created_at', 'updated_at', 'last_seen_at', 'idle_expires_at', 'expires_at', 'revoked_at', 'revoke_reason', 'user_agent_hash'])
    const foreignKeys = harness.db.prepare('PRAGMA foreign_key_list(auth_sessions)').all()
    assert.equal(foreignKeys.length, 1)
    assert.equal(foreignKeys[0].table, 'auth_users')
    assert.equal(foreignKeys[0].on_delete, 'CASCADE')
    assert.throws(() => harness.db.prepare(`INSERT INTO auth_sessions(uid,user_uid,token_hash,created_at,updated_at,last_seen_at,idle_expires_at,expires_at,revoked_at,revoke_reason)
      VALUES('session:bad','missing','${'a'.repeat(64)}','2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z','2026-08-29T00:10:00.000Z','2026-08-29T01:00:00.000Z',NULL,'logout')`).run(), /constraint/i)
  }
  finally { harness.close() }
})
