import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthHarness, security, TestPbkdf2Engine } from '../helpers/offline-security.mjs'

const PASSWORD = 'Tideglass!Orbit!Cedar!2026'

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: one-time bootstrap creates the fixed administrator role, complete permission matrix and audit`, async () => {
    const h = createAuthHarness(kind)
    try {
      const result = await h.createAdmin()
      assert.equal(result.username, 'root-admin')
      assert.equal(h.db.prepare('SELECT count(*) total FROM auth_users').get().total, 1)
      const role = h.db.prepare('SELECT * FROM auth_roles').get()
      assert.equal(role.uid, security.SYSTEM_ADMIN_ROLE_UID)
      assert.equal(role.is_system, 1)
      assert.equal(role.is_active, 1)
      assert.equal(h.db.prepare('SELECT count(*) total FROM auth_permissions').get().total, security.AUTH_MODULES.length)
      assert.equal(h.db.prepare('SELECT count(*) total FROM auth_bootstrap_state').get().total, 1)
      const audit = h.db.prepare("SELECT action, detail_json FROM operation_logs WHERE action='bootstrap'").get()
      assert.equal(audit.action, 'bootstrap')
      assert.doesNotMatch(audit.detail_json, new RegExp(PASSWORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      const stored = h.db.prepare('SELECT password_hash FROM auth_users').get().password_hash
      assert.match(stored, /^pbkdf2-sha256\$600000\$/)
      assert.equal(stored.includes(PASSWORD), false)
    }
    finally { h.close() }
  })

  test(`${kind}: bootstrap token is checked before password hashing and initialization cannot be repeated`, async () => {
    const engine = new TestPbkdf2Engine()
    const h = createAuthHarness(kind, { engine })
    try {
      await assert.rejects(() => h.createAdmin({ presentedToken: 'wrong-token-that-is-at-least-thirty-two-bytes' }), error => error.code === 'AUTH_BOOTSTRAP_UNAVAILABLE')
      assert.equal(engine.calls.length, 0)
      await h.createAdmin()
      const calls = engine.calls.length
      await assert.rejects(() => h.createAdmin({ username: 'second-admin' }), error => error.code === 'AUTH_BOOTSTRAP_UNAVAILABLE')
      assert.equal(h.db.prepare('SELECT count(*) total FROM auth_users').get().total, 1)
      assert.equal(h.db.prepare('SELECT count(*) total FROM auth_roles').get().total, 1)
      assert.equal(h.db.prepare('SELECT count(*) total FROM operation_logs').get().total, 1)
      assert.equal(engine.calls.length, calls, 'completed bootstrap is rejected before password hashing')
    }
    finally { h.close() }
  })

  test(`${kind}: bootstrap refuses to overwrite a pre-existing reserved role and rolls back state`, async () => {
    const h = createAuthHarness(kind)
    try {
      h.db.prepare("INSERT INTO auth_roles(uid,name,level,visibility_scopes,is_system,is_active) VALUES(?,?,?,?,?,?)")
        .run(security.SYSTEM_ADMIN_ROLE_UID, 'Unexpected preexisting role', 1, '["public"]', 0, 0)
      const calls = h.engine.calls.length
      await assert.rejects(() => h.createAdmin(), error => ['AUTH_BOOTSTRAP_UNAVAILABLE', 'AUTH_CONFLICT'].includes(error.code))
      assert.equal(h.engine.calls.length, calls, 'reserved bootstrap records fail before password hashing')
      assert.equal(h.db.prepare('SELECT count(*) total FROM auth_users').get().total, 0)
      assert.equal(h.db.prepare('SELECT count(*) total FROM auth_bootstrap_state').get().total, 0)
      const role = h.db.prepare('SELECT name,is_system FROM auth_roles').get()
      assert.equal(role.name, 'Unexpected preexisting role')
      assert.equal(role.is_system, 0)
    }
    finally { h.close() }
  })

  test(`${kind}: successful login creates an opaque server-side session and resolves current permissions`, async () => {
    const h = createAuthHarness(kind)
    try {
      await h.createAdmin()
      const created = await h.authentication.login({ username: 'ROOT-ADMIN', password: PASSWORD, network: '203.0.113.0/24', userAgent: 'Stage2 test agent' })
      assert.equal(created.sessionToken.length, 43)
      assert.equal(created.csrfToken.length, 43)
      assert.match(created.sessionHash, /^[0-9a-f]{64}$/)
      const row = h.db.prepare('SELECT token_hash,user_agent_hash,revoked_at,revoke_reason FROM auth_sessions').get()
      assert.equal(row.token_hash, created.sessionHash)
      assert.notEqual(row.token_hash, created.sessionToken)
      assert.equal(row.revoked_at, null)
      assert.equal(row.revoke_reason, null)
      const serializedDb = JSON.stringify(h.db.prepare('SELECT * FROM auth_sessions').all())
      assert.equal(serializedDb.includes(created.sessionToken), false)
      assert.equal(serializedDb.includes(created.csrfToken), false)
      const active = await h.sessions.resolve(created.sessionToken)
      assert.equal(active.principal.username, 'root-admin')
      assert.equal(security.hasPermission(active.principal, 'publications', 'delete'), true)
      assert.equal(security.hasPermission(active.principal, 'operation_logs', 'delete'), false)
      assert.equal(await h.tokens.verifyCsrf(created.sessionToken, created.csrfToken, created.csrfToken), true)
    }
    finally { h.close() }
  })

  test(`${kind}: invalid credentials are generic, use one KDF and activate the account throttle at the configured threshold`, async () => {
    const engine = new TestPbkdf2Engine()
    const h = createAuthHarness(kind, { engine })
    try {
      await h.createAdmin()
      const before = engine.calls.length
      await assert.rejects(() => h.authentication.login({ username: 'unknown-user', password: 'wrong password value', network: '198.51.100.8' }), error => error.code === 'AUTH_INVALID_CREDENTIALS')
      assert.equal(engine.calls.length, before + 1, 'unknown users receive the dummy KDF path')
      for (let attempt = 1; attempt < 5; attempt += 1) {
        await assert.rejects(() => h.authentication.login({ username: 'root-admin', password: 'wrong password value', network: `198.51.100.${attempt}` }), error => error.code === 'AUTH_INVALID_CREDENTIALS')
      }
      await assert.rejects(() => h.authentication.login({ username: 'root-admin', password: 'wrong password value', network: '198.51.100.20' }), error => error.code === 'AUTH_THROTTLED' && error.retryAfterSeconds > 0)
      await assert.rejects(() => h.authentication.login({ username: 'root-admin', password: PASSWORD, network: '198.51.100.21' }), error => error.code === 'AUTH_THROTTLED')
      const accountRows = h.db.prepare("SELECT failures,blocked_until FROM auth_login_throttles WHERE scope='account'").all()
      assert.equal(accountRows.some(row => row.failures >= 5 && row.blocked_until), true)
    }
    finally { h.close() }
  })

  test(`${kind}: a later successful login clears its account throttle atomically but does not erase a shared network bucket`, async () => {
    const h = createAuthHarness(kind)
    try {
      await h.createAdmin()
      await assert.rejects(() => h.authentication.login({ username: 'root-admin', password: 'wrong password value', network: '203.0.113.9' }), error => error.code === 'AUTH_INVALID_CREDENTIALS')
      assert.equal(h.db.prepare("SELECT count(*) total FROM auth_login_throttles WHERE scope='account'").get().total, 1)
      assert.equal(h.db.prepare("SELECT count(*) total FROM auth_login_throttles WHERE scope='network'").get().total, 1)
      await h.authentication.login({ username: 'root-admin', password: PASSWORD, network: '203.0.113.9' })
      assert.equal(h.db.prepare("SELECT count(*) total FROM auth_login_throttles WHERE scope='account'").get().total, 0)
      assert.equal(h.db.prepare("SELECT count(*) total FROM auth_login_throttles WHERE scope='network'").get().total, 1)
    }
    finally { h.close() }
  })

  test(`${kind}: session touch is bounded, absolute expiry is never extended and disabled role invalidates immediately`, async () => {
    const h = createAuthHarness(kind)
    try {
      await h.createAdmin()
      const created = await h.authentication.login({ username: 'root-admin', password: PASSWORD, network: null })
      const initial = h.db.prepare('SELECT last_seen_at,idle_expires_at,expires_at FROM auth_sessions').get()
      h.clock.advance(4 * 60 * 1000)
      await h.sessions.resolve(created.sessionToken)
      assert.deepEqual(h.db.prepare('SELECT last_seen_at,idle_expires_at,expires_at FROM auth_sessions').get(), initial)
      h.clock.advance(2 * 60 * 1000)
      await h.sessions.resolve(created.sessionToken)
      const touched = h.db.prepare('SELECT last_seen_at,idle_expires_at,expires_at FROM auth_sessions').get()
      assert.notEqual(touched.last_seen_at, initial.last_seen_at)
      assert.equal(touched.expires_at, initial.expires_at)
      assert.ok(touched.idle_expires_at <= touched.expires_at)
      h.db.prepare('UPDATE auth_roles SET is_active=0 WHERE uid=?').run(security.SYSTEM_ADMIN_ROLE_UID)
      await assert.rejects(() => h.sessions.resolve(created.sessionToken), error => error.code === 'AUTH_SESSION_INVALID')
      const revoked = h.db.prepare('SELECT revoked_at,revoke_reason FROM auth_sessions').get()
      assert.ok(revoked.revoked_at)
      assert.equal(revoked.revoke_reason, 'role_disabled')
    }
    finally { h.close() }
  })

  test(`${kind}: idle and absolute session expiry are fail-closed`, async () => {
    const idle = createAuthHarness(kind, { sessionPolicy: { idleSeconds: 300, absoluteSeconds: 1800, touchSeconds: 60 } })
    try {
      await idle.createAdmin()
      const created = await idle.authentication.login({ username: 'root-admin', password: PASSWORD, network: null })
      idle.clock.advance(300 * 1000)
      await assert.rejects(() => idle.sessions.resolve(created.sessionToken), error => error.code === 'AUTH_SESSION_EXPIRED')
      assert.equal(idle.db.prepare('SELECT revoke_reason FROM auth_sessions').get().revoke_reason, 'expired')
    }
    finally { idle.close() }

    const absolute = createAuthHarness(kind, { sessionPolicy: { idleSeconds: 300, absoluteSeconds: 600, touchSeconds: 60 } })
    try {
      await absolute.createAdmin()
      const created = await absolute.authentication.login({ username: 'root-admin', password: PASSWORD, network: null })
      for (let minute = 0; minute < 9; minute += 1) {
        absolute.clock.advance(60 * 1000)
        await absolute.sessions.resolve(created.sessionToken)
      }
      absolute.clock.advance(60 * 1000)
      await assert.rejects(() => absolute.sessions.resolve(created.sessionToken), error => error.code === 'AUTH_SESSION_EXPIRED')
      const row = absolute.db.prepare('SELECT expires_at,idle_expires_at,revoke_reason FROM auth_sessions').get()
      assert.ok(row.idle_expires_at <= row.expires_at)
      assert.equal(row.revoke_reason, 'expired')
    }
    finally { absolute.close() }
  })

  test(`${kind}: login rotation and logout revoke sessions with paired reason and audit data`, async () => {
    const h = createAuthHarness(kind)
    try {
      await h.createAdmin()
      const first = await h.authentication.login({ username: 'root-admin', password: PASSWORD, network: null })
      const second = await h.authentication.login({ username: 'root-admin', password: PASSWORD, network: null, rotateSessionToken: first.sessionToken })
      const rows = h.db.prepare('SELECT token_hash,revoked_at,revoke_reason FROM auth_sessions ORDER BY id').all()
      assert.equal(rows[0].revoke_reason, 'rotated')
      assert.ok(rows[0].revoked_at)
      assert.equal(rows[1].revoke_reason, null)
      await assert.rejects(() => h.sessions.resolve(first.sessionToken), error => error.code === 'AUTH_SESSION_INVALID')
      const active = await h.sessions.resolve(second.sessionToken)
      await h.sessions.logout(active, 'logout-request')
      const loggedOut = h.db.prepare('SELECT revoked_at,revoke_reason FROM auth_sessions WHERE token_hash=?').get(second.sessionHash)
      assert.ok(loggedOut.revoked_at)
      assert.equal(loggedOut.revoke_reason, 'logout')
      const audit = h.db.prepare("SELECT detail_json FROM operation_logs WHERE action='logout'").get()
      assert.match(audit.detail_json, /logout-request/)
      assert.doesNotMatch(audit.detail_json, new RegExp(second.sessionToken))
    }
    finally { h.close() }
  })

  test(`${kind}: session count is bounded to ten active records per user`, async () => {
    const h = createAuthHarness(kind)
    try {
      await h.createAdmin()
      for (let index = 0; index < 12; index += 1) {
        h.clock.advance(1000)
        await h.authentication.login({ username: 'root-admin', password: PASSWORD, network: null })
      }
      assert.equal(h.db.prepare('SELECT count(*) total FROM auth_sessions WHERE revoked_at IS NULL').get().total, 10)
      assert.equal(h.db.prepare("SELECT count(*) total FROM auth_sessions WHERE revoke_reason='rotated'").get().total, 2)
      const invalidPairs = h.db.prepare('SELECT count(*) total FROM auth_sessions WHERE (revoked_at IS NULL) <> (revoke_reason IS NULL)').get().total
      assert.equal(invalidPairs, 0)
    }
    finally { h.close() }
  })
}
