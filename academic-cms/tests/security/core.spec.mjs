import test from 'node:test'
import assert from 'node:assert/strict'
import { core, TestPbkdf2Engine } from '../helpers/offline-security.mjs'

const strongSecret = 'a-stage2-authentication-key-that-is-long-and-random-enough'

function principal(overrides = {}) {
  const permissions = core.emptyPermissionRecord()
  permissions.publications = core.permissionFlags({ view: true, create: false, edit: true, delete: false, export: true })
  return {
    sessionUid: 'session:test', userUid: 'user:test', username: 'researcher', displayName: 'Researcher', email: null,
    roleUid: 'role:test', roleName: 'Editor', roleLevel: 10, roleIsSystem: false,
    visibilityScopes: new Set(['public', 'authenticated', 'staff', 'owner']), permissions: Object.freeze(permissions), mustChangePassword: false,
    ...overrides,
  }
}

test('auth configuration rejects placeholders and fail-open production settings', () => {
  assert.throws(() => core.parseAuthConfig({ authSecret: 'change-this-secret-change-this-secret' }, true), /secret/i)
  assert.throws(() => core.parseAuthConfig({ authSecret: strongSecret }, true), /trusted origin/i)
  assert.throws(() => core.parseAuthConfig({ authSecret: strongSecret, trustedOrigins: 'https://cms.example', secureCookies: false }, true), /Secure cookies/i)
  const value = core.parseAuthConfig({
    authSecret: strongSecret,
    bootstrapToken: 'bootstrap-key-that-is-longer-than-thirty-two-bytes',
    trustedOrigins: ' https://cms.example,https://cms.example ',
    secureCookies: true,
  }, true)
  assert.deepEqual(value.trustedOrigins, ['https://cms.example'])
  assert.equal(value.sessionIdleSeconds, 1800)
  assert.equal(Object.isFrozen(value), true)
})

test('new password policy uses NFC and a six-code-point floor without composition or blocklist requirements', async () => {
  await assert.rejects(core.validateNewPassword('12345'), error => error.code === 'AUTH_PASSWORD_POLICY')
  for (const value of ['123456', 'abcdef', 'passwordpassword', 'teacher', '😀'.repeat(6)]) assert.equal((await core.validateNewPassword(value, { username: 'teacher' })).normalized, value)
  for (const value of ['', '😀'.repeat(5), 'x'.repeat(257), '\ud800123456']) await assert.rejects(core.validateNewPassword(value), error => error.code === 'AUTH_PASSWORD_POLICY')
  const accepted = await core.validateNewPassword('四季流转山河依旧星光落在书页上')
  assert.equal(accepted.normalized, '四季流转山河依旧星光落在书页上')
  const decomposed = `Cafe\u0301 has a very long passphrase`
  const normalized = await core.validateNewPassword(decomposed)
  assert.equal(normalized.normalized.includes('\u0301'), false)
})

test('password verification performs one bounded derivation for malformed and oversized inputs', async () => {
  const engine = new TestPbkdf2Engine()
  const service = new core.PasswordService(engine)
  const malformed = await service.verify('candidate-password', 'not-a-password-hash')
  assert.deepEqual(malformed, { valid: false, needsRehash: false })
  assert.equal(engine.calls.length, 1)
  const oversized = await service.verify('x'.repeat(2000), 'not-a-password-hash')
  assert.equal(oversized.valid, false)
  assert.equal(engine.calls.length, 2)
  assert.equal(engine.calls[1].password.length, 0)
  const malformedUnicode = await service.verify('valid prefix with an unpaired high surrogate \uD800', 'not-a-password-hash')
  assert.equal(malformedUnicode.valid, false)
  assert.equal(engine.calls.length, 3)
  assert.equal(engine.calls[2].password.length, 0)
})

test('password hashes round-trip with NFC-equivalent input and signal legacy work factors', async () => {
  const engine = new TestPbkdf2Engine()
  const service = new core.PasswordService(engine)
  const composed = 'Café is a long passphrase 2026'
  const encoded = await service.hash(composed)
  const valid = await service.verify('Cafe\u0301 is a long passphrase 2026', encoded)
  assert.deepEqual(valid, { valid: true, needsRehash: false })

  const parsed = core.parsePasswordHash(encoded)
  const legacySalt = Buffer.from(parsed.salt).toString('base64url')
  const legacyBytes = await engine.derive(new TextEncoder().encode(composed), parsed.salt, 500_000, 32)
  const legacy = `pbkdf2-sha256$500000$${legacySalt}$${Buffer.from(legacyBytes).toString('base64url')}`
  assert.deepEqual(await service.verify(composed, legacy), { valid: true, needsRehash: true })
})

