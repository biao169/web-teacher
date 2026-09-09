import assert from 'node:assert/strict'
import test from 'node:test'
import { core, createHarness, iso } from '../helpers/offline-stage3.mjs'
import { CacheDouble } from '../helpers/stage3-doubles.mjs'

function bytes(text) { return new TextEncoder().encode(text) }

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: cache generation keys are deterministic and invalidation changes physical identity`, async () => {
    const harness = createHarness(kind)
    try {
      const store = new core.CacheGenerationStore(harness.adapter)
      const descriptor = { namespace: 'publications', resource: 'list', locale: 'en', tags: ['public:translations', 'public:publications'], params: { page: 1, year: 2026 } }
      const initial = await core.prepareCacheKey(descriptor, await store.read(descriptor.tags))
      const reordered = await core.prepareCacheKey({ ...descriptor, tags: [...descriptor.tags].reverse(), params: { year: 2026, page: 1 } }, await store.read([...descriptor.tags].reverse()))
      assert.equal(initial.physicalKey, reordered.physicalKey)
      await store.bump(['public:publications'], iso())
      const invalidated = await core.prepareCacheKey(descriptor, await store.read(descriptor.tags))
      assert.notEqual(initial.physicalKey, invalidated.physicalKey)
      assert.equal(initial.tags.join(','), 'public:publications,public:translations')
    }
    finally { harness.close() }
  })
}

test('memory cache is bounded LRU, copy-safe and expires entries', async () => {
  let now = 1_000
  const cache = new core.MemoryCacheAdapter({ maxEntries: 2, maxBytes: 10, maxEntryBytes: 8, now: () => now })
  const source = bytes('abc')
  await cache.put('a', { bytes: source, etag: 'a' }, 10)
  source[0] = 120
  assert.equal(new TextDecoder().decode((await cache.get('a')).bytes), 'abc')
  const returned = await cache.get('a')
  returned.bytes[0] = 120
  assert.equal(new TextDecoder().decode((await cache.get('a')).bytes), 'abc')

  await cache.put('b', { bytes: bytes('bb'), etag: null }, 10)
  await cache.get('a') // a becomes most recently used
  await cache.put('c', { bytes: bytes('cc'), etag: null }, 10)
  assert.equal(await cache.get('b'), null)
  assert.ok(await cache.get('a'))
  assert.ok(await cache.get('c'))
  now += 11_000
  assert.equal(await cache.get('a'), null)
  assert.equal(cache.bytes, 2)
  await assert.rejects(() => cache.put('large', { bytes: bytes('123456789'), etag: null }, 10), error => error?.code === 'CACHE_LIMIT')
})

test('Cloudflare cache adapter validates envelopes and makes defensive copies', async () => {
  const backing = new CacheDouble()
  const adapter = new core.CloudflareCacheAdapter(backing, 'https://academic.example', 128)
  const key = `v1/home/${'a'.repeat(64)}`
  const input = bytes('{"ok":true}')
  await adapter.put(key, { bytes: input, etag: '"x"' }, 30)
  input[0] = 120
  const loaded = await adapter.get(key)
  assert.equal(new TextDecoder().decode(loaded.bytes), '{"ok":true}')
  assert.equal(loaded.etag, '"x"')

  const request = new Request(core.cacheRequestUrl('https://academic.example', key))
  backing.entries.set(request.url, new Response('bad', { headers: { 'content-type': 'text/plain' } }))
  assert.equal(await adapter.get(key), null)
  assert.equal(backing.entries.has(request.url), false)
  assert.throws(() => new core.CloudflareCacheAdapter(backing, 'http://example.com'))
})

test('public cache removes corrupt entries and fails open on adapter outages', async () => {
  const harness = createHarness()
  try {
    const generations = new core.CacheGenerationStore(harness.adapter)
    const descriptor = { namespace: 'home', resource: 'index', tags: ['public:home'] }
    const prepared = await core.prepareCacheKey(descriptor, await generations.read(descriptor.tags))
    const backend = new core.MemoryCacheAdapter()
    await backend.put(prepared.physicalKey, { bytes: bytes('{not json'), etag: null }, 30)
    const cache = new core.PublicCacheService(backend, generations)
    assert.deepEqual(await cache.get(descriptor), { status: 'miss' })
    assert.equal(backend.size, 0)

    const operations = []
    const broken = {
      kind: 'memory',
      async get() { throw new Error('get down') },
      async put() { throw new Error('put down') },
      async delete() { throw new Error('delete down') },
    }
    const failOpen = new core.PublicCacheService(broken, generations, { onAdapterError: (operation) => operations.push(operation) })
    const result = await failOpen.remember(descriptor, { ttlSeconds: 5, staleSeconds: 0 }, async () => ({ title: 'still served' }))
    assert.equal(result.value.title, 'still served')
    assert.deepEqual(operations, ['get', 'put'])
  }
  finally { harness.close() }
})

test('public cache coalesces concurrent misses and does not publish across invalidation', async () => {
  const harness = createHarness()
  try {
    const generations = new core.CacheGenerationStore(harness.adapter)
    const backend = new core.MemoryCacheAdapter()
    const cache = new core.PublicCacheService(backend, generations)
    const descriptor = { namespace: 'news', resource: 'list', tags: ['public:news'] }
    let release
    let markStarted
    const gate = new Promise(resolve => { release = resolve })
    const started = new Promise(resolve => { markStarted = resolve })
    let loads = 0
    const loader = async () => { loads += 1; markStarted(); await gate; return { version: loads } }
    const calls = Array.from({ length: 20 }, () => cache.remember(descriptor, { ttlSeconds: 30, staleSeconds: 0 }, loader))
    await started
    assert.equal(loads, 1)
    release()
    const results = await Promise.all(calls)
    assert.ok(results.every(item => item.value.version === 1))
    assert.equal(loads, 1)

    let releaseRace
    let markRaceStarted
    const raceGate = new Promise(resolve => { releaseRace = resolve })
    const raceStarted = new Promise(resolve => { markRaceStarted = resolve })
    const raceDescriptor = { namespace: 'news', resource: 'detail/one', tags: ['public:news'] }
    const racing = cache.remember(raceDescriptor, { ttlSeconds: 30, staleSeconds: 0 }, async () => {
      markRaceStarted()
      await raceGate
      return { version: 1 }
    })
    await raceStarted
    await generations.bump(raceDescriptor.tags, iso())
    releaseRace()
    assert.equal((await racing).value.version, 1)
    const next = await cache.remember(raceDescriptor, { ttlSeconds: 30, staleSeconds: 0 }, async () => ({ version: 2 }))
    assert.equal(next.value.version, 2)
    assert.equal(next.cache, 'miss')
  }
  finally { harness.close() }
})

test('public cache rejects sensitive data in descriptors and payloads', async () => {
  const harness = createHarness()
  try {
    const generations = new core.CacheGenerationStore(harness.adapter)
    const cache = new core.PublicCacheService(new core.MemoryCacheAdapter(), generations)
    await assert.rejects(() => cache.remember(
      { namespace: 'home', resource: 'index', tags: ['public:home'], params: { sessionToken: 'no' } },
      { ttlSeconds: 30, staleSeconds: 0 },
      async () => ({ ok: true }),
    ), error => error?.code === 'VIEW_MODEL_SENSITIVE')
    await assert.rejects(() => cache.remember(
      { namespace: 'home', resource: 'index', tags: ['public:home'] },
      { ttlSeconds: 30, staleSeconds: 0 },
      async () => ({ passwordHash: 'no' }),
    ), error => error?.code === 'VIEW_MODEL_SENSITIVE')
  }
  finally { harness.close() }
})

test('cache invalidation map includes module, aggregate and stable record tags', async () => {
  const publication = await core.cacheTagsForMutation({ module: 'publications', uid: 'pub:2026/一' })
  assert.ok(publication.includes('module:publications'))
  assert.ok(publication.includes('public:publications'))
  assert.ok(publication.includes('public:home'))
  assert.equal(publication.filter(tag => tag.startsWith('record:publications:')).length, 1)
  const media = await core.cacheTagsForMutation({ module: 'media_assets', uid: 'media:1' })
  assert.ok(media.includes('public:media'))
  const translations = await core.cacheTagsForMutation({ module: 'translation_cache' })
  assert.ok(translations.includes('public:translations'))
})

test('cache adapters fail closed on malformed clocks and Cloudflare envelopes', async () => {
  const invalidClock = new core.MemoryCacheAdapter({ now: () => Number.NaN })
  await assert.rejects(
    () => invalidClock.put('v1/home/' + 'a'.repeat(64), { bytes: bytes('{}'), etag: null }, 30),
    error => error?.code === 'CACHE_PROTOCOL',
  )

  const backing = new CacheDouble()
  const adapter = new core.CloudflareCacheAdapter(backing, 'https://academic.example', 128)
  const key = `v1/home/${'b'.repeat(64)}`
  const request = new Request(core.cacheRequestUrl('https://academic.example', key))
  const common = {
    'content-type': 'application/vnd.academic-cms.cache+json; charset=utf-8',
    'content-length': '2',
  }

  backing.entries.set(request.url, new Response('{}', { headers: common }))
  assert.equal(await adapter.get(key), null, 'missing format marker must be rejected')

  backing.entries.set(request.url, new Response('{}', { headers: { ...common, 'x-cms-cache-format': '1', 'content-length': '3' } }))
  assert.equal(await adapter.get(key), null, 'declared and actual lengths must agree')

  backing.entries.set(request.url, new Response('{}', { headers: { ...common, 'x-cms-cache-format': '2' } }))
  assert.equal(await adapter.get(key), null, 'unknown envelope format must be rejected')
})

test('public cache validates constructor limits before any cache access', async () => {
  const harness = createHarness()
  try {
    const generations = new core.CacheGenerationStore(harness.adapter)
    assert.throws(
      () => new core.PublicCacheService(new core.MemoryCacheAdapter(), generations, { maxPayloadBytes: 0 }),
      error => error?.code === 'CACHE_INPUT',
    )
  }
  finally { harness.close() }
})
