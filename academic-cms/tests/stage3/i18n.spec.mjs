import assert from 'node:assert/strict'
import test from 'node:test'
import { core, createHarness } from '../helpers/offline-stage3.mjs'

function insertTranslation(db, input) {
  db.prepare(`INSERT INTO translation_cache
    (uid, source_hash, source_ref_key, source_text, source_lang, target_lang, translated_text,
     provider, status, is_manual, is_current, source_refs, error_message, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'zh', 'en', ?, ?, 'success', ?, 1, '[]', NULL, ?, ?)`).run(
      input.uid, input.hash, input.ref, input.source, input.translated, input.provider ?? 'test',
      input.manual ? 1 : 0, input.updatedAt, input.updatedAt,
    )
}

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: translation priority is manual field then current cache then source`, async () => {
    const harness = createHarness(kind)
    try {
      const ref = core.buildSourceRefKey({ entity: 'profiles', uid: 'profile:一', field: 'bio' })
      const source = '中文简介'
      insertTranslation(harness.db, {
        uid: `translation:${kind}`,
        ref,
        source,
        hash: await core.translationSourceHash(source),
        translated: 'English biography',
        manual: false,
        updatedAt: '2026-08-29T00:00:00.000Z',
      })
      const reader = new core.TranslationBatchReader(new core.TranslationStore(harness.adapter))
      assert.deepEqual(await reader.localize('en', [{ sourceRefKey: ref, sourceText: source }]), [{ text: 'English biography', origin: 'cache' }])
      assert.deepEqual(await reader.localize('en', [{ sourceRefKey: ref, sourceText: source, manualText: 'Curated English' }]), [{ text: 'Curated English', origin: 'manual' }])
      assert.deepEqual(await reader.localize('en', [{ sourceRefKey: ref, sourceText: '已更新' }]), [{ text: '已更新', origin: 'source' }])
    }
    finally { harness.close() }
  })

  test(`${kind}: Chinese localization performs no database call`, async () => {
    const harness = createHarness(kind)
    try {
      const reader = new core.TranslationBatchReader(new core.TranslationStore(harness.adapter))
      const before = harness.adapter.metrics.calls
      const ref = core.buildSourceRefKey({ entity: 'news', uid: 'news:1', field: 'title' })
      assert.deepEqual(await reader.localize('zh', [{ sourceRefKey: ref, sourceText: '标题' }]), [{ text: '标题', origin: 'source' }])
      assert.equal(harness.adapter.metrics.calls, before)
    }
    finally { harness.close() }
  })

  test(`${kind}: translation references are batched and input order is preserved`, async () => {
    const harness = createHarness(kind)
    try {
      const requests = Array.from({ length: 120 }, (_, index) => ({
        sourceRefKey: core.buildSourceRefKey({ entity: 'publications', uid: `publication:${index}`, field: 'title' }),
        sourceText: `论文 ${index}`,
      }))
      const reader = new core.TranslationBatchReader(new core.TranslationStore(harness.adapter))
      const before = harness.adapter.metrics.calls
      const results = await reader.localize('en', requests)
      assert.equal(harness.adapter.metrics.calls - before, 1)
      assert.equal(results.length, 120)
      assert.equal(results[119].text, '论文 119')
    }
    finally { harness.close() }
  })
}

test('translation source references enforce canonical percent encoding without delimiter ambiguity', () => {
  const ref = core.buildSourceRefKey({ entity: 'news', uid: '新闻/1', field: 'title' })
  assert.equal(core.parseSourceRefKey(ref).uid, '新闻/1')
  assert.throws(() => core.parseSourceRefKey(ref.replace('%2F', '%2f')), core.I18nError)
  // A literal percent sequence is a valid UID and is decoded exactly once.
  assert.equal(core.parseSourceRefKey('news/%252F/title').uid, '%2F')
})

test('conflicting duplicate source reference input is rejected', async () => {
  const harness = createHarness()
  try {
    const ref = core.buildSourceRefKey({ entity: 'news', uid: 'news:1', field: 'title' })
    const reader = new core.TranslationBatchReader(new core.TranslationStore(harness.adapter))
    await assert.rejects(() => reader.localize('en', [
      { sourceRefKey: ref, sourceText: '甲' },
      { sourceRefKey: ref, sourceText: '乙' },
    ]), core.I18nError)
  }
  finally { harness.close() }
})
