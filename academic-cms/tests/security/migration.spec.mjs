import test from 'node:test'
import assert from 'node:assert/strict'
import { createSecurityHarness, migrations } from '../helpers/offline-security.mjs'

const now = '2026-08-29T00:00:00.000Z'
const idle = '2026-08-29T00:10:00.000Z'
const expires = '2026-08-29T01:00:00.000Z'

function seedUser(db) {
  db.prepare(`INSERT INTO auth_roles(uid,created_at,updated_at,name,level,visibility_scopes,is_system,is_active,sort_order)
    VALUES(?,?,?,?,?,?,?,?,?)`).run('role:test', now, now, 'Test', 1, '["public"]', 0, 1, 0)
  db.prepare(`INSERT INTO auth_users(uid,created_at,updated_at,username,password_hash,role_uid,status,must_change_password,visibility)
    VALUES(?,?,?,?,?,?,?,?,?)`).run('user:test', now, now, 'tester', 'hash', 'role:test', 'active', 0, 'hidden')
}

test('authentication migration is append-only stage 2 and creates all technical tables', () => {
  assert.deepEqual(migrations.map(item => item.name).slice(0, 2), ['0001_initial.sql', '0002_auth_security.sql'])
  assert.equal(new Set(migrations.map(item => item.name)).size, migrations.length)
  const harness = createSecurityHarness()
  try {
    const tables = harness.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'auth_%' ORDER BY name").all().map(row => row.name)
    assert.ok(tables.includes('auth_bootstrap_state'))
    assert.ok(tables.includes('auth_sessions'))
    assert.ok(tables.includes('auth_login_throttles'))
    const columns = harness.db.prepare('PRAGMA table_info(auth_sessions)').all().map(row => row.name)
    assert.deepEqual(columns, ['id', 'uid', 'user_uid', 'token_hash', 'created_at', 'updated_at', 'last_seen_at', 'idle_expires_at', 'expires_at', 'revoked_at', 'revoke_reason', 'user_agent_hash'])
  }
  finally { harness.close() }
})

test('session schema stores only a 64-hex token fingerprint and enforces revocation pairing', () => {
  const harness = createSecurityHarness()
  try {
    seedUser(harness.db)
    const insert = harness.db.prepare(`INSERT INTO auth_sessions(uid,user_uid,token_hash,created_at,updated_at,last_seen_at,idle_expires_at,expires_at,revoked_at,revoke_reason,user_agent_hash)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    assert.throws(() => insert.run('session:raw', 'user:test', 'A'.repeat(43), now, now, now, idle, expires, null, null, null), /CHECK/)
    insert.run('session:ok', 'user:test', 'a'.repeat(64), now, now, now, idle, expires, null, null, null)
    assert.throws(() => harness.db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE uid='session:ok'").run(now), /CHECK/)
    assert.throws(() => harness.db.prepare("UPDATE auth_sessions SET revoke_reason='logout' WHERE uid='session:ok'").run(), /CHECK/)
    harness.db.prepare("UPDATE auth_sessions SET revoked_at=?, revoke_reason='logout' WHERE uid='session:ok'").run(now)
  }
  finally { harness.close() }
})

test('session and throttle lookup indexes are explicit and queryable', () => {
  const harness = createSecurityHarness()
  try {
    const sessionIndexes = new Set(harness.db.prepare('PRAGMA index_list(auth_sessions)').all().map(row => row.name))
    assert.ok(sessionIndexes.has('idx_auth_sessions_token_hash'))
    assert.ok(sessionIndexes.has('idx_auth_sessions_user_active'))
    assert.ok(sessionIndexes.has('idx_auth_sessions_expiry'))
    assert.ok(sessionIndexes.has('idx_auth_sessions_revoked'))
    const throttleIndexes = new Set(harness.db.prepare('PRAGMA index_list(auth_login_throttles)').all().map(row => row.name))
    assert.ok(throttleIndexes.has('idx_auth_login_throttles_expiry'))
  }
  finally { harness.close() }
})

test('bootstrap singleton and throttle timelines fail closed at database level', () => {
  const harness = createSecurityHarness()
  try {
    harness.db.prepare('INSERT INTO auth_bootstrap_state(id,completed_at,user_uid) VALUES(1,?,?)').run(now, 'user:test')
    assert.throws(() => harness.db.prepare('INSERT INTO auth_bootstrap_state(id,completed_at,user_uid) VALUES(2,?,?)').run(now, 'user:other'), /CHECK/)
    assert.throws(() => harness.db.prepare(`INSERT INTO auth_login_throttles(key_hash,scope,failures,window_started_at,blocked_until,updated_at,expires_at)
      VALUES(?,?,?,?,?,?,?)`).run('b'.repeat(64), 'account', 2, now, expires, now, idle), /CHECK/)
  }
  finally { harness.close() }
})
