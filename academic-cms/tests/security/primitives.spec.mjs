import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { security, TestPbkdf2Engine } from '../helpers/offline-security.mjs'

const secret = 'a-secure-auth-secret-that-is-longer-than-thirty-two-bytes'

test('base64url codec is canonical and rejects malformed encodings', () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => index)
  const encoded = security.base64UrlEncode(bytes)
  assert.equal(encoded.length, 43)
  assert.deepEqual([...security.base64UrlDecode(encoded)], [...bytes])
  for (const malformed of ['', 'A', 'AB', 'abc=', 'abc+', 'abc/']) {
    assert.throws(() => security.base64UrlDecode(malformed), /base64url/i)
  }
})

test('password service creates salted versioned hashes and constant-work verification', async () => {
  const engine = new TestPbkdf2Engine()
  const deterministicCrypto = { getRandomValues(array) { array.fill(engine.calls.length + 7); return array } }
  const passwords = new security.PasswordService(engine, deterministicCrypto)
  const first = await passwords.hash('Long unique passphrase 甲 2026!')
  const second = await passwords.hash('Long unique passphrase 甲 2026!')
  assert.notEqual(first, second)
  assert.match(first, /^pbkdf2-sha256\$600000\$/)
  assert.deepEqual(await passwords.verify('Long unique passphrase 甲 2026!', first), { valid: true, needsRehash: false })
  assert.deepEqual(await passwords.verify('wrong password value', first), { valid: false, needsRehash: false })
  const before = engine.calls.length
  assert.deepEqual(await passwords.verify('anything', 'not-a-password-hash'), { valid: false, needsRehash: false })
  assert.equal(engine.calls.length, before + 1, 'invalid stored hashes still perform one bounded KDF')
  assert.equal(first.includes('Long unique'), false)
})

test('password policy counts Unicode code points, normalizes NFC and accepts common/contextual six-character values', async () => {
  const accepted = await security.validateNewPassword('Å-cobalt-violet-forest-2026!', { username: 'researcher' })
  assert.equal(accepted.normalized, accepted.normalized.normalize('NFC'))
  await assert.rejects(() => security.validateNewPassword('short', {}), error => error.code === 'AUTH_PASSWORD_POLICY')
  assert.equal((await security.validateNewPassword('123456', { username: 'admin' })).codePoints, 6)
  assert.equal((await security.validateNewPassword('researcher123456', { username: 'researcher' })).normalized, 'researcher123456')
})

test('opaque sessions store a HMAC hash and derive a session-bound CSRF token', async () => {
  const tokens = new security.AuthTokenService(secret, webcrypto.subtle, webcrypto)
  const material = await tokens.createSessionMaterial()
  assert.equal(material.sessionToken.length, 43)
  assert.match(material.sessionHash, /^[0-9a-f]{64}$/)
  assert.equal(material.csrfToken.length, 43)
  assert.equal(material.sessionHash.includes(material.sessionToken), false)
  assert.equal(await tokens.verifyCsrf(material.sessionToken, material.csrfToken, material.csrfToken), true)
  assert.equal(await tokens.verifyCsrf(material.sessionToken, material.csrfToken, material.csrfToken.slice(0, -1) + (material.csrfToken.endsWith('A') ? 'B' : 'A')), false)
  const another = await tokens.createSessionMaterial()
  assert.equal(await tokens.verifyCsrf(another.sessionToken, material.csrfToken, material.csrfToken), false)
})

test('runtime authentication config rejects placeholders and insecure production origins', () => {
  assert.throws(() => security.parseAuthConfig({ authSecret: 'secret' }), error => error.code === 'AUTH_CONFIG')
  assert.throws(() => security.parseAuthConfig({ authSecret: secret, trustedOrigins: 'http://example.test' }, true), error => error.code === 'AUTH_CONFIG')
  const config = security.parseAuthConfig({ authSecret: secret, trustedOrigins: 'https://example.test,https://example.test', secureCookies: true }, true)
  assert.deepEqual(config.trustedOrigins, ['https://example.test'])
  assert.equal(config.secureCookies, true)
})

test('production cookie policy uses __Host names and strict host-only attributes', () => {
  const secure = security.cookiePolicy(true, 28800)
  assert.equal(secure.sessionName, '__Host-academic-cms-session')
  assert.equal(secure.csrfName, '__Host-academic-cms-csrf')
  assert.deepEqual(secure.session, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 28800 })
  assert.deepEqual(secure.csrf, { httpOnly: false, secure: true, sameSite: 'strict', path: '/', maxAge: 28800 })
  const local = security.cookiePolicy(false, 28800)
  assert.equal(local.sessionName, 'academic-cms-session')
})


test('refreshed CSRF cookies are capped by the server-side absolute session expiry', () => {
  const now = Date.parse('2026-08-29T00:00:00.000Z')
  assert.equal(security.remainingCookieLifetimeSeconds('2026-08-29T00:30:00.000Z', 28_800, now), 1800)
  assert.equal(security.remainingCookieLifetimeSeconds('2026-08-30T00:00:00.000Z', 28_800, now), 28_800)
  assert.equal(security.remainingCookieLifetimeSeconds('2026-08-28T23:59:59.999Z', 28_800, now), 0)
  assert.throws(() => security.remainingCookieLifetimeSeconds('not-a-date', 28_800, now), error => error.code === 'AUTH_PROTOCOL')
})

test('security header builder contains required defenses and a nonce-scoped CSP', () => {
  const nonce = security.createCspNonce(webcrypto)
  const headers = security.buildSecurityHeaders({ nonce, production: true })
  assert.match(headers['content-security-policy'], new RegExp(`script-src 'nonce-${nonce}'`))
  assert.match(headers['content-security-policy'], /frame-ancestors 'none'/)
  assert.equal(headers['x-content-type-options'], 'nosniff')
  assert.equal(headers['x-frame-options'], 'DENY')
  assert.match(headers['strict-transport-security'], /max-age=63072000/)
  assert.match(headers['permissions-policy'], /camera=\(\)/)
})