test('session and CSRF tokens are domain-separated and verified in constant-length formats', async () => {
  const tokens = new core.AuthTokenService(strongSecret)
  const material = await tokens.createSessionMaterial()
  assert.equal(material.sessionToken.length, 43)
  assert.match(material.sessionHash, /^[0-9a-f]{64}$/)
  assert.equal(material.csrfToken.length, 43)
  assert.notEqual(material.sessionHash, material.csrfToken)
  assert.equal(await tokens.verifyCsrf(material.sessionToken, material.csrfToken, material.csrfToken), true)
  const tamperedCsrf = material.csrfToken.slice(0, -1) + (material.csrfToken.endsWith('A') ? 'B' : 'A')
  assert.equal(await tokens.verifyCsrf(material.sessionToken, material.csrfToken, tamperedCsrf), false)
  assert.notEqual(await tokens.throttleKey('account', 'researcher'), await tokens.throttleKey('network', 'researcher'))
})

test('cookie policy uses __Host cookies only when Secure can be guaranteed', () => {
  const production = core.cookiePolicy(true, 3600)
  assert.equal(production.sessionName, '__Host-academic-cms-session')
  assert.deepEqual(production.session, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600 })
  assert.equal(production.csrf.httpOnly, false)
  assert.equal(production.csrf.sameSite, 'strict')
  const development = core.cookiePolicy(false, 3600)
  assert.equal(development.sessionName, 'academic-cms-session')
  assert.equal(development.session.secure, false)
})

test('unsafe request protection requires JSON, same origin and bound CSRF for cookie sessions', async () => {
  const tokens = new core.AuthTokenService(strongSecret)
  const material = await tokens.createSessionMaterial()
  const base = {
    method: 'POST', contentType: 'application/json; charset=utf-8', origin: 'https://cms.example', secFetchSite: 'same-origin',
    requestUrl: 'https://cms.example/api/v1/auth/logout', trustedOrigins: ['https://cms.example'],
  }
  await core.protectUnsafeRequest({ ...base, cookieAuthenticated: false })
  await core.protectUnsafeRequest({ ...base, cookieAuthenticated: true, sessionToken: material.sessionToken, csrfCookie: material.csrfToken, csrfHeader: material.csrfToken, tokens })
  await assert.rejects(core.protectUnsafeRequest({ ...base, contentType: 'text/plain', cookieAuthenticated: false }), error => error.code === 'AUTH_UNSUPPORTED_MEDIA_TYPE')
  await assert.rejects(core.protectUnsafeRequest({ ...base, origin: 'https://evil.example', cookieAuthenticated: false }), error => error.code === 'AUTH_ORIGIN')
  await assert.rejects(core.protectUnsafeRequest({ ...base, cookieAuthenticated: true, sessionToken: material.sessionToken, csrfCookie: material.csrfToken, csrfHeader: 'x', tokens }), error => error.code === 'AUTH_CSRF')
})

test('origin and network selection do not trust forwarded client input by default', () => {
  assert.equal(core.canonicalizeOrigin('https://cms.example'), 'https://cms.example')
  assert.throws(() => core.canonicalizeOrigin('https://cms.example/path'))
  assert.equal(core.selectClientNetwork({ runtimeKind: 'node', forwardedFor: '198.51.100.1', remoteAddress: '127.0.0.1', trustedProxyHops: 0 }), '127.0.0.1')
  assert.equal(core.selectClientNetwork({ runtimeKind: 'node', forwardedFor: '198.51.100.1, 10.0.0.5', remoteAddress: '10.0.0.9', trustedProxyHops: 1 }), '10.0.0.5')
  assert.equal(core.selectClientNetwork({ runtimeKind: 'node', forwardedFor: '198.51.100.1, 10.0.0.5', remoteAddress: '10.0.0.9', trustedProxyHops: 2 }), '198.51.100.1')
  assert.equal(core.selectClientNetwork({ runtimeKind: 'cloudflare', cloudflareConnectingIp: '203.0.113.9', trustedProxyHops: 0 }), '203.0.113.9')
})

test('security headers include a per-response CSP nonce and deny ambient browser capabilities', () => {
  const nonce = core.createCspNonce()
  const headers = core.buildSecurityHeaders({ nonce, production: true })
  assert.match(headers['content-security-policy'], new RegExp(`script-src 'nonce-${nonce}'`))
  assert.match(headers['content-security-policy'], /object-src 'none'/)
  assert.equal(headers['x-frame-options'], 'DENY')
  assert.match(headers['strict-transport-security'], /includeSubDomains/)
  assert.equal(headers['x-content-type-options'], 'nosniff')
})

