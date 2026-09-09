import test from 'node:test'
import assert from 'node:assert/strict'
import { core, createHarness, recordingAdapter, seedPublicHome, createHomeService, iso, insert } from '../helpers/offline-stage4.mjs'

async function verifyManagedMedia(view, clock) {
  const values = [view.site.logo, view.site.favicon, view.site.openGraphImage, view.featuredProfile?.avatar, ...view.news.map(item => item.cover)].filter(Boolean)
  const grants = new core.MediaGrantService('m'.repeat(64), { publicSeconds: 60, privateSeconds: 60, clock: () => new Date(clock.value) })
  for (const media of values) {
    assert.equal(media.available, true)
    const url = new URL(media.url, 'https://site.invalid')
    const token = url.searchParams.get('g')
    assert.ok(token)
    const key = decodeURIComponent(url.pathname.replace(/^\/media\//u, ''))
    const claims = await grants.verify(token, key)
    assert.equal(claims.scope, 'public')
    assert.ok(claims.exp * 1000 > Date.parse(view.generatedAt) + 40_000)
  }
}

for (const kind of ['sqlite', 'd1']) {
  test(`public home service closes the English SSR data loop on ${kind}`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    await seedPublicHome(h)
    const adapter = recordingAdapter(h.adapter)
    const clock = { value: Date.parse(iso()) }
    const { service } = createHomeService(adapter, clock)
    const first = await service.home('en')
    assert.equal(first.cache, 'miss')
    assert.match(first.etag, /^"vm-[a-f0-9]{64}"$/u)
    assert.equal(first.viewModel.locale, 'en')
    assert.equal(first.viewModel.site.name, 'Reliable Systems Lab')
    assert.equal(first.viewModel.site.heroTitle, 'Reliable intelligent systems for the real world')
    assert.equal(first.viewModel.featuredProfile?.name, 'Ming Zhang')
    assert.equal(first.viewModel.researchInterests[0]?.description, 'Studying system behavior through failures, concurrency, and verifiability.')
    assert.equal(first.viewModel.publications[0]?.title, 'Consistency protocols at the edge')
    assert.equal(first.viewModel.projects[0]?.name, 'Foundations of trustworthy edge computing')
    assert.equal(first.viewModel.news[0]?.title, 'The lab releases its first open dataset')
    assert.deepEqual({ ...first.viewModel.counts }, { research: 1, publications: 2, projects: 1, news: 1 })
    assert.equal(first.viewModel.navigation.header.length, 3)
    assert.equal(first.viewModel.navigation.hero.length, 1)
    assert.equal(first.viewModel.navigation.footer.length, 1)
    await verifyManagedMedia(first.viewModel, clock)

    const serialized = JSON.stringify(first.viewModel)
    for (const forbidden of ['password_hash', 'storage_kind', 'translation_provider', 'api_key', 'detail_json', 'homepage_publication_limit']) {
      assert.equal(serialized.includes(forbidden), false, forbidden)
    }
    const homeStatementBatches = adapter.commands.filter(item => item.group === 'batch' && item.commands.length === 8)
    assert.equal(homeStatementBatches.length, 1)

    const beforeSecond = adapter.commands.length
    const second = await service.home('en')
    assert.equal(second.cache, 'hit')
    assert.deepEqual(second.viewModel, first.viewModel)
    assert.equal(adapter.commands.slice(beforeSecond).some(item => item.group === 'batch' && item.commands.length === 8), false)
  })
}

test('Chinese home avoids English substitution and invalidates precisely after content change', async t => {
  const h = createHarness('sqlite'); t.after(() => h.close())
  await seedPublicHome(h)
  const adapter = recordingAdapter(h.adapter)
  const clock = { value: Date.parse(iso()) }
  const { service } = createHomeService(adapter, clock)
  const first = await service.home('zh')
  assert.equal(first.viewModel.site.name, '可靠系统实验室')
  assert.equal(first.viewModel.publications[0]?.title, '边缘环境中的一致性协议')
  assert.equal(first.viewModel.site.footerText, '开放、严谨、可复现。')

  clock.value += 1_000
  insert(h.db, `UPDATE site_settings SET site_name = ?, updated_at = ? WHERE uid = 'site:main'`, '新名称', new Date(clock.value).toISOString())
  await new core.CacheGenerationStore(adapter).bump(['public:home', 'public:site'], new Date(clock.value).toISOString())
  const next = await service.home('zh')
  assert.equal(next.cache, 'miss')
  assert.equal(next.viewModel.site.name, '新名称')
})

test('empty database produces a complete localized fallback model', async t => {
  const h = createHarness('d1'); t.after(() => h.close())
  const clock = { value: Date.parse(iso()) }
  const { service } = createHomeService(h.adapter, clock)
  const result = await service.home('en')
  assert.equal(result.viewModel.site.name, 'Academic CMS')
  assert.equal(result.viewModel.site.heroTitle, 'Research, teaching, and academic work')
  assert.equal(result.viewModel.featuredProfile, null)
  assert.deepEqual({ ...result.viewModel.counts }, { research: 0, publications: 0, projects: 0, news: 0 })
  assert.equal(result.viewModel.site.logo.available, false)
})
