import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { root } from '../helpers/offline-stage5.mjs'

async function filesBelow(directory, suffix) {
  const output = []
  async function visit(relative) {
    const entries = await readdir(resolve(root, directory, relative), { withFileTypes: true })
    for (const entry of entries) {
      const next = relative ? join(relative, entry.name) : entry.name
      if (entry.isDirectory()) await visit(next)
      else if (!suffix || entry.name.endsWith(suffix)) output.push(resolve(root, directory, next))
    }
  }
  await visit('')
  return output.sort()
}

test('Chinese and English public route trees stay symmetrical', async () => {
  const relative = async locale => (await filesBelow(`app/pages/${locale}`, '.vue')).map(file => file.slice(resolve(root, `app/pages/${locale}`).length + 1))
  const zh = await relative('zh')
  const en = await relative('en')
  assert.deepEqual(zh, en)
  assert.ok(zh.length >= 17, 'later stages may append symmetrical public routes')
  for (const required of ['team/index.vue', 'publications/featured/index.vue', 'news/[slug].vue', 'courses/[uid].vue']) assert.ok(zh.includes(required))
})

test('public pages keep fetched models reactive across query and dynamic-route navigation', async () => {
  const stage5Modules = /app\/pages\/(?:zh|en)\/(?:team|publications|projects|patents|students|research|news|courses)\//u
  const pages = [...await filesBelow('app/pages/zh', '.vue'), ...await filesBelow('app/pages/en', '.vue')]
    .filter(file => stage5Modules.test(file))
  for (const file of pages) {
    const source = await readFile(file, 'utf8')
    assert.ok(source.includes('useRequiredPublicPage('), `${file} must expose a reactive required model`)
    assert.ok(source.includes('usePublicContentSeo(() => model.value.meta)'), `${file} must keep SEO reactive`)
    assert.ok(!source.includes('const model = requirePublicPage('), `${file} must not snapshot async data`)
    if (/\[(?:uid|slug)\]\.vue$/u.test(file)) {
      assert.match(source, /const identifier = computed\(\(\) =>/u)
      assert.match(source, /usePublicDetailResource<[^>]+>\('[^']+', identifier,/u)
    }
  }
  const composable = await readFile(resolve(root, 'app/composables/usePublicResource.ts'), 'utf8')
  assert.match(composable, /MaybeRefOrGetter<string>/u)
  assert.match(composable, /watch:\s*\[endpoint\]/u)
})

test('public SEO JSON-LD cannot terminate its script element and reuses shell data', async () => {
  const source = await readFile(resolve(root, 'app/composables/usePublicContentSeo.ts'), 'utf8')
  assert.match(source, /replace\(\/<\//u)
  assert.match(source, /useNuxtData<PublicShellViewModel>/u)
  assert.match(source, /textContent:\s*breadcrumbJson/u)
})

test('public Vue rendering is separated from admin UI and never injects raw HTML', async () => {
  const files = [...await filesBelow('app/components/public', '.vue'), ...await filesBelow('app/pages/zh', '.vue'), ...await filesBelow('app/pages/en', '.vue')]
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    assert.ok(!source.includes('v-html'), `${file} must not use v-html`)
    assert.ok(!source.includes('element-plus'), `${file} must not import Element Plus`)
    assert.doesNotMatch(source, /(?:from\s+['"]~\/admin\/|components\/admin\/|assets\/admin\/)/u, `${file} must not import admin UI`)
  }
})

test('all public API modules use the shared safe result boundary', async () => {
  const routes = (await filesBelow('server/routes/api/v1/public', '.ts'))
    .filter(file => !/\/contact\.(?:get|post)\.ts$/u.test(file))
  assert.equal(routes.length, 22)
  for (const file of routes) {
    const source = await readFile(file, 'utf8')
    assert.ok(source.includes(/\/pdf\.get\.ts$/u.test(file) ? 'mediaHttpFailure' : /\/(?:filter-options|selection)\.get\.ts$/u.test(file) ? 'publicHttpFailure' : 'handlePublicResult'), `${file} must use the shared response boundary`)
  }
  const http = await readFile(resolve(root, 'server/utils/public-http.ts'), 'utf8')
  assert.match(http, /error instanceof URIError/u)
})
