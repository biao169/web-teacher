import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { core, createHarness, load } from '../helpers/offline-stage3.mjs'
import { CacheDouble, R2BucketDouble } from '../helpers/stage3-doubles.mjs'

const { parseCacheConfig } = load('server/cache/config.js')
const { parseMediaConfig, mediaGrantConfigurationIdentity } = load('server/media/config.js')
const { getPlatformCache } = load('server/adapters/cache-cloudflare.js')
const { resolveNodeMediaRoots } = load('server/adapters/media-node.js')
const encoder = new TextEncoder()
const hasCode = code => error => error?.code === code

function translationRow(db, index, source, translated) {
  const ref = core.buildSourceRefKey({ entity: 'news', uid: `news:stored:${index}`, field: 'content' })
  db.prepare(`INSERT INTO translation_cache
    (uid, source_hash, source_ref_key, source_text, source_lang, target_lang, translated_text,
     provider, status, is_manual, is_current, source_refs, error_message, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'zh', 'en', ?, 'test', 'success', 0, 1, '[]', NULL, ?, ?)`).run(
      `translation:stored:${index}`, 'a'.repeat(64), ref, source, translated,
      '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z',
    )
  return ref
}

test('cache configuration canonicalizes trusted origins and rejects coercive numeric values', () => {
  assert.equal(parseCacheConfig({ cacheOrigin: 'https://EXAMPLE.edu:443' }).origin, 'https://example.edu')
  assert.throws(() => parseCacheConfig({ cacheOrigin: ' https://example.edu' }), hasCode('CACHE_INPUT'))
  assert.throws(() => parseCacheConfig({ cacheMaxEntries: true }), hasCode('CACHE_INPUT'))
})

test('Cloudflare cache keys require configured origin and reuse one adapter per isolate binding', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  const binding = new CacheDouble()
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: binding } })
  try {
    assert.throws(() => getPlatformCache({ hostileHost: 'attacker.example' }, parseCacheConfig({})), /NUXT_CACHE_ORIGIN/u)
    const config = parseCacheConfig({ cacheOrigin: 'https://canonical.example' })
    const first = getPlatformCache({ hostileHost: 'attacker.example' }, config)
    const second = getPlatformCache({ hostileHost: 'different.example' }, config)
    assert.equal(first.kind, 'cloudflare')
    assert.strictEqual(second, first)
    assert.throws(
      () => getPlatformCache({}, { ...config, maxEntryBytes: config.maxEntryBytes + 1 }),
      /cannot change within one isolate/u,
    )
  }
  finally {
    if (previous) Object.defineProperty(globalThis, 'caches', previous)
    else delete globalThis.caches
  }
})

test('public cache policies cannot exceed the instance payload or adapter retention budgets', async () => {
  const harness = createHarness('sqlite')
  try {
    const cache = new core.PublicCacheService(
      new core.MemoryCacheAdapter(), new core.CacheGenerationStore(harness.adapter), { maxPayloadBytes: 64 },
    )
    const descriptor = { namespace: 'home', resource: 'budget', tags: ['public:home'] }
    await assert.rejects(() => cache.put(descriptor, { value: 'x' }, { ttlSeconds: 1, staleSeconds: 0, maxPayloadBytes: 65 }), hasCode('CACHE_INPUT'))
    await assert.rejects(() => cache.put(descriptor, { value: 'x' }, { ttlSeconds: 86_400, staleSeconds: 518_401 }), hasCode('CACHE_INPUT'))
  }
  finally { harness.close() }
})

test('public cache rejects expiry dates outside the JavaScript Date range', async () => {
  const harness = createHarness('sqlite')
  try {
    const cache = new core.PublicCacheService(
      new core.MemoryCacheAdapter(), new core.CacheGenerationStore(harness.adapter),
      { now: () => new Date(8_640_000_000_000_000 - 1_000) },
    )
    await assert.rejects(() => cache.put(
      { namespace: 'home', resource: 'date-limit', tags: ['public:home'] },
      { value: 'x' }, { ttlSeconds: 2, staleSeconds: 0 },
    ), hasCode('CACHE_PROTOCOL'))
  }
  finally { harness.close() }
})

test('cache invalidation rejects ambiguous empty identifiers and malformed module arrays', async () => {
  await assert.rejects(() => core.cacheTagsForMutation({ module: 'news', uid: '' }), hasCode('CACHE_INPUT'))
  await assert.rejects(() => core.cacheTagsForMutation({ module: 'news', dependentModules: ['not-a-module'] }), hasCode('CACHE_INPUT'))
  await assert.rejects(() => core.cacheTagsForMutation({ module: 'news', extraTags: 'public:home' }), hasCode('CACHE_INPUT'))
})

