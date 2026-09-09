import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root } from '../helpers/offline-security.mjs'

const read = path => readFileSync(resolve(root, path), 'utf8')

test('cookie-authenticated write protection wires both CSRF channels and the session-bound token service', () => {
  const source = read('server/utils/auth-http.ts')
  assert.match(source, /getCookie\(event, runtime\.cookies\.sessionName\)/)
  assert.match(source, /getCookie\(event, runtime\.cookies\.csrfName\)/)
  assert.match(source, /getHeader\(event, CSRF_HEADER\)/)
  assert.match(source, /tokens: runtime\.tokens/)
  assert.match(source, /trustedOrigins: runtime\.config\.trustedOrigins/)
})

test('admin write and read wrappers keep browser write protection separate from database-backed permission checks', () => {
  const write = read('server/utils/admin-write-handler.ts')
  const readHandler = read('server/utils/admin-read-handler.ts')
  const guard = read('server/utils/auth-guard.ts')
  const protection = write.indexOf("protectJsonWrite(event, runtime, 'session')")
  const body = write.indexOf('readBoundedJsonBody(event, maximumBytes)')
  const permission = write.indexOf('requireEventPermission(event, requirement.module, requirement.action)')
  assert.ok(protection >= 0)
  assert.ok(body > protection)
  assert.ok(permission > body, 'origin/content-type/CSRF protection must run before the database-backed permission lookup')
  assert.match(readHandler, /requireEventPermission/)
  assert.doesNotMatch(readHandler, /protectJsonWrite/)
  assert.match(guard, /resolveOptionalSession/)
  assert.match(guard, /requirePermission\(active\.principal, module, action\)/)
})

test('bounded body integration rejects compressed request bodies and session GET avoids unconditional cookie writes', () => {
  const bounded = read('server/utils/bounded-json.ts')
  assert.match(bounded, /getHeader\(event, 'content-encoding'\)/)
  assert.match(bounded, /validateContentEncoding/)
  const http = read('server/utils/auth-http.ts')
  assert.match(http, /export function refreshCsrfCookie/)
  assert.match(http, /getCookie\(event, runtime\.cookies\.csrfName\)/)
})

test('bootstrap API returns only safe account fields and never returns credentials or session material', () => {
  const source = read('server/routes/api/v1/auth/bootstrap.post.ts')
  assert.match(source, /presentedToken: bearerToken\(event\)/)
  assert.match(source, /protectJsonWrite\(event, runtime\)/)
  assert.doesNotMatch(source, /sessionToken\s*:/)
  assert.doesNotMatch(source, /csrfToken\s*:/)
  const response = source.slice(source.indexOf('return {'))
  assert.doesNotMatch(response, /password/)
})

test('runtime secrets remain private and security dependencies are exact pinned versions', () => {
  const config = read('nuxt.config.ts')
  const publicBlock = config.slice(config.indexOf('public: {'), config.indexOf('nitro: {'))
  assert.doesNotMatch(publicBlock, /authSecret|bootstrapToken/)
  assert.match(config, /modules: \['@nuxt\/eslint', 'nuxt-security'\]/)
  assert.match(config, /nonce: true/)
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.dependencies['nuxt-security'], '2.6.0')
  assert.equal(pkg.dependencies.zod, '4.5.1')
  assert.equal(pkg.dependencies.jsonwebtoken, undefined)
  assert.equal(pkg.dependencies.jose, undefined)
})

test('shared auth schemas use code-point and UTF-8 bounds rather than UTF-16 max length', () => {
  const source = read('shared/schemas/auth.ts')
  assert.match(source, /codePointLength/)
  assert.match(source, /utf8ByteLength/)
  assert.match(source, /hasUnpairedSurrogate/)
  assert.doesNotMatch(source, /\.max\(/)
})

test('server-side permission guard resolves an active session and checks explicit module action', () => {
  const source = read('server/utils/auth-guard.ts')
  assert.match(source, /resolveOptionalSession/)
  assert.match(source, /requirePermission\(active\.principal, module, action\)/)
  assert.match(source, /AUTH_REQUIRED/)
})


test('HTTP authentication helpers use explicit protection modes and bounded CSRF cookie refresh', () => {
  const helper = read('server/utils/auth-http.ts')
  const logout = read('server/routes/api/v1/auth/logout.post.ts')
  const adminWrite = read('server/utils/admin-write-handler.ts')
  const adminRead = read('server/utils/admin-read-handler.ts')
  const session = read('server/routes/api/v1/auth/session.get.ts')
  assert.match(helper, /export function refreshCsrfCookie/)
  assert.match(helper, /remainingCookieLifetimeSeconds/)
  assert.match(logout, /hasSessionCookie \? 'session' : 'anonymous'/)
  assert.match(adminWrite, /protectJsonWrite\(event, runtime, 'session'\)/)
  assert.doesNotMatch(adminRead, /protectJsonWrite/)
  assert.equal(logout.includes('protectJsonWrite(event, runtime, true)'), false)
  assert.equal(logout.includes('protectJsonWrite(event, runtime, false)'), false)
  assert.equal(adminWrite.includes('protectJsonWrite(event, runtime, true)'), false)
  assert.match(session, /refreshCsrfCookie\(event, runtime, session\.csrfToken, session\.expiresAt\)/)
})


test('session audit atomicity does not depend on connection-local changes state', () => {
  const source = read('server/services/auth/auth-store.ts')
  assert.doesNotMatch(source, /changes\(\)/)
  const auditIndex = source.indexOf('buildAuditCommand({', source.indexOf('async revokeSessionByHash'))
  const updateIndex = source.indexOf('update,', auditIndex)
  assert.ok(auditIndex >= 0 && updateIndex > auditIndex)
})