test('audit sanitizer redacts mixed naming styles and never evaluates getters', () => {
  let invoked = false
  const source = { sessionToken: 'raw', password_hash: 'raw', safe: 'ok\nnext' }
  Object.defineProperty(source, 'authorization', { enumerable: true, get() { invoked = true; return 'Bearer raw' } })
  source.self = source
  const clean = core.sanitizeAuditDetail(source)
  assert.equal(invoked, false)
  assert.equal(clean.sessionToken, '[REDACTED]')
  assert.equal(clean.password_hash, '[REDACTED]')
  assert.equal(clean.authorization, '[REDACTED]')
  assert.equal(clean.safe, 'ok next')
  assert.equal(clean.self, '[CIRCULAR]')
  assert.doesNotMatch(JSON.stringify(clean), /Bearer raw|password_hash":"raw|sessionToken":"raw/)
})

test('permissions are default-deny, password-change constrained and role-level bounded', () => {
  const editor = principal()
  assert.equal(core.hasPermission(editor, 'publications', 'edit'), true)
  assert.equal(core.hasPermission(editor, 'auth', 'edit'), false)
  assert.throws(() => core.requirePermission(null, 'publications', 'view'), error => error.code === 'AUTH_REQUIRED')
  const forcedChange = principal({ mustChangePassword: true })
  assert.equal(core.hasPermission(forcedChange, 'publications', 'edit'), false)
  assert.throws(() => core.requirePermission(forcedChange, 'publications', 'view'), error => error.code === 'AUTH_PASSWORD_CHANGE_REQUIRED')
  assert.throws(() => core.requirePermission(forcedChange, 'auth', 'edit'), error => error.code === 'AUTH_PASSWORD_CHANGE_REQUIRED')
  assert.deepEqual(core.toSafeUserView(forcedChange).permissions, {})
  assert.equal(core.canManageRole(editor, { uid: 'role:lower', level: 5, isSystem: false }), false)
  const adminPermissions = core.emptyPermissionRecord()
  adminPermissions.auth = core.permissionFlags({ view: true, create: true, edit: true, delete: false, export: true })
  assert.equal(core.canManageRole(principal({ permissions: adminPermissions, roleLevel: 10 }), { uid: 'role:lower', level: 5, isSystem: false }), true)
})

test('visibility access distinguishes public, authenticated, staff, owner and hidden', () => {
  const editor = principal()
  assert.equal(core.canAccessVisibility({ visibility: 'public', principal: null }), true)
  assert.equal(core.canAccessVisibility({ visibility: 'authenticated', principal: editor }), true)
  assert.equal(core.canAccessVisibility({ visibility: 'staff', principal: editor }), true)
  assert.equal(core.canAccessVisibility({ visibility: 'owner', principal: editor, ownerUid: 'user:test' }), true)
  assert.equal(core.canAccessVisibility({ visibility: 'owner', principal: editor, ownerUid: 'other' }), false)
  assert.equal(core.canAccessVisibility({ visibility: 'hidden', principal: editor }), false)
  assert.deepEqual(core.readableNonOwnerScopes(editor), ['public', 'authenticated', 'staff'])
  const forcedChange = principal({ mustChangePassword: true })
  assert.equal(core.canAccessVisibility({ visibility: 'authenticated', principal: forcedChange }), false)
  assert.deepEqual(core.readableNonOwnerScopes(forcedChange), ['public'])
})

test('session policy caps idle renewal at the absolute expiry', () => {
  const policy = { idleSeconds: 600, absoluteSeconds: 900, touchSeconds: 60 }
  const start = new Date('2026-08-29T00:00:00.000Z')
  const times = core.newSessionTimes(start, policy)
  assert.equal(times.idleExpiresAt, '2026-08-29T00:10:00.000Z')
  const touch = core.nextSessionTouch(new Date('2026-08-29T00:08:00.000Z'), times.lastSeenAt, times.expiresAt, policy)
  assert.equal(touch.due, true)
  assert.equal(touch.idleExpiresAt, times.expiresAt)
  assert.equal(core.sessionInvalidReason({ now: new Date(times.expiresAt), revokedAt: null, idleExpiresAt: times.expiresAt, expiresAt: times.expiresAt, userStatus: 'active', roleActive: true }), 'absolute_timeout')
})
