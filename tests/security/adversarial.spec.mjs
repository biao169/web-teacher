import test from 'node:test'
import assert from 'node:assert/strict'
import { core, createAuthHarness } from '../helpers/offline-security.mjs'

const PASSWORD = 'Tideglass!Orbit!Cedar!2026'
const SECRET = 'stage2-adversarial-secret-with-more-than-thirty-two-bytes'

test('configured trusted origins remain authoritative when the received Host-derived URL is hostile', async () => {
  const tokens = new core.AuthTokenService(SECRET)
  await core.protectUnsafeRequest({
    method: 'POST',
    contentType: 'application/json',
    origin: 'https://cms.example.test',
    secFetchSite: 'same-origin',
    requestUrl: 'http://host-header-controlled.invalid/api/v1/auth/bootstrap',
    trustedOrigins: ['https://cms.example.test'],
    cookieAuthenticated: false,
    tokens,
  })
  await assert.rejects(() => core.protectUnsafeRequest({
    method: 'POST',
    contentType: 'application/json',
    origin: 'http://host-header-controlled.invalid',
    secFetchSite: 'same-origin',
    requestUrl: 'http://host-header-controlled.invalid/api/v1/auth/bootstrap',
    trustedOrigins: ['https://cms.example.test'],
    cookieAuthenticated: false,
    tokens,
  }), error => error.code === 'AUTH_ORIGIN')
})

test('origin fallback is exact when no canonical deployment origin is configured', async () => {
  await core.protectUnsafeRequest({
    method: 'PATCH', contentType: 'application/merge-patch+json', origin: 'http://localhost:3000',
    secFetchSite: null, requestUrl: 'http://localhost:3000/api/v1/example', trustedOrigins: [], cookieAuthenticated: false,
  })
  await assert.rejects(() => core.protectUnsafeRequest({
    method: 'PATCH', contentType: 'application/merge-patch+json', origin: 'http://localhost:3001',
    secFetchSite: null, requestUrl: 'http://localhost:3000/api/v1/example', trustedOrigins: [], cookieAuthenticated: false,
  }), error => error.code === 'AUTH_ORIGIN')
})

test('trusted proxy hops are counted from the right side of X-Forwarded-For', () => {
  const input = { runtimeKind: 'node', forwardedFor: '198.51.100.10, 10.0.0.4', remoteAddress: '10.0.0.5' }
  assert.equal(core.selectClientNetwork({ ...input, trustedProxyHops: 1 }), '10.0.0.4')
  assert.equal(core.selectClientNetwork({ ...input, trustedProxyHops: 2 }), '198.51.100.10')
  assert.equal(core.selectClientNetwork({ ...input, trustedProxyHops: 3 }), null)
  assert.equal(core.selectClientNetwork({ runtimeKind: 'node', forwardedFor: '198.51.100.10', remoteAddress: '10.0.0.5', trustedProxyHops: 1 }), '198.51.100.10')
})

test('Unicode validation accepts supplementary characters and rejects unpaired UTF-16', () => {
  assert.equal(core.hasUnpairedSurrogate('Research 😀 notes'), false)
  assert.equal(core.codePointLength('A😀B'), 3)
  assert.equal(core.utf8ByteLength('😀'), 4)
  assert.equal(core.hasUnpairedSurrogate(`bad\uD800value`), true)
  assert.equal(core.hasUnpairedSurrogate(`bad\uDC00value`), true)
})