test('R2 adapter applies the configured object limit before calling the bucket', async () => {
  const bucket = new R2BucketDouble()
  const store = new core.R2MediaStore(bucket, { maxObjectBytes: 3 })
  const bytes = encoder.encode('four')
  await assert.rejects(() => store.put({ key: 'limits/four.bin', body: bytes, size: bytes.byteLength, contentType: 'application/octet-stream' }), hasCode('MEDIA_LIMIT'))
  assert.equal(bucket.calls.put, 0)
  assert.throws(() => new core.R2MediaStore(bucket, { maxObjectBytes: 0 }), hasCode('MEDIA_CONFIG'))
})

test('R2 validation rollback never deletes an object replaced after the attempted publish', async () => {
  class ReplacedBucket extends R2BucketDouble {
    async put(key, body, options) {
      const created = await super.put(key, body, options)
      if (!created) return null
      const replacement = encoder.encode('replacement')
      this.objects.set(key, {
        bytes: replacement,
        etag: `replacement-${createHash('sha256').update(replacement).digest('hex').slice(0, 12)}`,
        uploaded: '2026-08-29T00:00:01.000Z',
        httpMetadata: { contentType: 'application/octet-stream' },
        customMetadata: {},
      })
      return { ...created, size: created.size + 1 }
    }
  }
  const bucket = new ReplacedBucket()
  const store = new core.R2MediaStore(bucket)
  const bytes = encoder.encode('created')
  await assert.rejects(() => store.put({ key: 'atomic/replaced.bin', body: bytes, size: bytes.byteLength, contentType: 'application/octet-stream' }), hasCode('MEDIA_PROTOCOL'))
  assert.equal(bucket.calls.delete, 0)
  assert.equal(new TextDecoder().decode(bucket.objects.get('atomic/replaced.bin').bytes), 'replacement')
})

test('stored translation results are bounded independently from caller input', async () => {
  const harness = createHarness('sqlite')
  try {
    const source = '甲'.repeat(300_000) // 900,000 UTF-8 bytes
    const translated = 'a'.repeat(900_000)
    const refs = Array.from({ length: 5 }, (_, index) => translationRow(harness.db, index, source, translated))
    const store = new core.TranslationStore(harness.adapter)
    await assert.rejects(() => store.currentBySourceRefs(refs), hasCode('I18N_LIMIT'))
  }
  finally { harness.close() }
})

test('media catalog omits the global PDF policy query when no publication PDF is projected', async () => {
  const harness = createHarness('sqlite')
  try {
    const batches = []
    const adapter = {
      kind: harness.adapter.kind,
      metrics: harness.adapter.metrics,
      execute: command => harness.adapter.execute(command),
      batch(commands) { batches.push(commands); return harness.adapter.batch(commands) },
    }
    const catalog = new core.MediaCatalogStore(adapter)
    await catalog.projectionData([], ['public:media'])
    assert.equal(batches[0].some(command => command.sql.includes('global_settings')), false)
    await catalog.projectionData([], ['public:media-policy'], { includePdfPolicy: true })
    assert.equal(batches[1].filter(command => command.sql.includes('global_settings')).length, 1)
  }
  finally { harness.close() }
})

test('media grant runtime identity includes both lifetimes as well as the secret', () => {
  const base = { grantSecret: 'x'.repeat(32), publicGrantSeconds: 300, privateGrantSeconds: 120 }
  assert.notEqual(mediaGrantConfigurationIdentity(base), mediaGrantConfigurationIdentity({ ...base, publicGrantSeconds: 301 }))
  assert.notEqual(mediaGrantConfigurationIdentity(base), mediaGrantConfigurationIdentity({ ...base, privateGrantSeconds: 121 }))
  assert.doesNotThrow(() => parseMediaConfig({ mediaGrantSecret: base.grantSecret, mediaMaxObjectBytes: '1048576' }))
  assert.throws(() => parseMediaConfig({ mediaGrantSecret: base.grantSecret, mediaMaxObjectBytes: true }), hasCode('MEDIA_CONFIG'))
})

test('Node media roots reject the application root and any overlap with public assets', () => {
  assert.throws(() => resolveNodeMediaRoots({ mediaRoot: '.', staticMediaRoot: 'public', maxObjectBytes: 1024 }), /dedicated directory/u)
  assert.throws(() => resolveNodeMediaRoots({ mediaRoot: 'public/media', staticMediaRoot: 'public', maxObjectBytes: 1024 }), /must not overlap/u)
  const resolved = resolveNodeMediaRoots({ mediaRoot: 'media', staticMediaRoot: 'public', maxObjectBytes: 1024 })
  assert.notEqual(resolved.mediaRoot, resolved.staticRoot)
})

