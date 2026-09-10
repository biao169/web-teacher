import test from 'node:test'
import assert from 'node:assert/strict'
import { core, createHarness, seedPublicHome, createHomeService, iso, insert } from '../helpers/offline-stage4.mjs'

test('public cache retention remains shorter than every configured public media grant', () => {
  for (const seconds of [30, 31, 60, 300, 3600]) {
    const policy = core.homeCachePolicy(seconds)
    assert.ok(policy.ttlSeconds >= 1)
    assert.ok(policy.staleSeconds >= 0)
    assert.ok(policy.ttlSeconds + policy.staleSeconds <= seconds - 20)
  }
  for (const invalid of [0, 29, 3601, 60.5, Number.POSITIVE_INFINITY]) {
    assert.throws(() => core.homeCachePolicy(invalid))
  }
})

test('stale translation hash cannot override updated source text', async t => {
  const h = createHarness('sqlite'); t.after(() => h.close())
  await seedPublicHome(h)
  insert(h.db, `UPDATE publications SET title = '更新后的中文论文题名', updated_at = ? WHERE uid = 'publication:one'`, iso(Date.parse(iso()) + 2_000))
  const clock = { value: Date.parse(iso()) + 3_000 }
  const { service } = createHomeService(h.adapter, clock)
  const result = await service.home('en')
  assert.equal(result.viewModel.publications[0]?.title, '更新后的中文论文题名')
})

test('unsafe navigation and malformed external publication URLs are omitted, not reflected', async t => {
  const h = createHarness('sqlite'); t.after(() => h.close())
  await seedPublicHome(h)
  insert(h.db, `UPDATE navigation_items SET kind = 'external', path = 'javascript:alert(1)' WHERE uid = 'nav:home'`)
  insert(h.db, `UPDATE publications SET url = 'https://user:password@example.org/private' WHERE uid = 'publication:one'`)
  const clock = { value: Date.parse(iso()) }
  const { service } = createHomeService(h.adapter, clock)
  const result = await service.home('zh')
  assert.equal(result.viewModel.navigation.header.some(item => item.uid === 'nav:home'), false)
  assert.equal(result.viewModel.publications[0]?.externalUrl, null)
  assert.equal(JSON.stringify(result.viewModel).includes('javascript:'), false)
  assert.equal(JSON.stringify(result.viewModel).includes('password'), false)
})

test('runtime name, clocks and database row limits fail closed', async t => {
  const h = createHarness('sqlite'); t.after(() => h.close())
  assert.throws(() => createHomeService(h.adapter, { value: Date.now() }, { defaultSiteName: ' bad ' }))
  assert.throws(() => createHomeService(h.adapter, { value: Date.now() }, { publicGrantSeconds: 29 }))

  const empty = { rows: [], changes: 0, lastInsertRowid: null }
  const tooMany = { rows: Array.from({ length: 201 }, (_, index) => ({
    uid: `nav:${index}`, updated_at: iso(), title: `N${index}`, title_en: null,
    kind: 'route', url_name: 'home', path: null, fragment: null, icon: null, style: null, location: 'header',
  })), changes: 0, lastInsertRowid: null }
  await assert.rejects(() => new core.PublicHomeStore({
    kind: 'sqlite', metrics: { calls: 0, statements: 0 }, execute: async () => empty,
    batch: async () => [empty, tooMany, empty, empty, empty, empty, empty, { ...empty, rows: [{ research: 0, publications: 0, projects: 0, news: 0, publication_generation: 0, translation_generation: 0 }] }],
  }).load(iso()), /row limit/)
})
