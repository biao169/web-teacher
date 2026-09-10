import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { applyMigrations, loadMigrations } from '../../scripts/db/migrations.mjs'

test('0010 preserves existing teachers, supports absent and zero display values, and rejects invalid counts', async () => {
  const migrations = await loadMigrations(resolve(import.meta.dirname, '../../migrations'))
  const upgrade = migrations.findIndex(item => item.name === '0010_profile_link_values.sql')
  assert.equal(upgrade, 9)
  const db = new Database(':memory:')
  try {
    applyMigrations(db, migrations.slice(0, upgrade))
    db.prepare("INSERT INTO profiles(uid,created_at,updated_at,name,bio,github,visibility) VALUES('upgrade:teacher','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','Teacher','Existing biography','https://github.com/teacher','public')").run()
    const before = db.prepare("SELECT * FROM profiles WHERE uid='upgrade:teacher'").get()
    applyMigrations(db, migrations)
    const after = db.prepare("SELECT * FROM profiles WHERE uid='upgrade:teacher'").get()
    for (const [key, value] of Object.entries(before)) assert.deepEqual(after[key], value, `Existing ${key} is preserved`)
    for (const field of ['orcid', 'personal_homepage', 'google_scholar', 'dblp', 'github', 'cnki']) {
      const column = `${field}_value`
      assert.equal(after[column], null)
      const update = db.prepare(`UPDATE profiles SET ${column}=? WHERE uid='upgrade:teacher'`)
      for (const value of [0, 1234, Number.MAX_SAFE_INTEGER, null]) assert.doesNotThrow(() => update.run(value))
      for (const value of [-1, 1.5, 'invalid', '9007199254740992']) assert.throws(() => update.run(value), /CHECK constraint failed/)
    }
    applyMigrations(db, migrations)
    assert.equal(db.prepare('SELECT count(*) AS n FROM profiles').get().n, 1, 'Repeated startup does not reapply or duplicate the upgrade')
    assert.equal(db.pragma('quick_check', { simple: true }), 'ok')
  } finally { db.close() }
})
