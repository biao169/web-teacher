import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { core, root } from '../helpers/offline-security.mjs'

function stream(bytes, chunkSize = bytes.length || 1) {
  let offset = 0
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close()
      const next = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize))
      offset += next.length
      controller.enqueue(next)
    },
  })
}

function jsonBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value))
}

test('bounded JSON reader validates declared and streamed byte sizes', async () => {
  const bytes = jsonBytes({ username: 'researcher', password: 'long value' })
  assert.deepEqual(await core.parseBoundedJsonStream(stream(bytes, 3), String(bytes.length), 1024), { username: 'researcher', password: 'long value' })
  await assert.rejects(core.parseBoundedJsonStream(stream(bytes), String(bytes.length + 1), 1024), error => error.code === 'AUTH_INPUT')
  await assert.rejects(core.parseBoundedJsonStream(stream(new Uint8Array(1025), 64), null, 1024), error => error.code === 'AUTH_PAYLOAD_TOO_LARGE' && error.statusCode === 413)
  assert.throws(() => core.validateContentLength('010', 1024), error => error.code === 'AUTH_INPUT')
  assert.throws(() => core.validateContentLength('1025', 1024), error => error.code === 'AUTH_PAYLOAD_TOO_LARGE')
})

test('bounded JSON reader rejects malformed UTF-8, empty input and invalid JSON', async () => {
  await assert.rejects(core.parseBoundedJsonStream(stream(Uint8Array.of(0xc3, 0x28)), '2', 1024), error => error.code === 'AUTH_INPUT')
  await assert.rejects(core.parseBoundedJsonStream(stream(new Uint8Array()), '0', 1024), error => error.code === 'AUTH_INPUT')
  const invalid = new TextEncoder().encode('{invalid')
  await assert.rejects(core.parseBoundedJsonStream(stream(invalid), String(invalid.length), 1024), error => error.code === 'AUTH_INPUT')
})

test('authentication JSON bodies reject compressed content encodings before decoding', () => {
  assert.doesNotThrow(() => core.validateContentEncoding(null))
  assert.doesNotThrow(() => core.validateContentEncoding('identity'))
  assert.throws(() => core.validateContentEncoding('gzip'), error => error.code === 'AUTH_UNSUPPORTED_MEDIA_TYPE')
  assert.throws(() => core.validateContentEncoding('identity, gzip'), error => error.code === 'AUTH_UNSUPPORTED_MEDIA_TYPE')
})

test('API security headers deny caching, framing, browser capabilities and content execution', () => {
  const headers = core.buildApiSecurityHeaders(true)
  assert.equal(headers['cache-control'], 'private, no-store, max-age=0')
  assert.match(headers['content-security-policy'], /default-src 'none'/)
  assert.match(headers['content-security-policy'], /frame-ancestors 'none'/)
  assert.equal(headers['x-frame-options'], 'DENY')
  assert.equal(headers['x-content-type-options'], 'nosniff')
  assert.equal(headers['x-robots-tag'], 'noindex, nofollow')
  assert.match(headers['strict-transport-security'], /63072000/)
})

test('Nuxt integration exposes complete auth routes and a mandatory admin wrapper', async () => {
  const required = [
    'server/routes/api/v1/auth/bootstrap.post.ts',
    'server/routes/api/v1/auth/login.post.ts',
    'server/routes/api/v1/auth/logout.post.ts',
    'server/routes/api/v1/auth/session.get.ts',
    'server/utils/admin-read-handler.ts',
    'server/utils/admin-write-handler.ts',
    'server/utils/admin-handler.ts',
    'server/utils/bounded-json.ts',
    'server/middleware/01-api-security.ts',
  ]
  for (const name of required) assert.ok((await readFile(resolve(root, name), 'utf8')).length > 100, `${name} is missing`)
  const login = await readFile(resolve(root, required[1]), 'utf8')
  assert.match(login, /protectJsonWrite/)
  assert.match(login, /readBoundedJsonBody/)
  assert.match(login, /setSessionCookies/)
  const logout = await readFile(resolve(root, required[2]), 'utf8')
  assert.match(logout, /protectJsonWrite\(event, runtime, hasSessionCookie \? 'session' : 'anonymous'\)/)
  assert.match(logout, /clearSessionCookies/)
  const adminRead = await readFile(resolve(root, 'server/utils/admin-read-handler.ts'), 'utf8')
  const adminWrite = await readFile(resolve(root, 'server/utils/admin-write-handler.ts'), 'utf8')
  assert.match(adminRead, /requireEventPermission/)
  assert.doesNotMatch(adminRead, /protectJsonWrite/)
  assert.match(adminWrite, /protectJsonWrite\(event, runtime, 'session'\)/)
  assert.match(adminWrite, /readBoundedJsonBody/)
  assert.match(adminWrite, /requireEventPermission/)
  const protection = adminWrite.indexOf("protectJsonWrite(event, runtime, 'session')")
  const body = adminWrite.indexOf('readBoundedJsonBody(event, maximumBytes)')
  const permission = adminWrite.indexOf('requireEventPermission(event, requirement.module, requirement.action)')
  assert.ok(protection >= 0 && body > protection && permission > body,
    'write request protection and bounded body parsing must precede the database-backed permission lookup')
})

test('nonce-based document CSP is not combined with reusable SSR HTML SWR', async () => {
  const config = await readFile(resolve(root, 'nuxt.config.ts'), 'utf8')
  assert.match(config, /nonce:\s*true/)
  assert.doesNotMatch(config, /['"]\/(?:zh|en)['"]\s*:\s*\{\s*swr:/)
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  assert.equal(pkg.dependencies.h3, '1.15.11')
})
