import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { core, createHarness, insert } from '../helpers/offline-stage3.mjs'
import { R2BucketDouble } from '../helpers/stage3-doubles.mjs'

const encoder = new TextEncoder()
function hasCode(code) { return error => error?.code === code }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

async function withTempDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'academic-cms-stage3-adversarial-'))
  try { await run(directory) }
  finally { await rm(directory, { recursive: true, force: true }) }
}

test('local store removes the published object when post-link verification fails', async () => {
  await withTempDirectory(async root => {
    const store = new core.LocalMediaStore(root, { maxObjectBytes: 1024 })
    const bytes = encoder.encode('atomic-local')
    const originalHead = store.head.bind(store)
    store.head = async () => null
    await assert.rejects(() => store.put({
      key: 'atomic/object.bin', body: bytes, size: bytes.byteLength,
      contentType: 'application/octet-stream', checksumSha256: sha256(bytes),
    }), hasCode('MEDIA_STORAGE'))
    store.head = originalHead
    assert.equal(await originalHead('atomic/object.bin'), null)
    await assert.rejects(() => readFile(join(root, 'atomic', 'object.bin')), error => error?.code === 'ENOENT')
  })
})

test('R2 store removes a newly-created object when returned metadata violates the contract', async () => {
  class WrongSizeBucket extends R2BucketDouble {
    async put(key, body, options) {
      const object = await super.put(key, body, options)
      return object ? { ...object, size: object.size + 1 } : null
    }
  }
  const bucket = new WrongSizeBucket()
  const store = new core.R2MediaStore(bucket)
  const bytes = encoder.encode('r2-cleanup')
  await assert.rejects(() => store.put({
    key: 'atomic/r2.bin', body: bytes, size: bytes.byteLength,
    contentType: 'application/octet-stream', checksumSha256: sha256(bytes),
  }), hasCode('MEDIA_PROTOCOL'))
  assert.equal(bucket.objects.has('atomic/r2.bin'), false)
  assert.equal(bucket.calls.delete, 1)
})

test('translation duplicate detection cannot collide null with literal sentinel text', async () => {
  const harness = createHarness('sqlite')
  try {
    const reader = new core.TranslationBatchReader(new core.TranslationStore(harness.adapter))
    const ref = core.buildSourceRefKey({ entity: 'news', uid: 'news:sentinel', field: 'title' })
    await assert.rejects(() => reader.localize('zh', [
      { sourceRefKey: ref, sourceText: null, manualText: '<null>' },
      { sourceRefKey: ref, sourceText: '<null>', manualText: null },
    ]), hasCode('I18N_INPUT'))
  }
  finally { harness.close() }
})

test('memory cache rejects an invalid runtime clock without publishing immortal entries', async () => {
  const cache = new core.MemoryCacheAdapter({ now: () => Number.NaN })
  await assert.rejects(() => cache.put('bad-clock', { bytes: encoder.encode('x'), etag: null }, 30), hasCode('CACHE_PROTOCOL'))
  assert.equal(cache.size, 0)
})

function seedMedia(harness) {
  insert(harness.db, 'INSERT INTO global_settings (uid, news_pdf_allow_download) VALUES (?, 1)', 'settings:adversarial')
  insert(harness.db, `INSERT INTO media_assets
    (uid, object_key, title, mime_type, size, storage_kind, status, checksum)
    VALUES (?, ?, ?, ?, ?, 'local', 'active', ?)`,
  'media:adversarial', 'publications/adversarial.pdf', 'Adversarial.pdf', 'application/pdf', 1, sha256(encoder.encode('x')))
}

function validProjection(overrides = {}) {
  return {
    objectKey: 'publications/adversarial.pdf', module: 'publications', recordUid: 'publication:adversarial',
    visibility: 'public', purpose: 'publication_pdf', referenceRevision: 'revision:1',
    alt: 'PDF', disposition: 'inline', allowDownload: true, ...overrides,
  }
}

test('media projection rejects invalid runtime enum values instead of signing malformed capabilities', async () => {
  const harness = createHarness('sqlite')
  try {
    seedMedia(harness)
    const noStorage = { kind: 'local', async head() { return null }, async read() { return null }, async put() { throw new Error('unused') }, async delete() { return false } }
    const service = new core.MediaService(
      new core.MediaCatalogStore(harness.adapter), { local: noStorage },
      new core.MediaGrantService('v'.repeat(48), { clock: () => new Date('2026-08-29T00:00:00.000Z') }),
    )
    for (const invalid of [
      { module: 'not_a_module' },
      { visibility: 'world' },
      { secondaryVisibility: 'world' },
      { purpose: 'executable' },
      { disposition: 'open' },
      { fallback: 'broken-image' },
      { referenceRevision: '' },
      { objectKey: 42 },
      { alt: '\ud800' },
    ]) {
      await assert.rejects(() => service.project([validProjection(invalid)], null), hasCode('MEDIA_INPUT'))
    }
  }
  finally { harness.close() }
})

test('media grant issuer validates every enum and boolean before signing', async () => {
  const grants = new core.MediaGrantService('s'.repeat(48), { clock: () => new Date('2026-08-29T00:00:00.000Z') })
  const base = {
    key: 'publications/adversarial.pdf', scope: 'public', purpose: 'publication_pdf', disposition: 'inline',
    allowDownload: true, assetRevision: 'asset:1', referenceRevision: 'record:1', generations: { 'public:media': 0 },
  }
  await assert.rejects(() => grants.issue({ ...base, purpose: 'script' }), hasCode('MEDIA_INPUT'))
  await assert.rejects(() => grants.issue({ ...base, disposition: 'execute' }), hasCode('MEDIA_INPUT'))
  await assert.rejects(() => grants.issue({ ...base, allowDownload: 1 }), hasCode('MEDIA_INPUT'))
  await assert.rejects(() => grants.issue({ ...base, scope: 'shared', subject: 'user:1' }), hasCode('MEDIA_INPUT'))
})

test('static fetch store rejects a 206 response for the wrong requested interval', async () => {
  const fetcher = {
    async fetch(request) {
      assert.equal(request.headers.get('range'), 'bytes=2-4')
      return new Response(encoder.encode('123'), {
        status: 206,
        headers: {
          'content-length': '3',
          'content-range': 'bytes 3-5/10',
          etag: '"wrong-range"',
          'last-modified': 'Sat, 29 Aug 2026 00:00:00 GMT',
          'content-type': 'application/octet-stream',
        },
      })
    },
  }
  const store = new core.FetchMediaStore(fetcher)
  await assert.rejects(() => store.read('static/wrong.bin', { range: { offset: 2, length: 3 } }), hasCode('MEDIA_PROTOCOL'))
})
