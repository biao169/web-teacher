import test from 'node:test'
import assert from 'node:assert/strict'
import { bootstrapAdmin, core, createSecurityHarness, createServices } from '../helpers/offline-security.mjs'

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: bootstrap creates one administrator, complete permissions and a sanitized audit`, async () => {
    const harness = createSecurityHarness(kind)
    try {
      const services = createServices(harness)
      const result = await bootstrapAdmin(services)
      assert.equal(result.username, 'administrator')
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_users').get().total, 1)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_roles').get().total, 1)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_permissions').get().total, core.AUTH_MODULES.length)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_bootstrap_state').get().total, 1)
      const user = harness.db.prepare('SELECT password_hash,role_uid,status FROM auth_users').get()
      assert.notEqual(user.password_hash, 'A genuinely long passphrase 2026!')
      assert.equal(user.role_uid, core.SYSTEM_ADMIN_ROLE_UID)
      assert.equal(user.status, 'active')
      const audit = harness.db.prepare("SELECT action,detail_json FROM operation_logs WHERE action='bootstrap'").get()
      assert.equal(audit.action, 'bootstrap')
      assert.equal(JSON.parse(audit.detail_json).request_id, 'request-bootstrap-1')
      await assert.rejects(bootstrapAdmin(services), error => ['AUTH_BOOTSTRAP_UNAVAILABLE', 'AUTH_CONFLICT'].includes(error.code))
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_users').get().total, 1)
    }
    finally { harness.close() }
  })

  test(`${kind}: successful login persists only token fingerprints and resolves current permissions`, async () => {
    const harness = createSecurityHarness(kind)
    try {
      const services = createServices(harness)
      await bootstrapAdmin(services)
      const created = await services.auth.login({
        username: 'ADMINISTRATOR', password: 'A genuinely long passphrase 2026!', network: '198.51.100.10',
        userAgent: 'Stage2 Test', requestId: 'request-login-1',
      })
      assert.equal(created.principal.username, 'administrator')
      assert.equal(created.sessionToken.length, 43)
      const stored = harness.db.prepare('SELECT token_hash,user_agent_hash,revoked_at FROM auth_sessions').get()
      assert.match(stored.token_hash, /^[0-9a-f]{64}$/)
      assert.notEqual(stored.token_hash, created.sessionToken)
      assert.equal(stored.revoked_at, null)
      assert.match(stored.user_agent_hash, /^[0-9a-f]{64}$/)
      const databaseText = JSON.stringify(harness.db.prepare('SELECT * FROM auth_sessions').all())
      assert.equal(databaseText.includes(created.sessionToken), false)
      const active = await services.sessions.resolve(created.sessionToken)
      assert.equal(active.principal.permissions.publications.view, true)
      assert.equal(active.csrfToken, created.csrfToken)

      harness.db.prepare("UPDATE auth_permissions SET can_edit=0 WHERE role_uid=? AND module='publications'").run(core.SYSTEM_ADMIN_ROLE_UID)
      const refreshed = await services.sessions.resolve(created.sessionToken)
      assert.equal(refreshed.principal.permissions.publications.edit, false)
    }
    finally { harness.close() }
  })

  test(`${kind}: failed logins are generic, account throttled and skip PBKDF2 while already blocked`, async () => {
    const harness = createSecurityHarness(kind)
    try {
      const services = createServices(harness, { accountFailures: 2, networkFailures: 5 })
      await bootstrapAdmin(services)
      const before = services.engine.calls.length
      await assert.rejects(services.auth.login({ username: 'unknown', password: 'wrong', network: '203.0.113.1', requestId: 'bad-1' }), error => error.code === 'AUTH_INVALID_CREDENTIALS')
      await assert.rejects(services.auth.login({ username: 'unknown', password: 'wrong', network: '203.0.113.1', requestId: 'bad-2' }), error => error.code === 'AUTH_THROTTLED' && error.retryAfterSeconds > 0)
      const afterThreshold = services.engine.calls.length
      await assert.rejects(services.auth.login({ username: 'unknown', password: 'wrong', network: '203.0.113.1', requestId: 'bad-3' }), error => error.code === 'AUTH_THROTTLED')
      assert.equal(services.engine.calls.length, afterThreshold, 'an active throttle protects CPU from another PBKDF2 derivation')
      assert.equal(afterThreshold, before + 2)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_sessions').get().total, 0)
      assert.equal(harness.db.prepare("SELECT failures FROM auth_login_throttles WHERE scope='account'").get().failures, 2)
    }
    finally { harness.close() }
  })

  test(`${kind}: session idle renewal is bounded, logout revokes immediately and disabled users fail closed`, async () => {
    const harness = createSecurityHarness(kind)
    try {
      const services = createServices(harness, { sessionPolicy: { idleSeconds: 600, absoluteSeconds: 900, touchSeconds: 60 } })
      await bootstrapAdmin(services)
      const created = await services.auth.login({ username: 'administrator', password: 'A genuinely long passphrase 2026!', network: null, requestId: 'login' })
      const initial = harness.db.prepare('SELECT idle_expires_at,expires_at FROM auth_sessions').get()
      services.clock.advance(480)
      const active = await services.sessions.resolve(created.sessionToken)
      assert.equal(active.idleExpiresAt, initial.expires_at)
      assert.equal(harness.db.prepare('SELECT idle_expires_at FROM auth_sessions').get().idle_expires_at, initial.expires_at)
      await services.sessions.logout(active, 'logout-request')
      const revoked = harness.db.prepare('SELECT revoked_at,revoke_reason FROM auth_sessions').get()
      assert.equal(revoked.revoke_reason, 'logout')
      assert.ok(revoked.revoked_at)
      await assert.rejects(services.sessions.resolve(created.sessionToken), error => error.code === 'AUTH_SESSION_INVALID')

      services.clock.advance(1)
      const next = await services.auth.login({ username: 'administrator', password: 'A genuinely long passphrase 2026!', network: null, requestId: 'login-2' })
      harness.db.prepare("UPDATE auth_users SET status='disabled' WHERE username='administrator'").run()
      await assert.rejects(services.sessions.resolve(next.sessionToken), error => error.code === 'AUTH_SESSION_INVALID')
      assert.equal(harness.db.prepare('SELECT revoke_reason FROM auth_sessions WHERE token_hash=?').get(next.sessionHash).revoke_reason, 'user_disabled')
    }
    finally { harness.close() }
  })

  test(`${kind}: active session cap revokes the oldest server-side session`, async () => {
    const harness = createSecurityHarness(kind)
    try {
      const services = createServices(harness)
      await bootstrapAdmin(services)
      const tokens = []
      for (let index = 0; index < 11; index += 1) {
        services.clock.advance(1)
        tokens.push(await services.auth.login({ username: 'administrator', password: 'A genuinely long passphrase 2026!', network: null, requestId: `login-${index}` }))
      }
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_sessions WHERE revoked_at IS NULL').get().total, 10)
      const oldest = harness.db.prepare('SELECT revoke_reason FROM auth_sessions WHERE token_hash=?').get(tokens[0].sessionHash)
      assert.equal(oldest.revoke_reason, 'rotated')
      await assert.rejects(services.sessions.resolve(tokens[0].sessionToken), error => error.code === 'AUTH_SESSION_INVALID')
      assert.ok(await services.sessions.resolve(tokens[10].sessionToken))
    }
    finally { harness.close() }
  })
}
