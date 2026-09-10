import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { security } from '../helpers/offline-security.mjs'

const secret = 'request-protection-secret-with-at-least-thirty-two-bytes'
const trusted = ['https://cms.example.test']

async function request(overrides = {}) {
  const tokens = new security.AuthTokenService(secret, webcrypto.subtle, webcrypto)
  const material = await tokens.createSessionMaterial()
  return {
    tokens,
    material,
    input: {
      method: 'POST',
      contentType: 'application/json; charset=utf-8',
      origin: trusted[0],
      secFetchSite: 'same-origin',
      requestUrl: 'https://cms.example.test/api/v1/admin/publications',
      trustedOrigins: trusted,
      cookieAuthenticated: true,
      sessionToken: material.sessionToken,
      csrfHeader: material.csrfToken,
      csrfCookie: material.csrfToken,
      tokens,
      ...overrides,
    },
  }
}

test('unsafe cookie-authenticated JSON requests require exact origin, fetch metadata and bound CSRF', async () => {
  const good = await request()
  await security.protectUnsafeRequest(good.input)
  for (const changes of [
    { origin: 'https://evil.example' },
    { origin: null },
    { secFetchSite: 'cross-site' },
    { contentType: 'text/plain' },
    { csrfHeader: 'A'.repeat(43) },
    { csrfCookie: 'A'.repeat(43) },
  ]) {
    const candidate = await request(changes)
    await assert.rejects(() => security.protectUnsafeRequest(candidate.input), error => ['AUTH_ORIGIN', 'AUTH_CSRF', 'AUTH_UNSUPPORTED_MEDIA_TYPE'].includes(error.code))
  }
})

test('safe methods do not require CSRF and non-cookie bootstrap still requires same origin JSON', async () => {
  const get = await request({ method: 'GET', origin: null, contentType: null, csrfHeader: null, csrfCookie: null })
  await security.protectUnsafeRequest(get.input)
  const bootstrap = await request({ cookieAuthenticated: false, csrfHeader: null, csrfCookie: null, sessionToken: null })
  await security.protectUnsafeRequest(bootstrap.input)
  const crossSite = await request({ cookieAuthenticated: false, origin: 'https://evil.example', csrfHeader: null, csrfCookie: null, sessionToken: null })
  await assert.rejects(() => security.protectUnsafeRequest(crossSite.input), error => error.code === 'AUTH_ORIGIN')
})

test('client network selection trusts only platform-owned or explicitly configured proxy hops', () => {
  assert.equal(security.selectClientNetwork({ runtimeKind: 'cloudflare', cloudflareConnectingIp: '203.0.113.8', forwardedFor: '1.1.1.1', remoteAddress: null, trustedProxyHops: 0 }), '203.0.113.8')
  assert.equal(security.selectClientNetwork({ runtimeKind: 'node', cloudflareConnectingIp: null, forwardedFor: '198.51.100.1, 10.0.0.2', remoteAddress: '10.0.0.9', trustedProxyHops: 1 }), '10.0.0.2')
  assert.equal(security.selectClientNetwork({ runtimeKind: 'node', cloudflareConnectingIp: null, forwardedFor: '198.51.100.1', remoteAddress: '127.0.0.1', trustedProxyHops: 0 }), '127.0.0.1')
  assert.equal(security.selectClientNetwork({ runtimeKind: 'unknown', cloudflareConnectingIp: '203.0.113.8', forwardedFor: null, remoteAddress: null, trustedProxyHops: 0 }), null)
})

test('audit sanitizer does not invoke getters and redacts credentials recursively', () => {
  let invoked = false
  const value = {
    username: 'person',
    password: 'never-store-me',
    nested: { csrf_token: 'csrf-value', safe: 'ok' },
  }
  Object.defineProperty(value, 'danger', { enumerable: true, get() { invoked = true; throw new Error('getter executed') } })
  const sanitized = security.sanitizeAuditDetail(value)
  assert.equal(invoked, false)
  assert.equal(sanitized.password, '[REDACTED]')
  assert.equal(sanitized.nested.csrf_token, '[REDACTED]')
  assert.equal(sanitized.nested.safe, 'ok')
  assert.equal(sanitized.danger, '[UNSUPPORTED_ACCESSOR]')
  assert.doesNotMatch(JSON.stringify(sanitized), /never-store-me|csrf-value/)
})

test('audit command keeps values bound and rejects condition statement injection', () => {
  const command = security.buildAuditCommand({ uid: 'audit:1', at: '2026-08-29T00:00:00.000Z', action: 'save', module: 'auth', detail: { token: 'secret', safe: 1 } })
  assert.equal(command.sql.includes('secret'), false)
  assert.equal(command.params.some(value => typeof value === 'string' && value.includes('secret')), false)
  for (const sql of ['1=1; DROP TABLE auth_users', '1=1 -- bypass', '1=1 /* bypass */']) {
    assert.throws(() => security.buildAuditCommand({ uid: 'audit:2', at: '2026-08-29T00:00:00.000Z', action: 'save', module: 'auth', condition: { sql } }), error => error.code === 'AUTH_INPUT')
  }
})
