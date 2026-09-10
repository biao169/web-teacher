import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { core, createHarness, insert, load } from '../helpers/offline-stage3.mjs'
import { streamBytes } from '../helpers/stage3-doubles.mjs'

const { parseCacheConfig } = load('server/cache/config.js')
const encoder = new TextEncoder()
function hasCode(code) { return error => error?.code === code }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

test('default cache configuration is internally compatible with the public cache budget', () => {
  const config = parseCacheConfig({})
  assert.equal(config.maxEntryBytes, 2 * 1024 * 1024)
  const harness = createHarness('sqlite')
  try {
    const generations = new core.CacheGenerationStore(harness.adapter)
    assert.doesNotThrow(() => new core.PublicCacheService(
      new core.MemoryCacheAdapter({ maxBytes: config.maxBytes, maxEntryBytes: config.maxEntryBytes }),
      generations,
      { maxPayloadBytes: config.maxPayloadBytes },
    ))
  }
  finally { harness.close() }
})

test('media delivery requires catalog size to exactly match storage, including zero-sized catalog rows', async () => {
  const harness = createHarness('sqlite')
  try {
    const bytes = encoder.encode('x')
    insert(harness.db, 'INSERT INTO global_settings (uid, news_pdf_allow_download) VALUES (?, 1)', 'settings:size')
    insert(harness.db, `INSERT INTO media_assets
      (uid, object_key, title, mime_type, size, storage_kind, status, checksum)
      VALUES (?, ?, ?, ?, 0, 'local', 'active', NULL)`,
    'media:size', 'generic/size.bin', 'size.bin', 'application/octet-stream')
    const head = {
      key: 'generic/size.bin', size: 1, etag: '"size-1"',
      lastModified: new Date('2026-08-29T00:00:00.000Z'), contentType: 'application/octet-stream', checksumSha256: sha256(bytes),
    }
    const store = {
      kind: 'local',
      async head() { return head },
      async read() { return { head, body: new Blob([bytes]).stream(), range: null } },
      async put() { throw new Error('unused') }, async delete() { return false },
    }
    const service = new core.MediaService(
      new core.MediaCatalogStore(harness.adapter), { local: store },
      new core.MediaGrantService('z'.repeat(48), { clock: () => new Date('2026-08-29T00:00:00.000Z') }),
    )
    const [view] = await service.project([{
      objectKey: 'generic/size.bin', module: 'media_assets', recordUid: 'media:size', visibility: 'public',
      purpose: 'generic', referenceRevision: 'record:1', disposition: 'attachment', allowDownload: true,
    }], null)
    assert.equal(view.available, true)
    const grant = new URL(view.url, 'https://example.test').searchParams.get('g')
    await assert.rejects(
      () => service.deliver({ objectKey: 'generic/size.bin', grant, method: 'HEAD' }, async () => null),
      hasCode('MEDIA_PROTOCOL'),
    )
  }
  finally { harness.close() }
})

test('static fetch adapter detects a body shorter than its declared representation', async () => {
  const store = new core.FetchMediaStore({
    async fetch() {
      return new Response(encoder.encode('xy'), {
        status: 200,
        headers: {
          'content-length': '3', etag: '"truncated"',
          'last-modified': 'Sat, 29 Aug 2026 00:00:00 GMT',
          'content-type': 'application/octet-stream',
        },
      })
    },
  })
  const result = await store.read('static/truncated.bin')
  await assert.rejects(() => streamBytes(result.body), hasCode('MEDIA_PROTOCOL'))
})

test('translation localization enforces a total batch text budget', async () => {
  const harness = createHarness('sqlite')
  try {
    const reader = new core.TranslationBatchReader(new core.TranslationStore(harness.adapter))
    const text = 'a'.repeat(900_000)
    const requests = Array.from({ length: 10 }, (_, index) => ({
      sourceRefKey: core.buildSourceRefKey({ entity: 'news', uid: `news:large:${index}`, field: 'content' }),
      sourceText: text,
    }))
    await assert.rejects(() => reader.localize('zh', requests), hasCode('I18N_LIMIT'))
  }
  finally { harness.close() }
})


test('cache runtime delegates background refresh through H3 event.waitUntil', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(
    new URL('../../server/utils/cache-runtime.ts', import.meta.url), 'utf8',
  ))
  assert.match(source, /event\.waitUntil\(task\)/u)
  assert.match(source, /coordinator:\s*coordinatorFor\(adapter\)/u)
  assert.doesNotMatch(source, /cloudflare\?\.context|cloudflare\.context/u)
})
