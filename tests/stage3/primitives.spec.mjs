import assert from 'node:assert/strict'
import test from 'node:test'
import { core } from '../helpers/offline-stage3.mjs'

const {
  normalizeManagedObjectKey, encodeObjectKeyPath, decodeObjectKeyPath, normalizeExternalMediaUrl,
  parseSingleRange, safeMimeType, isInlineMediaType, contentDisposition,
  stablePublicJson, parsePublicJson,
  buildSourceRefKey, parseSourceRefKey, canonicalSourceText,
  MediaGrantService,
} = core

test('managed object keys are portable and canonically encoded', () => {
  const key = normalizeManagedObjectKey('profiles/张三/avatar_1.webp')
  assert.equal(decodeObjectKeyPath(encodeObjectKeyPath(key)), key)
  for (const value of ['/root/file', '../file', 'a//b', 'a\\b', 'a/%2f/b', 'a/CON', 'portable/name.']) {
    assert.throws(() => normalizeManagedObjectKey(value))
  }
  assert.equal(normalizeExternalMediaUrl('https://EXAMPLE.com/media/a.pdf'), 'https://example.com/media/a.pdf')
  assert.throws(() => normalizeExternalMediaUrl('http://example.com/a'))
})

test('range, MIME and disposition helpers fail closed', () => {
  assert.deepEqual(parseSingleRange('bytes=2-5', 10), { offset: 2, end: 5, length: 4 })
  assert.deepEqual(parseSingleRange('bytes=-3', 10), { offset: 7, end: 9, length: 3 })
  assert.throws(() => parseSingleRange('bytes=1-2,4-5', 10))
  assert.throws(() => parseSingleRange('bytes=10-', 10))
  assert.equal(safeMimeType('image/svg+xml'), 'application/octet-stream')
  assert.equal(safeMimeType('video/mp4'), 'video/mp4')
  assert.equal(isInlineMediaType('video/webm'), true)
  assert.equal(isInlineMediaType('text/plain'), false)
  assert.match(contentDisposition('研究;报告.pdf', true), /^attachment;/)
  assert.doesNotThrow(() => contentDisposition(`${'a'.repeat(179)}😀.pdf`, true))
})

test('public ViewModel is deterministic and rejects executable or sensitive shapes', async () => {
  const left = stablePublicJson({ z: 1, a: 'e\u0301', nested: { b: true, a: null } })
  const right = stablePublicJson({ nested: { a: null, b: true }, a: 'é', z: 1 })
  assert.equal(left.json, right.json)
  assert.deepEqual(parsePublicJson(left.json), left.value)
  assert.throws(() => stablePublicJson({ passwordHash: 'nope' }))
  assert.throws(() => stablePublicJson({ value: undefined }))
  const circular = {}; circular.self = circular
  assert.throws(() => stablePublicJson(circular))
  const sparse = []; sparse[2] = 'x'
  assert.throws(() => stablePublicJson(sparse))
  let getterCalls = 0
  const accessor = Object.defineProperty({}, 'value', { enumerable: true, get() { getterCalls += 1; return 'x' } })
  assert.throws(() => stablePublicJson(accessor))
  assert.equal(getterCalls, 0)
})

test('source references round-trip arbitrary stable UIDs without delimiter ambiguity', () => {
  const key = buildSourceRefKey({ entity: 'profiles', uid: 'tenant:A/张三', field: 'bio' })
  assert.deepEqual(parseSourceRefKey(key), { entity: 'profiles', uid: 'tenant:A/张三', field: 'bio' })
  assert.throws(() => parseSourceRefKey('profiles/not%2fcanonical/bio'))
})

test('translation source canonicalization rejects invalid Unicode', () => {
  assert.equal(canonicalSourceText('a\r\nb\rc'), 'a\nb\nc')
  assert.throws(() => canonicalSourceText('\ud800'))
})

test('media grants are signed, scoped, stable within a bucket and expire', async () => {
  let now = new Date('2026-08-29T00:00:10.000Z')
  const grants = new MediaGrantService('s'.repeat(48), { publicSeconds: 30, privateSeconds: 30, clock: () => now })
  const input = { key: 'files/paper.pdf', scope: 'private', subject: 'user:1', purpose: 'publication_pdf', disposition: 'inline', allowDownload: false, assetRevision: 'asset-r1', referenceRevision: 'record-r1', generations: { 'record:publications:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': 0 } }
  const first = await grants.issue(input)
  const second = await grants.issue(input)
  assert.equal(first, second)
  const claims = await grants.verify(first, input.key)
  grants.authorizeSubject(claims, 'user:1')
  assert.throws(() => grants.authorizeSubject(claims, 'user:2'))
  await assert.rejects(() => grants.verify(`${first.slice(0, -1)}A`, input.key))
  now = new Date('2026-08-29T00:02:00.000Z')
  await assert.rejects(() => grants.verify(first, input.key))
})
