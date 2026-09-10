import test from 'node:test'
import assert from 'node:assert/strict'
import { core } from '../helpers/offline-stage4.mjs'

const { resolvePublicNavigation, publicRecordPath, switchPublicLocalePath } = core

test('named public routes are localized and presentation fields are normalized', () => {
  assert.deepEqual(resolvePublicNavigation({
    kind: 'route', urlName: 'research', fragment: 'research',
    location: 'homepage-hero', style: 'main-button', icon: 'Book-Open',
  }, 'en'), {
    href: '/en/research#research', external: false, location: 'hero', style: 'primary', icon: 'book-open',
  })
  assert.equal(resolvePublicNavigation({ kind: 'anchor', fragment: 'publications' }, 'zh')?.href, '/zh#publications')
  assert.equal(resolvePublicNavigation({ urlName: 'home' }, 'en')?.href, '/en')
})

test('existing locale paths retain query and safe fragment while switching locale', () => {
  assert.equal(resolvePublicNavigation({ path: '/zh/news?page=2#latest' }, 'en')?.href, '/en/news?page=2#latest')
  assert.equal(resolvePublicNavigation({ path: '/projects?status=active', fragment: 'current' }, 'zh')?.href, '/zh/projects?status=active#current')
  assert.equal(switchPublicLocalePath('/zh/publications?page=3#year-2026', 'en'), '/en/publications')
  assert.equal(switchPublicLocalePath('/admin', 'en'), '/en')
})

test('external navigation requires credential-free HTTPS', () => {
  const resolved = resolvePublicNavigation({ kind: 'external', path: 'https://example.org/research?q=1', fragment: 'open' }, 'zh')
  assert.equal(resolved?.href, 'https://example.org/research?q=1#open')
  assert.equal(resolved?.external, true)
  for (const value of [
    '//example.org/x', 'http://example.org/x', 'https://user:pass@example.org/x',
    'javascript:alert(1)', 'https://example.org/\\x',
  ]) assert.throws(() => resolvePublicNavigation({ kind: 'external', path: value }, 'zh'))
})

test('internal navigation rejects platform internals, traversal, ambiguity and unsafe fragments', () => {
  for (const value of [
    '/api/v1/public/home', '/media/file.jpg', '/_nuxt/app.js', '/__cms_cache/item',
    '/../admin', '/%2e%2e/admin', '/x/%2Fadmin', '/x/%5cadmin', '/x\\admin', '//evil.example/x',
  ]) assert.throws(() => resolvePublicNavigation({ path: value }, 'zh'), value)
  assert.throws(() => resolvePublicNavigation({ path: '/news', fragment: 'bad fragment' }, 'zh'))
})

test('unknown or incomplete navigation is safely omitted and invalid icon is dropped', () => {
  assert.equal(resolvePublicNavigation({}, 'zh'), null)
  assert.equal(resolvePublicNavigation({ kind: 'anchor' }, 'zh'), null)
  assert.equal(resolvePublicNavigation({ kind: 'external' }, 'zh'), null)
  assert.equal(resolvePublicNavigation({ path: '/team', icon: '<svg>' }, 'zh')?.icon, null)
})

test('record paths encode identifiers as one URL segment', () => {
  assert.equal(publicRecordPath('zh', 'profiles', 'profile:lead'), '/zh/team/profile%3Alead')
  assert.equal(publicRecordPath('en', 'news', 'open data 2026'), '/en/news/open%20data%202026')
  assert.throws(() => publicRecordPath('fr', 'news', 'x'))
})
