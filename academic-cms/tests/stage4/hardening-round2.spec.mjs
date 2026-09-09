import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  core, createHarness, recordingAdapter, seedPublicHome, createHomeService, iso, root,
} from '../helpers/offline-stage4.mjs'

test('English media alternatives follow the localized visible content', async t => {
  const h = createHarness('sqlite'); t.after(() => h.close())
  await seedPublicHome(h)
  const clock = { value: Date.parse(iso()) }
  const { service } = createHomeService(h.adapter, clock)
  const { viewModel } = await service.home('en')
  assert.equal(viewModel.site.logo.alt, 'Reliable Systems Lab')
  assert.equal(viewModel.site.openGraphImage.alt, 'Reliable Systems Lab')
  assert.equal(viewModel.featuredProfile?.avatar.alt, 'Ming Zhang')
  assert.equal(viewModel.news[0]?.cover.alt, 'The lab releases its first open dataset')
})

test('a home assembly that consumes its media safety margin fails closed', async t => {
  const h = createHarness('sqlite'); t.after(() => h.close())
  await seedPublicHome(h)
  const clock = { value: Date.parse(iso()) }
  let advanced = false
  const delayed = {
    kind: h.adapter.kind,
    metrics: h.adapter.metrics,
    execute: command => h.adapter.execute(command),
    async batch(commands) {
      const result = await h.adapter.batch(commands)
      if (!advanced && commands.length === 8) {
        advanced = true
        clock.value += 20_001
      }
      return result
    },
  }
  const { service } = createHomeService(delayed, clock)
  await assert.rejects(() => service.home('en'), /assembly|safety|duration/i)
})

test('concurrent cache misses coalesce to one public home business batch', async t => {
  const h = createHarness('d1'); t.after(() => h.close())
  await seedPublicHome(h)
  const adapter = recordingAdapter(h.adapter)
  const clock = { value: Date.parse(iso()) }
  const { service } = createHomeService(adapter, clock)
  const results = await Promise.all(Array.from({ length: 12 }, () => service.home('en')))
  assert.equal(results.length, 12)
  assert.equal(adapter.commands.filter(item => item.group === 'batch' && item.commands.length === 8).length, 1)
  assert.equal(new Set(results.map(item => item.etag)).size, 1)
})

test('record identifiers cannot smuggle encoded path separators', () => {
  for (const value of ['a/b', '/absolute', '.', '..', 'a\\b']) {
    assert.throws(() => core.publicRecordPath('zh', 'news', value), value)
  }
  assert.equal(core.publicRecordPath('zh', 'publications', 'publication:one'), '/zh/publications/publication%3Aone')
})

test('conditional GET uses weak comparison across If-None-Match lists', async () => {
  const helper = join(root, 'shared/utils/http-etag.ts')
  await access(helper)
  const source = await readFile(helper, 'utf8')
  assert.match(source, /ifNoneMatchMatches/u)
  const boundary = await readFile(join(root, 'server/utils/public-http.ts'), 'utf8')
  assert.match(boundary, /ifNoneMatchMatches/u)
  assert.doesNotMatch(boundary, /getHeader\(event, 'if-none-match'\) === result\.etag/u)
  const route = await readFile(join(root, 'server/routes/api/v1/public/home.get.ts'), 'utf8')
  assert.match(route, /handlePublicResult/u)
  const etag = '"vm-0123456789abcdef"'
  assert.equal(core.ifNoneMatchMatches(etag, etag), true)
  assert.equal(core.ifNoneMatchMatches(`W/${etag}`, etag), true)
  assert.equal(core.ifNoneMatchMatches(`"other,tag", W/${etag}`, etag), true)
  assert.equal(core.ifNoneMatchMatches('*', etag), true)
  assert.equal(core.ifNoneMatchMatches('"other"', etag), false)
  assert.equal(core.ifNoneMatchMatches('malformed', etag), false)
})

test('only the likely LCP image receives high fetch priority', async () => {
  const media = await readFile(join(root, 'app/components/public/MediaImage.vue'), 'utf8')
  const header = await readFile(join(root, 'app/components/public/SiteHeader.vue'), 'utf8')
  const hero = await readFile(join(root, 'app/components/public/home/Hero.vue'), 'utf8')
  assert.match(media, /priority\?: boolean/u)
  assert.match(media, /priority \? 'high'/u)
  assert.doesNotMatch(header, /\bpriority\b/u)
  assert.match(hero, /\bpriority\b/u)
})

test('external-link assistive copy follows the active public language', async () => {
  const source = await readFile(join(root, 'app/components/public/SmartLink.vue'), 'utf8')
  assert.match(source, /route\.path\.startsWith\('\/en'\)/u)
  assert.match(source, /opens in a new window/u)
  assert.match(source, /在新窗口打开/u)
})
