import assert from 'node:assert/strict'
import test from 'node:test'
import { core, createHarness, createPublicServices, insert, recordingAdapter, request, seedPublicContent } from '../helpers/offline-stage5.mjs'

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: list and detail stores stay within fixed query budgets`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    const seeded = await seedPublicContent(h)
    const tracked = recordingAdapter(h.adapter)
    const store = new core.PublicContentStore(tracked)

    await store.teamList(request())
    await store.publications(request())
    await store.projects(request())
    await store.patents(request())
    await store.students(request())
    await store.research()
    await store.news(request(), seeded.at)
    await store.courses(request())
    await store.profile('profile:lead')
    await store.publication('publication:one')
    await store.student('student:one')

    const groups = tracked.commands.map(entry => [entry.group, entry.group === 'batch' ? entry.commands.length : 1])
    assert.deepEqual(groups.slice(0, 8), [
      ['batch', 3], ['batch', 3], ['batch', 3], ['batch', 3],
      ['batch', 4], ['batch', 3], ['batch', 3], ['batch', 3],
    ])
    assert.deepEqual(groups.slice(8), [['execute', 1], ['execute', 1], ['batch', 2]])

    const newsBatch = tracked.commands[6]
    assert.equal(newsBatch.group, 'batch')
    for (const command of newsBatch.commands) {
      assert.ok(!command.sql.includes(seeded.at), 'request timestamps must never be interpolated into SQL source')
      assert.ok(command.params.includes(seeded.at), 'every news list/count/facet arm must bind the same cutoff')
    }
  })

  test(`${kind}: generation invalidation refreshes cached public detail`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    const seeded = await seedPublicContent(h)
    const clock = { value: Date.parse(seeded.at) }
    const services = createPublicServices(h.adapter, clock)

    const first = await services.team.detail('zh', 'profile:lead')
    assert.equal(first.viewModel.item.name, '张明')
    insert(h.db, `UPDATE profiles SET name = '张明（更新）', updated_at = ? WHERE uid = 'profile:lead'`, new Date(clock.value + 1_000).toISOString())
    const cached = await services.team.detail('zh', 'profile:lead')
    assert.equal(cached.viewModel.item.name, '张明')
    assert.equal(cached.cache, 'hit')

    const invalidator = new core.CacheInvalidator(new core.CacheGenerationStore(h.adapter))
    await invalidator.invalidate({ module: 'profiles', uid: 'profile:lead' }, new Date(clock.value + 2_000).toISOString())
    clock.value += 3_000
    const refreshed = await services.team.detail('zh', 'profile:lead')
    assert.equal(refreshed.viewModel.item.name, '张明（更新）')
    assert.equal(refreshed.cache, 'miss')
  })

  test(`${kind}: stale translation fingerprints fall back to current source`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    const seeded = await seedPublicContent(h)
    insert(h.db, `UPDATE publications SET abstract = '源文本已更新', updated_at = ? WHERE uid = 'publication:one'`, new Date(Date.parse(seeded.at) + 1_000).toISOString())
    const services = createPublicServices(h.adapter, { value: Date.parse(seeded.at) + 2_000 })
    const publication = (await services.publications.detail('en', 'publication:one')).viewModel.item
    assert.equal(publication.abstract, '源文本已更新')
    assert.notEqual(publication.abstract, 'Consistency protocols and verifiable implementations for edge systems.')
  })

  test(`${kind}: publication of future news is inclusive at the request cutoff`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    const seeded = await seedPublicContent(h)
    const services = createPublicServices(h.adapter, { value: Date.parse(seeded.future) })
    const list = (await services.news.list(request())).viewModel
    assert.ok(list.items.some(item => item.slug === 'future-news'))
    const detail = (await services.news.detail('zh', 'future-news')).viewModel
    assert.equal(detail.item.slug, 'future-news')
  })
}

test('out-of-range public pagination fails closed instead of emitting duplicate empty URLs', () => {
  assert.throws(() => core.pagination(request('zh', { page: 2 }), 2), error => error?.code === 'PUBLIC_NOT_FOUND')
  assert.throws(() => core.pagination(request('zh', { page: 2 }), 0), error => error?.code === 'PUBLIC_NOT_FOUND')
  assert.equal(core.pagination(request(), 2).page, 1)
})

test('public record identifiers reject percent-encoded and raw path ambiguity', () => {
  for (const value of ['%2fsecret', '%5Csecret', 'abc%252fdef', 'abc/def', 'abc\\def', '..', '.']) {
    assert.throws(() => core.safeRecordIdentifier(value), error => error?.code === 'PUBLIC_INPUT')
  }
  assert.equal(core.safeRecordIdentifier('profile:lead'), 'profile:lead')
})

test('markdown projection removes raw HTML outside code and maps article H1 to a section heading', () => {
  const blocks = core.publicContentBlocks(`# 标题\n\n<script>bad()</script>\n\n<section onclick="bad()">正文</section>\n\n\`\`\`html\n<script>kept-as-code()</script>\n\`\`\``, 'markdown')
  assert.deepEqual(blocks[0], { type: 'heading', level: 2, text: '标题' })
  const json = JSON.stringify(blocks)
  assert.ok(!json.includes('bad()'))
  assert.ok(!json.includes('onclick'))
  const code = blocks.find(block => block.type === 'code')
  assert.equal(code?.text, '<script>kept-as-code()</script>')
})