test('Cloudflare adapter source contains no Host-derived cache-key fallback', async () => {
  const source = await readFile(new URL('../../server/adapters/cache-cloudflare.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /getRequestURL/u)
  assert.match(source, /if \(!config\.origin\)/u)
})


test('memory cache rejects fractional clocks instead of creating ambiguous expiries', async () => {
  const cache = new core.MemoryCacheAdapter({ now: () => 0.5 })
  await assert.rejects(() => cache.get('fractional-clock'), hasCode('CACHE_PROTOCOL'))
  await assert.rejects(
    () => cache.put('fractional-clock', { bytes: encoder.encode('x'), etag: null }, 1),
    hasCode('CACHE_PROTOCOL'),
  )
})

test('cache miss canonicalizes and hashes its loaded ViewModel only once before publication', async () => {
  const harness = createHarness('sqlite')
  try {
    const cache = new core.PublicCacheService(new core.MemoryCacheAdapter(), new core.CacheGenerationStore(harness.adapter))
    const original = cache.normalizePayload.bind(cache)
    let calls = 0
    cache.normalizePayload = (...args) => { calls += 1; return original(...args) }
    const result = await cache.remember(
      { namespace: 'home', resource: 'single-normalization', tags: ['public:home'] },
      { ttlSeconds: 60, staleSeconds: 30 },
      async () => ({ title: '只序列化一次' }),
    )
    assert.equal(result.cache, 'miss')
    assert.equal(calls, 1)
  }
  finally { harness.close() }
})


test('cache coordinator coalesces misses across request-scoped service instances', { timeout: 2_000 }, async () => {
  const harness = createHarness('sqlite')
  try {
    let markJoined = () => undefined
    const joinedFlight = new Promise(resolve => { markJoined = resolve })
    class ObservedFlightMap extends Map {
      get(key) {
        const value = super.get(key)
        if (value) markJoined()
        return value
      }
    }

    const raw = new core.MemoryCacheAdapter()
    const coordinator = { flights: new ObservedFlightMap(), generationFlights: new Map() }
    const first = new core.PublicCacheService(
      raw, new core.CacheGenerationStore(harness.adapter), { coordinator },
    )
    const second = new core.PublicCacheService(
      raw, new core.CacheGenerationStore(harness.adapter), { coordinator },
    )
    let loads = 0
    let release = () => undefined
    let markStarted = () => undefined
    const gate = new Promise(resolve => { release = resolve })
    const loaderStarted = new Promise(resolve => { markStarted = resolve })
    const loader = async () => {
      loads += 1
      markStarted()
      await gate
      return { value: 'shared' }
    }
    const descriptor = { namespace: 'home', resource: 'cross-request-flight', tags: ['public:home'] }
    const policy = { ttlSeconds: 60, staleSeconds: 30 }
    const left = first.remember(descriptor, policy, loader)
    await loaderStarted
    const right = second.remember(descriptor, policy, loader)
    let joinedTimer
    try {
      await Promise.race([
        joinedFlight,
        new Promise((_, reject) => {
          joinedTimer = setTimeout(() => reject(new Error('second cache request did not join the shared flight')), 500)
        }),
      ])
      assert.equal(loads, 1)
    }
    finally {
      if (joinedTimer) clearTimeout(joinedTimer)
      release()
    }
    assert.deepEqual(await left, await right)
  }
  finally { harness.close() }
})

test('stage-3 runner isolates compiled CommonJS output per invocation', async () => {
  const runner = await readFile(new URL('../../scripts/run-stage3-tests.mjs', import.meta.url), 'utf8')
  const helper = await readFile(new URL('../helpers/offline-stage3.mjs', import.meta.url), 'utf8')
  assert.match(runner, /mkdtemp\(resolve\(tempRoot, 'stage3-core-'\)\)/u)
  assert.match(runner, /STAGE3_CORE_OUTPUT: output/u)
  assert.match(helper, /process\.env\.STAGE3_CORE_OUTPUT/u)
  assert.match(helper, /must stay inside the project temporary directory/u)
})

test('media runtime config rejects coercive path and route values', () => {
  const secret = 'm'.repeat(48)
  assert.throws(() => parseMediaConfig({ mediaGrantSecret: secret, mediaRoot: true }), hasCode('MEDIA_CONFIG'))
  assert.throws(() => parseMediaConfig({ mediaGrantSecret: secret, staticMediaRoot: ' public' }), hasCode('MEDIA_CONFIG'))
  assert.throws(() => parseMediaConfig({ mediaGrantSecret: secret, mediaRouteBase: true }), hasCode('MEDIA_CONFIG'))
})