test('audit scalar normalization never calls a custom object coercion hook', () => {
  let invoked = false
  const value = { toString() { invoked = true; return 'sensitive' } }
  assert.equal(core.oneLine(value), null)
  assert.equal(invoked, false)
})

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: a session revoked between read and sliding refresh is rejected`, async () => {
    const h = createAuthHarness(kind)
    try {
      await h.createAdmin()
      const created = await h.authentication.login({
        username: 'root-admin', password: PASSWORD, network: null, requestId: 'race-login',
      })
      h.clock.advance(6 * 60 * 1000)
      const originalTouch = h.store.touchSession.bind(h.store)
      h.store.touchSession = async (tokenHash, now, idleExpiresAt) => {
        h.db.prepare(`UPDATE auth_sessions
          SET revoked_at=?, revoke_reason='admin_revoked', updated_at=?
          WHERE token_hash=? AND revoked_at IS NULL`).run(now, now, tokenHash)
        return originalTouch(tokenHash, now, idleExpiresAt)
      }
      await assert.rejects(() => h.sessions.resolve(created.sessionToken), error => error.code === 'AUTH_SESSION_INVALID')
      assert.equal(h.db.prepare('SELECT revoke_reason FROM auth_sessions WHERE token_hash=?').get(created.sessionHash).revoke_reason, 'admin_revoked')
    }
    finally { h.close() }
  })
}

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: repeated logout is idempotent and emits exactly one audit record`, async () => {
    const h = createAuthHarness(kind)
    try {
      await h.createAdmin()
      const created = await h.authentication.login({
        username: 'root-admin', password: PASSWORD, network: null, requestId: 'logout-login',
      })
      const active = await h.sessions.resolve(created.sessionToken)
      await h.sessions.logout(active, 'logout-same-time')
      await h.sessions.logout(active, 'logout-same-time')
      assert.equal(h.db.prepare("SELECT count(*) total FROM operation_logs WHERE action='logout'").get().total, 1)
    }
    finally { h.close() }
  })

  test(`${kind}: a failed session insert cannot mutate state through a colliding pre-existing UID`, async () => {
    const h = createAuthHarness(kind)
    try {
      await h.createAdmin()
      await h.authentication.login({ username: 'root-admin', password: PASSWORD, network: null, requestId: 'first-login' })
      const existing = h.db.prepare('SELECT uid FROM auth_sessions').get()
      const credential = await h.store.findCredentialByUsername('root-admin')
      const keys = await h.throttle.keys('root-admin', null)
      const window = h.throttle.window()
      await h.throttle.recordFailure(keys, window)
      const before = h.db.prepare('SELECT password_hash,last_login_at FROM auth_users WHERE uid=?').get(credential.userUid)
      h.clock.advance(60_000)
      h.db.prepare("UPDATE auth_users SET status='disabled' WHERE uid=?").run(credential.userUid)
      const collision = new core.SessionService(h.store, h.tokens, {
        clock: h.clock.now,
        sessionPolicy: { idleSeconds: 1800, absoluteSeconds: 28800, touchSeconds: 300 },
        idFactory(prefix) {
          if (prefix === 'session') return existing.uid
          return `${prefix}:collision-attempt`
        },
      })
      await assert.rejects(() => collision.createForCredential(credential, {
        accountThrottleHash: keys.account,
        replacementPasswordHash: 'must-not-be-persisted',
        requestId: 'uid-collision',
      }), error => error.code === 'AUTH_SESSION_INVALID')
      const after = h.db.prepare('SELECT password_hash,last_login_at FROM auth_users WHERE uid=?').get(credential.userUid)
      assert.deepEqual(after, before)
      assert.equal(h.db.prepare('SELECT count(*) total FROM auth_login_throttles WHERE key_hash=?').get(keys.account).total, 1)
      assert.equal(h.db.prepare("SELECT count(*) total FROM operation_logs WHERE action='login'").get().total, 1)
    }
    finally { h.close() }
  })

  test(`${kind}: inconsistent joined credential and session rows fail closed as protocol errors`, async () => {
    const h = createAuthHarness(kind)
    try {
      await h.createAdmin()
      const created = await h.authentication.login({ username: 'root-admin', password: PASSWORD, network: null, requestId: 'protocol-login' })
      const corrupting = {
        kind: h.adapter.kind,
        metrics: h.adapter.metrics,
        async execute(command) {
          const result = await h.adapter.execute(command)
          const rows = result.rows.map(row => ({ ...row }))
          if (rows.length > 1 && command.sql.includes('FROM auth_users u')) rows[1].role_active = 0
          if (rows.length > 1 && command.sql.includes('FROM auth_sessions s')) rows[1].expires_at = '2099-01-01T00:00:00.000Z'
          return { ...result, rows }
        },
        batch(commands) { return h.adapter.batch(commands) },
      }
      const store = new core.AuthStore(corrupting)
      await assert.rejects(() => store.findCredentialByUsername('root-admin'), error => error.code === 'AUTH_PROTOCOL')
      await assert.rejects(() => store.resolveSessionByHash(created.sessionHash), error => error.code === 'AUTH_PROTOCOL')
    }
    finally { h.close() }
  })
}
