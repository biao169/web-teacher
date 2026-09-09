import assert from 'node:assert/strict'
import test from 'node:test'
import { core, createHarness, insert, iso } from '../helpers/offline-stage3.mjs'

const {
  buildSourceRefKey, translationSourceHash, TranslationStore, TranslationBatchReader,
  CacheGenerationStore, MemoryCacheAdapter, PublicCacheService, cacheTagsForMutation,
} = core

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: translation reader applies manual/cache/source priority in one batch`, async () => {
    const h = createHarness(kind)
    try {
      const ref = buildSourceRefKey({ entity: 'profiles', uid: 'profile:张三/1', field: 'bio' })
      const source = '中文简介'
      const hash = await translationSourceHash(source)
      const at = iso()
      insert(h.db, `INSERT INTO translation_cache
        (uid, created_at, updated_at, source_hash, source_ref_key, source_text, source_lang, target_lang,
         translated_text, provider, status, is_manual, is_current, source_refs)
        VALUES (?, ?, ?, ?, ?, ?, 'zh', 'en', ?, 'test', 'success', 1, 1, '[]')`,
        `tr:${kind}`, at, at, hash, ref, source, 'English bio')
      const reader = new TranslationBatchReader(new TranslationStore(h.adapter))
      const before = h.adapter.metrics.calls
      const output = await reader.localize('en', [
        { sourceRefKey: ref, sourceText: source },
        { sourceRefKey: buildSourceRefKey({ entity: 'profiles', uid: '2', field: 'bio' }), sourceText: '原文', manualText: 'Maintained' },
        { sourceRefKey: buildSourceRefKey({ entity: 'profiles', uid: '3', field: 'bio' }), sourceText: 'Fallback' },
        { sourceRefKey: buildSourceRefKey({ entity: 'profiles', uid: '4', field: 'bio' }), sourceText: null },
      ])
      assert.deepEqual(output, [
        { text: 'English bio', origin: 'manual' },
        { text: 'Maintained', origin: 'manual' },
        { text: 'Fallback', origin: 'source' },
        { text: null, origin: 'empty' },
      ])
      assert.equal(h.adapter.metrics.calls - before, 1)
      const calls = h.adapter.metrics.calls
      assert.deepEqual(await reader.localize('zh', [{ sourceRefKey: ref, sourceText: source }]), [{ text: source, origin: 'source' }])
      assert.equal(h.adapter.metrics.calls, calls)
      await assert.rejects(() => reader.localize('en', [
        { sourceRefKey: ref, sourceText: source }, { sourceRefKey: ref, sourceText: 'different' },
      ]))
    }
    finally { h.close() }
  })

  test(`${kind}: generation invalidation is monotonic and supports arbitrary UIDs`, async () => {
    const h = createHarness(kind)
    try {
      const store = new CacheGenerationStore(h.adapter)
      const tags = await cacheTagsForMutation({ module: 'profiles', uid: 'Imported UID/大写-A' })
      assert.ok(tags.some(tag => tag.startsWith('record:profiles:')))
      const before = await store.read(tags)
      assert.ok(tags.every(tag => (before.generations.get(tag) ?? 0) === 0))
      const one = await store.bump(tags, iso())
      const two = await store.bump(tags, iso())
      for (const tag of tags) assert.equal(two.generations.get(tag), (one.generations.get(tag) ?? 0) + 1)
    }
    finally { h.close() }
  })
}

test('public cache supports fresh/stale/miss, single-flight and generation-safe writes', async () => {
  const h = createHarness('sqlite')
  try {
    let milliseconds = Date.parse('2026-08-29T00:00:00.000Z')
    const deferred = []
    const backend = new MemoryCacheAdapter({ now: () => milliseconds, maxEntries: 10, maxBytes: 100_000, maxEntryBytes: 50_000 })
    const generations = new CacheGenerationStore(h.adapter)
    const cache = new PublicCacheService(backend, generations, { now: () => new Date(milliseconds), defer: task => deferred.push(task) })
    const descriptor = { namespace: 'home', resource: 'index', locale: 'zh', tags: ['public:home'], params: { page: 1 } }
    let loads = 0
    const loader = async () => ({ title: '首页', count: ++loads })
    const miss = await cache.remember(descriptor, { ttlSeconds: 10, staleSeconds: 20 }, loader)
    assert.equal(miss.cache, 'miss'); assert.equal(loads, 1)
    const hit = await cache.remember(descriptor, { ttlSeconds: 10, staleSeconds: 20 }, loader)
    assert.equal(hit.cache, 'hit'); assert.equal(loads, 1)
    milliseconds += 11_000
    const stale = await cache.remember(descriptor, { ttlSeconds: 10, staleSeconds: 20 }, loader)
    assert.equal(stale.cache, 'stale'); assert.equal(loads, 2)
    await Promise.all(deferred.splice(0))
    const refreshed = await cache.remember(descriptor, { ttlSeconds: 10, staleSeconds: 20 }, loader)
    assert.equal(refreshed.value.count, 2)

    // A value loaded across an invalidation boundary must not become the new generation's entry.
    let release
    const blocked = new Promise(resolve => { release = resolve })
    const raceDescriptor = { namespace: 'profiles', resource: 'one', tags: ['public:profiles'] }
    const first = cache.remember(raceDescriptor, { ttlSeconds: 10, staleSeconds: 0 }, async () => { await blocked; return { version: 1 } })
    await new Promise(resolve => setTimeout(resolve, 0))
    await generations.bump(['public:profiles'], iso(Date.parse('2026-08-29T00:01:00.000Z')))
    release()
    assert.equal((await first).value.version, 1)
    const next = await cache.remember(raceDescriptor, { ttlSeconds: 10, staleSeconds: 0 }, async () => ({ version: 2 }))
    assert.equal(next.value.version, 2)
  }
  finally { h.close() }
})
