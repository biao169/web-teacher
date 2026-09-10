import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { core, createHarness, insert, iso } from '../helpers/offline-stage3.mjs'

const {
  MediaCatalogStore, MediaGrantService, MediaService, CacheGenerationStore,
  cacheRecordTag, MediaError,
} = core

const bytes = new TextEncoder().encode('0123456789abcdef')
const checksum = createHash('sha256').update(bytes).digest('hex')
const modified = new Date('2026-08-29T00:00:00.000Z')

function stream(value) {
  const copy = value.slice()
  return new ReadableStream({ start(controller) { controller.enqueue(copy); controller.close() } })
}

async function bodyBytes(body) {
  const reader = body.getReader()
  const chunks = []
  let length = 0
  while (true) {
    const item = await reader.read()
    if (item.done) break
    chunks.push(item.value); length += item.value.length
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}

class FakeStore {
  kind = 'local'
  headCalls = 0
  readCalls = 0
  constructor(value = bytes) { this.value = value }
  metadata() {
    return {
      key: 'publications/paper.pdf', size: this.value.length, etag: '"storage-v1"',
      lastModified: modified, contentType: 'application/pdf', checksumSha256: checksum,
    }
  }
  async head(key) { this.headCalls += 1; return key === this.metadata().key ? this.metadata() : null }
  async read(key, options = {}) {
    this.readCalls += 1
    if (key !== this.metadata().key) return null
    if (options.etagMatches && options.etagMatches !== this.metadata().etag) throw new MediaError('MEDIA_PRECONDITION', 'changed')
    const range = options.range ?? null
    const selected = range ? this.value.slice(range.offset, range.offset + range.length) : this.value
    return { head: this.metadata(), body: stream(selected), range }
  }
  async put() { throw new Error('unused') }
  async delete() { return false }
}

function publicRequest(overrides = {}) {
  return {
    objectKey: 'publications/paper.pdf', module: 'publications', recordUid: 'publication:1',
    visibility: 'public', purpose: 'publication_pdf', referenceRevision: 'record-r1',
    alt: '论文 PDF', disposition: 'inline', allowDownload: true, ...overrides,
  }
}

function principal(uid = 'user:1') {
  return {
    sessionUid: 'session:1', userUid: uid, username: 'reader', displayName: null, email: null,
    roleUid: 'role:staff', roleName: 'Staff', roleLevel: 10, roleIsSystem: false,
    visibilityScopes: new Set(['public', 'authenticated', 'staff', 'owner']),
    permissions: { publications: { view: true, create: false, edit: false, delete: false, export: false } },
    mustChangePassword: false,
  }
}

function seed(h, pdfDownload = false) {
  insert(h.db, 'INSERT INTO global_settings (uid, news_pdf_allow_download) VALUES (?, ?)', 'settings:1', pdfDownload ? 1 : 0)
  insert(h.db, `INSERT INTO media_assets
    (uid, object_key, title, mime_type, size, storage_kind, status, checksum)
    VALUES (?, ?, ?, ?, ?, 'local', 'active', ?)`,
  'media:paper', 'publications/paper.pdf', '论文.pdf', 'application/pdf', bytes.length, checksum)
}

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: authenticated administration can preview a trashed object with byte ranges`, async () => {
    const h = createHarness(kind)
    try {
      const store = new FakeStore()
      const service = new MediaService(new MediaCatalogStore(h.adapter), { local: store }, new MediaGrantService('a'.repeat(48)))
      const response = await service.readForAdministration({
        uid: 'media:paper', object_key: 'publications/paper.pdf', title: '论文.pdf', category: null,
        mime_type: 'application/pdf', size: bytes.length, storage_kind: 'local', status: 'trash', checksum,
        id: 1, created_at: iso(), updated_at: iso(),
      }, 'bytes=2-5')
      assert.equal(response.status, 206)
      assert.equal(response.headers['content-range'], `bytes 2-5/${bytes.length}`)
      assert.equal(response.headers['cache-control'], 'private, no-store, max-age=0')
      assert.deepEqual(await bodyBytes(response.body), bytes.slice(2, 6))
    }
    finally { h.close() }
  })

  test(`${kind}: media projection is batched, policy-aware and hides storage internals`, async () => {
    const h = createHarness(kind)
    try {
      seed(h, false)
      let now = new Date('2026-08-29T00:00:10.000Z')
      const store = new FakeStore()
      const grants = new MediaGrantService('g'.repeat(48), { publicSeconds: 30, privateSeconds: 30, clock: () => now })
      const service = new MediaService(new MediaCatalogStore(h.adapter), { local: store }, grants)
      const before = h.adapter.metrics.calls
      const [view] = await service.project([publicRequest()], null)
      assert.equal(h.adapter.metrics.calls - before, 1)
      assert.equal(view.available, true)
      assert.equal(view.downloadAllowed, false)
      assert.equal(Object.hasOwn(view, 'storageKind'), false)
      await assert.rejects(() => service.deliver({
        objectKey: 'publications/paper.pdf', grant: new URL(view.url, 'https://example.test').searchParams.get('g'),
        method: 'GET', download: true,
      }, async () => null), MediaError)

      // Enabling the policy and bumping its generation invalidates the old capability.
      insert(h.db, 'UPDATE global_settings SET news_pdf_allow_download = 1, updated_at = ? WHERE uid = ?', iso(Date.parse('2026-08-29T00:00:20.000Z')), 'settings:1')
      await new CacheGenerationStore(h.adapter).bump(['public:media-policy'], iso(Date.parse('2026-08-29T00:00:20.000Z')))
      const oldGrant = new URL(view.url, 'https://example.test').searchParams.get('g')
      const headCalls = store.headCalls
      await assert.rejects(() => service.deliver({ objectKey: 'publications/paper.pdf', grant: oldGrant, method: 'GET' }, async () => null), MediaError)
      assert.equal(store.headCalls, headCalls, 'stale authorization must be rejected before storage access')

      const [enabled] = await service.project([publicRequest()], null)
      assert.equal(enabled.available, true)
      assert.equal(enabled.downloadAllowed, true)
      const grant = new URL(enabled.url, 'https://example.test').searchParams.get('g')
      now = new Date('2026-08-29T00:00:40.000Z')
      const calls = h.adapter.metrics.calls
      const response = await service.deliver({ objectKey: 'publications/paper.pdf', grant, method: 'GET', range: 'bytes=2-5' }, async () => null)
      assert.equal(h.adapter.metrics.calls - calls, 1)
      assert.equal(response.status, 206)
      assert.equal(response.headers['content-range'], `bytes 2-5/${bytes.length}`)
      assert.equal(response.headers['cache-control'], 'public, max-age=20, s-maxage=20')
      assert.deepEqual(await bodyBytes(response.body), bytes.slice(2, 6))
    }
    finally { h.close() }
  })

  test(`${kind}: record invalidation revokes media grants before object access`, async () => {
    const h = createHarness(kind)
    try {
      seed(h, true)
      const store = new FakeStore()
      const grants = new MediaGrantService('r'.repeat(48), { publicSeconds: 60, privateSeconds: 60, clock: () => new Date('2026-08-29T00:00:10.000Z') })
      const service = new MediaService(new MediaCatalogStore(h.adapter), { local: store }, grants)
      const [view] = await service.project([publicRequest()], null)
      const grant = new URL(view.url, 'https://example.test').searchParams.get('g')
      await new CacheGenerationStore(h.adapter).bump([await cacheRecordTag('publications', 'publication:1')], iso(Date.parse('2026-08-29T00:01:00.000Z')))
      await assert.rejects(() => service.deliver({ objectKey: 'publications/paper.pdf', grant, method: 'HEAD' }, async () => null), MediaError)
      assert.equal(store.headCalls, 0)
    }
    finally { h.close() }
  })
}

test('private media grant is bound to the authenticated user', async () => {
  const h = createHarness('sqlite')
  try {
    seed(h, true)
    const service = new MediaService(
      new MediaCatalogStore(h.adapter), { local: new FakeStore() },
      new MediaGrantService('p'.repeat(48), { clock: () => new Date('2026-08-29T00:00:10.000Z') }),
    )
    const [view] = await service.project([publicRequest({ visibility: 'authenticated' })], principal())
    assert.equal(view.available, true)
    assert.equal(view.cacheScope, 'private')
    const grant = new URL(view.url, 'https://example.test').searchParams.get('g')
    await assert.rejects(() => service.deliver({ objectKey: 'publications/paper.pdf', grant, method: 'HEAD' }, async () => principal('user:2')), MediaError)
    const response = await service.deliver({ objectKey: 'publications/paper.pdf', grant, method: 'HEAD' }, async () => principal())
    assert.equal(response.status, 200)
    assert.equal(response.headers['cache-control'], 'private, no-store, max-age=0')
  }
  finally { h.close() }
})


test('local delivery never advertises an unverified catalog checksum as a strong ETag', async () => {
  const h = createHarness('sqlite')
  try {
    seed(h, true)
    class UnverifiedLocalStore extends FakeStore {
      metadata() { return { ...super.metadata(), etag: 'W/"local-object-v1"', checksumSha256: null } }
    }
    const service = new MediaService(
      new MediaCatalogStore(h.adapter), { local: new UnverifiedLocalStore() },
      new MediaGrantService('e'.repeat(48), { clock: () => new Date('2026-08-29T00:00:10.000Z') }),
    )
    const [view] = await service.project([publicRequest()], null)
    assert.equal(view.available, true)
    const grant = new URL(view.url, 'https://example.test').searchParams.get('g')
    const response = await service.deliver({ objectKey: 'publications/paper.pdf', grant, method: 'HEAD' }, async () => null)
    assert.equal(response.headers.etag, 'W/"local-object-v1"')
    assert.notEqual(response.headers.etag, `"sha256-${checksum}"`)
  }
  finally { h.close() }
})
