import { pdfFixture } from '../../tests/helpers/pdf-fixture.mjs'
import { Window } from 'happy-dom'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import { resolve, sep } from 'node:path'
import { projectRoot } from '../lib/run-command.mjs'
import { assertBuildTarget } from '../lib/build-output.mjs'
import { loadMigrations, applyMigrations } from '../db/migrations.mjs'
import { assertCurrentBuildSource } from './assert-current-source.mjs'
import { runProcess } from './process.mjs'

if (process.platform === 'win32') throw new Error('Use Ubuntu/WSL for the isolated production HTTP regression runner')
await assertBuildTarget('ubuntu', projectRoot)
await assertCurrentBuildSource(projectRoot)

const { default: Database } = await import('better-sqlite3')
const temporaryRoot = resolve(projectRoot, '.tmp')
await mkdir(temporaryRoot, { recursive: true })
if ((await lstat(temporaryRoot)).isSymbolicLink()) throw new Error('Temporary root must not be a symlink')

const directory = await mkdtemp(resolve(temporaryRoot, 'production-e2e-http-'))
const databasePath = resolve(directory, 'demo.sqlite3')
const password = `Harbor!${randomBytes(24).toString('hex')}!Forest`
const authSecret = randomBytes(48).toString('hex')
const mediaSecret = randomBytes(48).toString('hex')
const reportDirectory = resolve(projectRoot, 'reports/final-regression')
const reportPath = resolve(reportDirectory, 'production-http.json')
let child
let geoServer
const geoRequests = []
let serverLog = ''

async function freePort() {
  const server = createServer()
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
  const port = server.address().port
  await new Promise(accept => server.close(accept))
  return port
}

async function stop(childProcess) {
  if (!childProcess?.pid || childProcess.exitCode !== null || childProcess.signalCode !== null) return
  const exited = new Promise(accept => childProcess.once('close', accept))
  try { process.kill(-childProcess.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
  const escalation = setTimeout(() => { try { process.kill(-childProcess.pid, 'SIGKILL') } catch { /* already stopped */ } }, 500)
  try { await exited } finally { clearTimeout(escalation) }
}

function rememberCookies(response, jar) {
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1))
  }
}

function cookieHeader(jar) {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
}

function redact(value) {
  let output = value
  for (const secret of [password, authSecret, mediaSecret]) output = output.split(secret).join('[REDACTED]')
  return output
}

const domWindow = new Window()
const parseDocument = (source, kind = 'text/html') => new domWindow.DOMParser().parseFromString(source, kind)
const checks = []
function passed(name, detail = '') { checks.push({ name, passed: true, detail }) }
function assert(condition, name, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`)
  passed(name, detail)
}

try {
  const database = new Database(databasePath)
  try {
    database.pragma('foreign_keys=ON')
    applyMigrations(database, await loadMigrations(resolve(projectRoot, 'migrations')))
  } finally { database.close() }

  const seeded = await runProcess(process.execPath, ['--import', 'tsx', 'scripts/release/seed-fixture.ts'], {
    cwd: projectRoot,
    env: { CMS_E2E_DATABASE: databasePath, CMS_E2E_PASSWORD: password },
    redact: [password],
  })
  assert(seeded.passed, 'isolated fixture seed', seeded.output.trim())

  const port = await freePort()
  const requestOrigin = `https://127.0.0.1:${port}`
  const requestBase = `http://127.0.0.1:${port}`
  // Isolated country-only provider; no external geolocation or production data is used.
  geoServer = createHttpServer((request, response) => {
    const ip = decodeURIComponent((request.url ?? '').split('/').pop() ?? '')
    geoRequests.push(ip)
    const country = ip === '114.114.114.114' ? 'CN' : ip === '8.8.8.8' ? 'US' : null
    response.writeHead(country ? 200 : 503, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ip, country }))
  })
  await new Promise((accept, reject) => { geoServer.once('error', reject); geoServer.listen(0, '127.0.0.1', accept) })
  const geoPort = geoServer.address().port
  await mkdir(resolve(directory, 'media'))
  child = spawn(process.execPath, [resolve(projectRoot, '.output/server/index.mjs')], {
    cwd: projectRoot,
    shell: false,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: String(port),
      CMS_DATABASE_PATH: databasePath,
      NUXT_AUTH_SECRET: authSecret,
      NUXT_AUTH_BOOTSTRAP_TOKEN: '',
      NUXT_AUTH_TRUSTED_ORIGINS: requestOrigin,
      NUXT_AUTH_SECURE_COOKIES: 'true',
      NUXT_AUTH_TRUSTED_PROXY_HOPS: '1',
      NUXT_LOCALE_GEO_IP_URL: `http://127.0.0.1:${geoPort}/country`,
      NUXT_LOCALE_GEO_IP_ENABLED: 'true',
      NUXT_LOCALE_GEO_IP_TIMEOUT_MS: '1000',
      NUXT_LOCALE_CHINESE_REGIONS: 'CN,HK,MO,TW',
      NUXT_LOCALE_FALLBACK: 'en',
      NUXT_MEDIA_GRANT_SECRET: mediaSecret,
      NUXT_MEDIA_ROOT: resolve(directory, 'media'),
      NUXT_STATIC_MEDIA_ROOT: resolve(projectRoot, '.output/public'),
      NUXT_PUBLIC_SITE_URL: requestOrigin,
      NUXT_CACHE_ORIGIN: requestOrigin,
    },
  })
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { if (serverLog.length < 2 * 1024 * 1024) serverLog += chunk.toString() })

  const deadline = Date.now() + 45_000
  let ready = false
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Production server exited before readiness')
    try {
      const response = await fetch(`${requestBase}/health`, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) { ready = true; break }
    } catch { /* retry until deadline */ }
    await new Promise(accept => setTimeout(accept, 100))
  }
  assert(ready, 'production server readiness')

  async function call(path, options = {}, jar = adminCookies) {
    const headers = new Headers(options.headers)
    if (jar.size) headers.set('cookie', cookieHeader(jar))
    const response = await fetch(`${requestBase}${path}`, { ...options, headers, signal: AbortSignal.timeout(15_000) })
    rememberCookies(response, jar)
    return response
  }

  async function expectStatus(path, expected, options, jar, label = path) {
    const response = await call(path, options, jar)
    const body = await response.text()
    if (response.status !== expected) throw new Error(`${label}: expected ${expected}, received ${response.status}: ${body.slice(0, 300)}`)
    passed(label, `HTTP ${response.status}`)
    if (expected === 200) assert(!body.includes('页面暂时不可用'), `${label} has no fallback 500 page`)
    return { response, body }
  }

  const adminCookies = new Map()
  const login = await call('/api/v1/auth/login', {
    method: 'POST',
    headers: { origin: requestOrigin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'demo_admin', password }),
  }, adminCookies)
  const loginBody = await login.json()
  assert(login.status === 200 && loginBody.authenticated === true, 'administrator login')
  assert(adminCookies.has('__Host-academic-cms-session') && adminCookies.has('__Host-academic-cms-csrf'), 'secure session and CSRF cookies')

  for (const [name, headers, expected] of [
    ['China IP wins over English browser', { 'x-forwarded-for': '114.114.114.114', 'accept-language': 'en-US' }, '/zh'],
    ['non-China IP wins over Chinese browser', { 'x-forwarded-for': '8.8.8.8', 'accept-language': 'zh-CN' }, '/en'],
    ['saved English wins over China IP', { 'x-forwarded-for': '114.114.114.114', cookie: 'academic-cms-locale=en' }, '/en'],
    ['saved Chinese wins over non-China IP', { 'x-forwarded-for': '8.8.8.8', cookie: 'academic-cms-locale=zh' }, '/zh'],
    ['invalid preference falls back to IP', { 'x-forwarded-for': '114.114.114.114', cookie: 'academic-cms-locale=invalid' }, '/zh'],
    ['provider failure uses browser fallback', { 'x-forwarded-for': '1.1.1.1', 'accept-language': 'zh-CN' }, '/zh'],
    ['private IP uses browser fallback', { 'x-forwarded-for': '192.168.1.1', 'accept-language': 'zh-CN' }, '/zh'],
    ['unknown IP and browser use English fallback', { 'x-forwarded-for': '192.168.1.1', 'cf-ipcountry': 'CN', 'accept-language': 'fr' }, '/en'],
  ]) {
    const response = await call('/', { redirect: 'manual', headers }, new Map())
    assert(response.status === 302 && response.headers.get('location') === expected, `locale root: ${name}`)
    assert(response.headers.get('cache-control')?.includes('private') && response.headers.get('cache-control')?.includes('no-store') && response.headers.get('vary')?.includes('Cookie'), `locale root: ${name} cannot be shared by a cache`)
    assert(response.headers.getSetCookie().length === 0, `locale root: ${name} does not persist a guessed language`)
  }
  assert(geoRequests.filter(ip => ip === '114.114.114.114').length === 1 && geoRequests.filter(ip => ip === '8.8.8.8').length === 1, 'locale country cache and explicit preference skip redundant requests')
  assert(!geoRequests.includes('192.168.1.1') && !geoRequests.includes('127.0.0.1'), 'locale lookup never sends private or loopback IPs')
  const rootHead = await call('/?utm_source=step4', { method: 'HEAD', redirect: 'manual', headers: { cookie: 'academic-cms-locale=en' } }, new Map())
  assert(rootHead.status === 302 && rootHead.headers.get('location') === '/en?utm_source=step4' && await rootHead.text() === '', 'locale HEAD keeps query and sends no body')
  await expectStatus('/en', 200, { headers: { cookie: 'academic-cms-locale=zh', 'x-forwarded-for': '114.114.114.114' }, redirect: 'manual' }, new Map(), 'explicit English URL overrides preference and IP')
  await expectStatus('/zh', 200, { headers: { cookie: 'academic-cms-locale=en', 'x-forwarded-for': '8.8.8.8' }, redirect: 'manual' }, new Map(), 'explicit Chinese URL overrides preference and IP')

  const pagePaths = [
    '/admin', '/admin/settings/site', '/admin/settings/global', '/admin/navigation',
    '/admin/profiles', '/admin/research', '/admin/students', '/admin/student-categories',
    '/admin/publications', '/admin/projects', '/admin/patents', '/admin/news', '/admin/courses',
    '/admin/messages', '/admin/media', '/admin/media/trash', '/admin/translation', '/admin/auth', '/admin/logs', '/admin/import-export',
  ]
  for (const path of pagePaths) await expectStatus(path, 200, undefined, adminCookies, `page ${path}`)

  const apiPaths = [
    '/api/v1/admin/dashboard', '/api/v1/admin/navigation', '/api/v1/admin/complete/modules',
    '/api/v1/admin/complete/auth/overview', '/api/v1/admin/complete/logs?page=1&pageSize=10',
    '/api/v1/admin/complete/media/stats', '/api/v1/admin/complete/media?page=1&pageSize=10',
    '/api/v1/admin/complete/media/trash?page=1&pageSize=10', '/api/v1/admin/complete/translation/overview',
    ...['profiles', 'research_interests', 'students', 'student_category_displays', 'publications', 'projects', 'patents', 'courses', 'messages']
      .map(module => `/api/v1/admin/content/${module}?page=1&pageSize=10`),
    ...['site-settings', 'global-settings', 'navigation', 'news', 'media', 'translation']
      .map(resource => `/api/v1/admin/complete/resource/${resource}?page=1&pageSize=10`),
  ]
  for (const path of apiPaths) await expectStatus(path, 200, undefined, adminCookies, `API ${path}`)

  const activeMediaList = await call('/api/v1/admin/complete/media?page=1&pageSize=100&f_status=trash', {}, adminCookies)
  const activeMediaBody = await activeMediaList.json()
  assert(activeMediaList.status === 200 && activeMediaBody.rows?.every(row => row.status === 'active'), 'active media endpoint overrides client lifecycle filter')
  const trashMediaList = await call('/api/v1/admin/complete/media/trash?page=1&pageSize=100&f_status=active', {}, adminCookies)
  const trashMediaListBody = await trashMediaList.json()
  assert(trashMediaList.status === 200 && trashMediaListBody.rows?.every(row => row.status === 'trash'), 'trash media endpoint overrides client lifecycle filter')
  let linkedUsage = null
  for (const media of activeMediaBody.rows ?? []) {
    const usageResponse = await call(`/api/v1/admin/complete/media/${encodeURIComponent(media.uid)}/usage`, {}, adminCookies)
    const usageBody = await usageResponse.json()
    if (usageResponse.status === 200 && usageBody.usages?.length) { linkedUsage = usageBody.usages; break }
  }
  assert(linkedUsage?.length > 0, 'seeded media exposes at least one business usage')
  assert(linkedUsage.every(item => typeof item.adminPath === 'string' && item.adminPath.startsWith('/admin/')), 'media usages expose trusted internal administration links')

  const newsList = await call('/api/v1/admin/complete/resource/news?page=1&pageSize=10', {}, adminCookies)
  const newsListBody = await newsList.json()
  const seededNews = newsListBody.rows?.[0]
  assert(Boolean(seededNews?.uid), 'seeded news available for rich-text editor')
  await expectStatus(`/admin/news/editor/${encodeURIComponent(seededNews.uid)}`, 200, undefined, adminCookies, 'page formal news rich-text editor')

  const list = await call('/api/v1/admin/content/profiles?page=1&pageSize=10', {}, adminCookies)
  const listBody = await list.json()
  const original = listBody.items[0]
  assert(Boolean(original?.uid && original?.updatedAt), 'seeded profile available for mutation')
  const profileAvatar = original?.media?.avatar_key
  assert(profileAvatar?.available === true && profileAvatar.kind === 'image' && profileAvatar.purpose === 'avatar', 'profile list projects an available avatar')
  assert(profileAvatar.width === 72 && profileAvatar.height === 72 && profileAvatar.downloadAllowed === false, 'profile avatar uses compact inline presentation policy')
  assert(!Object.hasOwn(profileAvatar, 'objectKey') && !Object.hasOwn(profileAvatar, 'storageKind'), 'profile avatar hides storage internals')
  const profileAvatarResponse = await call(profileAvatar.url, {}, adminCookies)
  assert(profileAvatarResponse.status === 200 && profileAvatarResponse.headers.get('content-type') === 'image/png', 'profile avatar signed URL delivers the real image')

  const studentList = await call('/api/v1/admin/content/students?page=1&pageSize=10', {}, adminCookies)
  const studentListBody = await studentList.json()
  const studentAvatar = studentListBody.items?.[0]?.media?.avatar_key
  assert(studentList.status === 200 && studentAvatar?.available === true && studentAvatar.kind === 'image', 'student list projects an available avatar')
  const studentAvatarResponse = await call(studentAvatar.url, {}, adminCookies)
  assert(studentAvatarResponse.status === 200 && studentAvatarResponse.headers.get('content-type') === 'image/png', 'student avatar signed URL delivers the real image')
  const mutationPath = `/api/v1/admin/content/profiles/${encodeURIComponent(original.uid)}`
  const mutationHeaders = {
    origin: requestOrigin,
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json',
    'x-csrf-token': loginBody.csrfToken,
  }

  // Exercise the real SSR redirect, saved navigation and public API with a disposable record.
  const filterCategory = '筛选验收分类'
  const filterSearch = '筛选验收新闻'
  const filterNews = await call('/api/v1/admin/complete/resource/news', {
    method: 'POST', headers: mutationHeaders,
    body: JSON.stringify({ uid: 'news:filter-acceptance', title: filterSearch, slug: 'filter-acceptance', category: filterCategory, content: '筛选链接验收', content_format: 'plain', visibility: 'public', published_at: '2026-01-01T00:00:00.000Z' }),
  })
  assert(filterNews.status === 200, 'filter fixture saved through news API', await filterNews.text())
  await expectStatus('/api/v1/public/shell?locale=zh', 200, undefined, new Map(), 'warm public navigation cache')
  const filterNavigation = await call('/api/v1/admin/complete/resource/navigation', {
    method: 'POST', headers: mutationHeaders,
    body: JSON.stringify({ uid: 'navigation:filter-acceptance', title: '筛选验收按钮', title_en: 'Filtered news', kind: 'button', path: `/news?category=${filterCategory}&q=${filterSearch}`, url_name: null, location: 'hero', style: 'primary', visibility: 'public', enabled: 1, sort_order: 0 }),
  })
  const filterRecord = (await filterNavigation.json()).record
  assert(filterNavigation.status === 200 && /^\/news\?f=[A-Za-z0-9_-]+$/u.test(filterRecord?.path), 'navigation API saves ASCII filter configuration')
  const reloadedFilter = await call('/api/v1/admin/complete/resource/navigation/navigation%3Afilter-acceptance')
  assert((await reloadedFilter.json()).record.path === filterRecord.path, 'saved filter configuration reloads unchanged')
  for (const locale of ['zh', 'en']) {
    const path = `/${locale}${filterRecord.path}`
    const oldPath = `/${locale}/news?${new URLSearchParams({ category: filterCategory, q: filterSearch })}`
    const redirect = await call(oldPath, { redirect: 'manual' }, new Map())
    assert(redirect.status === 302 && redirect.headers.get('location') === path, `${locale} legacy URL redirects once to ASCII`)
    const html = await expectStatus(path, 200, undefined, new Map(), `${locale} canonical filtered SSR page`)
    assert(html.body.includes('filter-acceptance'), `${locale} filtered SSR page renders the matched record`)
    const shellResponse = await call(`/api/v1/public/shell?locale=${locale}`, {}, new Map())
    const shell = await shellResponse.json()
    const scopeLink = shell.navigation.hero.find(item => item.uid === filterRecord.uid)
    assert(Boolean(scopeLink) && new URL(scopeLink.href, requestOrigin).searchParams.get('nav') === filterRecord.uid, `${locale} navigation cache refreshes to a saved fixed scope`)
    const scopePage = await expectStatus(scopeLink.href, 200, undefined, new Map(), `${locale} fixed-scope SSR page`)
    const scopeDocument = parseDocument(scopePage.body)
    assert(scopePage.body.includes('filter-acceptance') && !scopeDocument.querySelector('[data-filter="category"]'), `${locale} fixed category renders its records and hides its control`)
    const scopeQuery = new URL(scopeLink.href, requestOrigin).searchParams
    scopeQuery.set('locale', locale)
    const scopedResponse = await call(`/api/v1/public/news?${scopeQuery}`, {}, new Map())
    const scoped = await scopedResponse.json()
    assert(scopedResponse.status === 200 && scoped.query.scope?.search === filterSearch && scoped.query.search === null && scoped.items.length === 1, `${locale} saved search forms the base scope and leaves secondary search empty`)
    scopeQuery.set('q', 'unmatched-secondary-search')
    const narrowed = await (await call(`/api/v1/public/news?${scopeQuery}`, {}, new Map())).json()
    assert(narrowed.pagination?.totalItems === 0 && narrowed.query.scope?.search === filterSearch, `${locale} secondary search intersects the saved search`)
    const filteredResponse = await call(`/api/v1/public/news?locale=${locale}&${filterRecord.path.split('?')[1]}`, {}, new Map())
    const filtered = await filteredResponse.json()
    assert(filteredResponse.status === 200 && filtered.items.length === 1 && filtered.items[0].uid === 'news:filter-acceptance', `${locale} decoded filters select the expected public record`)
    assert(filtered.query.search === filterSearch && filtered.query.filters.category === filterCategory && filtered.meta.path === path, `${locale} filter state and canonical path survive refresh`)
  }
  await expectStatus('/api/v1/public/news?locale=zh&f=invalid!', 400, undefined, new Map(), 'malformed envelope rejected by public HTTP API')

  // Validate the deployed XML/HTML, including DB writes made after the server started.
  const robots = await expectStatus('/robots.txt', 200, undefined, new Map(), 'SEO robots')
  assert(robots.response.headers.get('content-type')?.includes('text/plain') && robots.body.includes(`Sitemap: ${requestOrigin}/sitemap.xml`), 'robots advertises the configured canonical sitemap')
  const sitemap = await expectStatus('/sitemap.xml', 200, { headers: { 'x-forwarded-host': 'attacker.invalid', cookie: 'academic-cms-locale=en' } }, new Map(), 'SEO sitemap index')
  assert(sitemap.response.headers.get('content-type')?.includes('application/xml') && !sitemap.body.includes('attacker.invalid'), 'sitemap XML uses the configured host')
  const indexXml = parseDocument(sitemap.body, 'application/xml')
  const sitemapLocations = Array.from(indexXml.querySelectorAll('loc'), item => item.textContent)
  assert(sitemapLocations.length > 1 && sitemapLocations.every(url => url.startsWith(`${requestOrigin}/sitemap.xml?section=`)), 'sitemap index has bounded public module shards')
  let newsSitemapPath
  const detailLocations = []
  for (const location of sitemapLocations) {
    const url = new URL(location)
    const path = url.pathname + url.search
    const result = await expectStatus(path, 200, undefined, new Map(), `SEO shard ${url.search}`)
    const xml = parseDocument(result.body, 'application/xml')
    assert(xml.querySelectorAll('parsererror').length === 0 && xml.documentElement.tagName === 'urlset', `valid XML shard ${url.search}`)
    if (url.searchParams.get('section') === 'news' && result.body.includes('/news/filter-acceptance')) newsSitemapPath = path
    for (const entry of xml.querySelectorAll('url')) {
      const loc = entry.querySelector('loc').textContent
      assert(entry.getElementsByTagName('xhtml:link').length === 3 && !/\/(admin|account|login|register|setup)(?:[/?]|$)/u.test(new URL(loc).pathname), `sitemap public bilingual URL ${new URL(loc).pathname}`)
      if (url.searchParams.get('section') === 'static') {
        const html = await expectStatus(new URL(loc).pathname, 200, undefined, new Map(), `SEO public entry ${new URL(loc).pathname}`)
        const head = parseDocument(html.body).head
        const canonical = head.querySelectorAll('link[rel="canonical"]')
        assert(canonical.length === 1 && canonical[0].getAttribute('href') === loc, `self-canonical ${new URL(loc).pathname}`)
        const languageLinks = head.querySelectorAll('link[rel="alternate"][hreflang]')
        assert(languageLinks.length === 3, `three language alternates ${new URL(loc).pathname}`)
        for (const link of entry.getElementsByTagName('xhtml:link')) {
          const tag = head.querySelector(`link[hreflang="${link.getAttribute('hreflang')}"]`)
          assert(tag?.getAttribute('href') === link.getAttribute('href'), `HTML/XML language agreement ${new URL(loc).pathname} ${link.getAttribute('hreflang')}`)
        }
      } else detailLocations.push(loc)
    }
  }
  assert(Boolean(newsSitemapPath), 'newly saved news appears immediately in the sitemap')
  for (const locale of ['zh', 'en']) {
    const detail = await expectStatus(`/${locale}/news/filter-acceptance`, 200, undefined, new Map(), `${locale} indexed news detail`)
    const head = parseDocument(detail.body).head
    assert(head.querySelector('link[rel="canonical"]')?.getAttribute('href') === `${requestOrigin}/${locale}/news/filter-acceptance`, `${locale} news detail self-canonical`)
    assert(head.querySelector('meta[property="og:locale"]')?.getAttribute('content') === (locale === 'zh' ? 'zh_CN' : 'en_US'), `${locale} Open Graph locale`)
    assert(head.querySelector('script[type="application/ld+json"]')?.textContent.includes('BreadcrumbList'), `${locale} breadcrumb structured data`)
    const filtered = await expectStatus(`/${locale}${filterRecord.path}`, 200, undefined, new Map(), `${locale} filtered SEO`)
    assert(parseDocument(filtered.body).head.querySelector('meta[name="robots"]')?.getAttribute('content') === 'noindex,follow', `${locale} filtered pages avoid crawl combinations`)
    for (const path of ['login', 'register', 'setup', 'account']) {
      const response = await call(`/${locale}/${path}`, { redirect: 'manual' }, new Map())
      assert(response.headers.get('x-robots-tag')?.includes('noindex'), `${locale} ${path} HTTP noindex`)
      await response.arrayBuffer()
    }
  }
  assert(detailLocations.every(url => !url.includes('?') && !url.includes('/media/')), 'sitemap excludes search URLs and attachments')
  const currentSeoRecord = (await (await call('/api/v1/admin/complete/resource/news/news%3Afilter-acceptance')).json()).record
  const hiddenSeo = await call('/api/v1/admin/complete/resource/news/news%3Afilter-acceptance', {
    method: 'PATCH', headers: mutationHeaders, body: JSON.stringify({ visibility: 'hidden', expectedUpdatedAt: currentSeoRecord.updated_at }),
  })
  const hiddenSeoRecord = (await hiddenSeo.json()).record
  assert(hiddenSeo.status === 200 && hiddenSeoRecord?.visibility === 'hidden', 'hide indexed news through the real admin API')
  const hiddenShard = await call(newsSitemapPath, {}, new Map())
  assert([200, 404].includes(hiddenShard.status) && !(await hiddenShard.text()).includes('/news/filter-acceptance'), 'hidden news disappears from sitemap immediately')
  await expectStatus('/zh/news/filter-acceptance', 404, undefined, new Map(), 'hidden indexed detail returns 404')
  const restoredSeo = await call('/api/v1/admin/complete/resource/news/news%3Afilter-acceptance', {
    method: 'PATCH', headers: mutationHeaders, body: JSON.stringify({ visibility: 'public', expectedUpdatedAt: hiddenSeoRecord.updated_at }),
  })
  assert(restoredSeo.status === 200, 'restore sitemap acceptance news')
  await restoredSeo.arrayBuffer()
  for (const path of ['/sitemap.xml?section=admin&page=1', '/sitemap.xml?section=news&page=0', '/sitemap.xml?section=news&page=1&page=2']) {
    await expectStatus(path, 400, undefined, new Map(), `SEO invalid query ${path}`)
  }
  await expectStatus('/sitemap.xml?section=news&page=999999', 404, undefined, new Map(), 'SEO nonexistent shard')
  for (const path of ['/sitemap.xml', '/robots.txt']) {
    const response = await call(path, { method: 'HEAD' }, new Map())
    assert(response.status === 200 && await response.text() === '', `SEO HEAD ${path}`)
  }

  const translationScan = await call('/api/v1/admin/complete/translation/scan', {
    method: 'POST', headers: mutationHeaders, body: JSON.stringify({ limit: 500 }),
  }, adminCookies)
  const translationScanBody = await translationScan.json()
  assert(translationScan.status === 200 && translationScanBody.scanned > 0 && translationScanBody.state, 'translation scan and calibration mutation', `HTTP ${translationScan.status} ${JSON.stringify(translationScanBody).slice(0, 500)}`)
  const repeatedTranslationScan = await call('/api/v1/admin/complete/translation/scan', {
    method: 'POST', headers: mutationHeaders, body: JSON.stringify({ limit: 500 }),
  }, adminCookies)
  const repeatedTranslationScanBody = await repeatedTranslationScan.json()
  assert(repeatedTranslationScan.status === 200 && repeatedTranslationScanBody.needed === 0, 'translation scan is idempotent', `HTTP ${repeatedTranslationScan.status} ${JSON.stringify(repeatedTranslationScanBody).slice(0, 500)}`)

  const translationList = await call('/api/v1/admin/complete/resource/translation?page=1&pageSize=100&f_is_current=true&f_status=success', {}, adminCookies)
  const translationListBody = await translationList.json()
  const originalTranslation = translationListBody.rows?.find(row => row.translated_text && row.updated_at)
  assert(translationList.status === 200 && Boolean(originalTranslation?.uid), 'current translation available for manual revision')
  const manualTranslationText = `${originalTranslation.translated_text} [production-${randomUUID()}]`
  const manualTranslation = await call(`/api/v1/admin/complete/translation/${encodeURIComponent(originalTranslation.uid)}`, {
    method: 'PATCH', headers: mutationHeaders,
    body: JSON.stringify({ translatedText: manualTranslationText, expectedUpdatedAt: originalTranslation.updated_at }),
  }, adminCookies)
  const manualTranslationBody = await manualTranslation.json()
  assert(manualTranslation.status === 200 && manualTranslationBody.record?.translated_text === manualTranslationText && manualTranslationBody.record?.provider === 'manual', 'manual translation save')
  const staleTranslation = await call(`/api/v1/admin/complete/translation/${encodeURIComponent(originalTranslation.uid)}`, {
    method: 'PATCH', headers: mutationHeaders,
    body: JSON.stringify({ translatedText: 'stale overwrite', expectedUpdatedAt: originalTranslation.updated_at }),
  }, adminCookies)
  const staleTranslationBody = await staleTranslation.json()
  assert(staleTranslation.status === 409 && staleTranslationBody.data?.error?.code === 'TRANSLATION_EDIT_CONFLICT', 'manual translation optimistic conflict')
  const restoredTranslation = await call(`/api/v1/admin/complete/translation/${encodeURIComponent(originalTranslation.uid)}`, {
    method: 'PATCH', headers: mutationHeaders,
    body: JSON.stringify({ translatedText: originalTranslation.translated_text, expectedUpdatedAt: manualTranslationBody.record.updated_at }),
  }, adminCookies)
  assert(restoredTranslation.status === 200, 'manual translation save-and-return rollback')

  const protectedManualBatch = await call('/api/v1/admin/complete/translation/run', {
    method: 'POST', headers: mutationHeaders,
    body: JSON.stringify({ uids: [originalTranslation.uid] }),
  }, adminCookies)
  const protectedManualBatchBody = await protectedManualBatch.json()
  assert(protectedManualBatch.status === 200 && protectedManualBatchBody.processed === 0, 'selected batch preserves manual translation')
  const invalidTranslationSelection = await call('/api/v1/admin/complete/translation/run', {
    method: 'POST', headers: mutationHeaders, body: JSON.stringify({ uids: [] }),
  }, adminCookies)
  const invalidTranslationSelectionBody = await invalidTranslationSelection.json()
  assert(invalidTranslationSelection.status === 422 && invalidTranslationSelectionBody.data?.error?.code === 'INVALID_TRANSLATION_RUN_SELECTION', 'selected batch rejects an empty selection')

  const changed = await call(mutationPath, {
    method: 'PATCH', headers: mutationHeaders,
    body: JSON.stringify({ expectedUpdatedAt: original.updatedAt, values: { is_featured: !original.values.is_featured } }),
  }, adminCookies)
  const changedBody = await changed.json()
  assert(changed.status === 200, 'real quick-edit mutation')
  const restored = await call(mutationPath, {
    method: 'PATCH', headers: mutationHeaders,
    body: JSON.stringify({ expectedUpdatedAt: changedBody.record.updatedAt, values: { is_featured: Boolean(original.values.is_featured) } }),
  }, adminCookies)
  assert(restored.status === 200, 'quick-edit mutation rollback')

  // Redesign acceptance: exercise saved admin values through warmed public caches.
  // All writes below target only the fresh, disposable fixture owned by this runner.
  async function profileRecord(uid) {
    const response = await call(`/api/v1/admin/content/profiles/${encodeURIComponent(uid)}`)
    assert(response.status === 200, 'redesign reads the current profile version')
    return response.json()
  }
  async function updateProfile(uid, values) {
    const current = await profileRecord(uid)
    const response = await call(`/api/v1/admin/content/profiles/${encodeURIComponent(uid)}`, {
      method: 'PATCH', headers: mutationHeaders,
      body: JSON.stringify({ expectedUpdatedAt: current.updatedAt, values }),
    })
    assert(response.status === 200, 'redesign saves profile fields through the admin API', await response.text())
  }
  async function publicHome(locale) {
    const response = await call(`/api/v1/public/home?locale=${locale}`, {}, new Map())
    assert(response.status === 200, `${locale} public home remains available`)
    return response.json()
  }
  const secondUid = listBody.items.find(item => item.uid !== original.uid)?.uid
  assert(Boolean(secondUid), 'redesign fixture has a second teacher')
  const savedProfiles = [await profileRecord(original.uid), await profileRecord(secondUid)]
  const longBio = { zh: '简介首段\n\n' + '围绕智能制造与机器视觉开展研究，兼顾基础方法和实际应用。\n'.repeat(3300) + '简介末段', en: 'Biography start\n\n' + 'Research connects foundational methods with practical applications.\n'.repeat(1400) + 'Biography end' }
  await publicHome('zh'); await publicHome('en')
  await updateProfile(original.uid, { is_featured: true, is_active: true, visibility: 'public', sort_order: -900000, bio: longBio.zh, bio_en: longBio.en,
    google_scholar: 'https://scholar.google.com/citations?user=fixture', google_scholar_value: 1234, github: 'https://github.com/fixture', github_value: 0 })
  for (const locale of ['zh', 'en']) {
    const home = await publicHome(locale)
    assert(home.featuredProfile?.uid === original.uid && home.featuredProfile.biography === longBio[locale], `${locale} warmed home cache immediately reflects the complete saved biography`)
    assert(home.featuredProfile.links.some(link => link.kind === 'google-scholar' && link.value === '1234') && home.featuredProfile.links.some(link => link.kind === 'github' && link.value === '0'), `${locale} homepage exposes saved platform values including zero after a warm cache`)
    const response = await call(`/${locale}`, {}, new Map())
    const document = parseDocument(await response.text())
    assert(response.status === 200 && document.querySelector('.public-home-profile__biography')?.textContent === longBio[locale], `${locale} SSR preserves every paragraph and the end of a long biography`)
    assert(document.querySelectorAll('.public-profile-links svg').length >= 2 && [...document.querySelectorAll('.public-profile-links__value')].map(node => node.textContent).includes('0'), `${locale} homepage renders platform icons and a configured zero value`)
  }
  await updateProfile(secondUid, { is_featured: true, is_active: true, visibility: 'public', sort_order: -999999 })
  assert((await publicHome('zh')).featuredProfile?.uid === secondUid, 'changing manual order changes the first featured teacher after a cache hit')
  for (const [field, excluded, restoredValue] of [['is_featured', false, true], ['is_active', false, true], ['visibility', 'hidden', 'public']]) {
    await updateProfile(secondUid, { [field]: excluded })
    for (const locale of ['zh', 'en']) assert((await publicHome(locale)).featuredProfile?.uid === original.uid, `${locale} excludes the first teacher when ${field} changes`)
    await updateProfile(secondUid, { [field]: restoredValue })
  }
  for (const record of savedProfiles) await updateProfile(record.uid, Object.fromEntries(['is_featured', 'is_active', 'visibility', 'sort_order', 'bio', 'bio_en', 'google_scholar', 'google_scholar_value', 'github', 'github_value'].map(key => [key, record.values[key]])))

  async function updateNavigation(uid, values) {
    const path = `/api/v1/admin/complete/resource/navigation/${encodeURIComponent(uid)}`
    const current = await (await call(path)).json()
    const response = await call(path, { method: 'PATCH', headers: mutationHeaders, body: JSON.stringify({ expectedUpdatedAt: current.record.updated_at, ...values }) })
    assert(response.status === 200, 'redesign saves configured navigation changes', await response.text())
  }
  const secondAction = await call('/api/v1/admin/complete/resource/navigation', {
    method: 'POST', headers: mutationHeaders,
    body: JSON.stringify({ uid: 'navigation:redesign-second', title: '第二入口', title_en: 'Second action', kind: 'button', path: '/research', location: 'hero', style: 'secondary', visibility: 'public', enabled: 1, sort_order: -999998 }),
  })
  assert(secondAction.status === 200, 'redesign adds a second configured home action')
  await publicHome('zh'); await publicHome('en')
  await updateNavigation(filterRecord.uid, { title: '成果资料入口', title_en: 'Research outputs', path: '/projects', sort_order: -999999 })
  for (const locale of ['zh', 'en']) {
    const home = await publicHome(locale), action = home.navigation.hero.find(item => item.uid === filterRecord.uid)
    assert(action?.label === (locale === 'zh' ? '成果资料入口' : 'Research outputs') && action.href === `/${locale}/projects`, `${locale} renamed home action and route replace warmed cached values`)
    assert(home.navigation.hero[0]?.uid === filterRecord.uid, `${locale} home actions follow saved order`)
    const response = await call(`/${locale}`, {}, new Map()), document = parseDocument(await response.text())
    assert(document.querySelector('.public-home-shortcuts a')?.textContent.trim() === action.label, `${locale} SSR shows the configured first action below the biography`)
  }
  await updateNavigation('navigation:redesign-second', { sort_order: -1000000 })
  assert((await publicHome('zh')).navigation.hero[0]?.uid === 'navigation:redesign-second', 'reordering home actions invalidates the cached order')
  await updateNavigation(filterRecord.uid, { enabled: 0 })
  for (const locale of ['zh', 'en']) {
    assert(!(await publicHome(locale)).navigation.hero.some(item => item.uid === filterRecord.uid), `${locale} disabled home action is removed after a cache hit`)
    const response = await call(`/${locale}`, {}, new Map()), document = parseDocument(await response.text())
    assert(!document.querySelector('.public-home-shortcuts')?.textContent.includes(locale === 'zh' ? '成果资料入口' : 'Research outputs'), `${locale} SSR omits the disabled shortcut`)
  }

  // Footer settings are the single body source in both home and shell caches.
  const siteRow = (await (await call('/api/v1/admin/complete/resource/site-settings?page=1&pageSize=10')).json()).rows[0]
  const sitePath = `/api/v1/admin/complete/resource/site-settings/${encodeURIComponent(siteRow.uid)}`
  const siteOriginal = (await (await call(sitePath)).json()).record
  async function saveFooter(footer_text) {
    const current = (await (await call(sitePath)).json()).record
    const response = await call(sitePath, { method: 'PATCH', headers: mutationHeaders, body: JSON.stringify({ footer_text, expectedUpdatedAt: current.updated_at }) })
    assert(response.status === 200, 'website settings accept configured HTML', await response.text())
  }
  const footer = '<div style="text-align:center">© 2026 智能系统与可信计算实验室</div><p>本页面内容均为开发演示数据。</p><a href="https://example.org/round3">备案信息</a><script>ROUND3_INJECTED_SCRIPT</script>'
  await publicHome('zh'); await publicHome('en')
  for (const locale of ['zh', 'en']) await call(`/api/v1/public/shell?locale=${locale}`, {}, new Map())
  await saveFooter(footer)
  for (const locale of ['zh', 'en']) {
    const home = await publicHome(locale)
    assert(home.site.footerHtml.includes('href="https://example.org/round3"') && !home.site.footerHtml.includes('ROUND3_INJECTED_SCRIPT'), `${locale} fresh footer HTML replaces warmed home cache and strips scripts`)
    for (const path of [`/${locale}`, `/${locale}/news`, `/${locale}/patents`]) {
      const page = await call(path, {}, new Map()), document = parseDocument(await page.text())
      const footers = document.querySelectorAll('footer.public-footer')
      assert(footers.length === 1, `${path} has a single footer`)
      const text = footers[0].textContent
      assert((text.match(/© 2026/g) || []).length === 1 && (text.match(/本页面内容均为开发演示数据。/g) || []).length === 1, `${path} does not duplicate configured copyright or demo notice`)
      assert(!text.includes('Academic CMS') && !text.includes('ROUND3_INJECTED_SCRIPT') && footers[0].querySelector('a[href="https://example.org/round3"]'), `${path} renders the configured safe footer link`)
    }
  }
  await saveFooter('')
  assert((await publicHome('zh')).site.footerHtml === null, 'empty footer config removes body after cache hit')
  await saveFooter(siteOriginal.footer_text ?? '')

  // A real PDF is uploaded, attached to rich text, and served by an authorized range gateway.
  const pdfBytes = pdfFixture()
  const pdfUpload = await call('/api/v1/admin/complete/media/upload?filename=round3-document.pdf&title=PDF', { method: 'POST', headers: { ...mutationHeaders, 'content-type': 'application/pdf' }, body: pdfBytes })
  const pdfAsset = (await pdfUpload.json()).media
  assert(pdfUpload.status === 200 && pdfAsset?.objectKey, 'uploads a real PDF for news rich text')
  const newsPath = `/api/v1/admin/complete/resource/news/${encodeURIComponent(seededNews.uid)}`
  const newsOriginal = (await (await call(newsPath)).json()).record
  async function saveNews(values) {
    const current = (await (await call(newsPath)).json()).record
    const response = await call(newsPath, { method: 'PATCH', headers: mutationHeaders, body: JSON.stringify({ ...values, expectedUpdatedAt: current.updated_at }) })
    assert(response.status === 200, 'updates PDF news visibility/content', await response.text())
  }
  await saveNews({ visibility: 'public', published_at: '2026-01-01T00:00:00.000Z' })
  const newsCurrent = (await (await call(newsPath)).json()).record
  const richDocument = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'PDF 正文标题' }] }, { type: 'pdf', attrs: { objectKey: pdfAsset.objectKey, title: 'PDF 报告' } }, { type: 'paragraph', content: [{ type: 'text', text: 'PDF 后续说明' }] }] }
  const richSave = await call(`/api/v1/admin/complete/news/${encodeURIComponent(seededNews.uid)}/rich-text`, { method: 'PATCH', headers: mutationHeaders, body: JSON.stringify({ document: richDocument, expectedUpdatedAt: newsCurrent.updated_at }) })
  assert(richSave.status === 200, 'saves the editor managed PDF node', await richSave.text())
  const preview = await call('/api/v1/admin/complete/news/rich-text-preview', { method: 'POST', headers: mutationHeaders, body: JSON.stringify({ document: richDocument }) })
  const previewBody = await preview.json()
  assert(preview.status === 200 && previewBody.html.includes('data-pdf-src='), 'editor preview projects a PDF body')
  const pdfPath = `/api/v1/public/news/${encodeURIComponent(newsOriginal.slug)}/pdf?${new URLSearchParams({ key: pdfAsset.objectKey })}`
  for (const locale of ['zh', 'en']) {
    const detail = await (await call(`/api/v1/public/news/${encodeURIComponent(newsOriginal.slug)}?locale=${locale}`, {}, new Map())).json()
    assert(detail.item.blocks.some(block => block.type === 'rich' && block.html.includes('data-pdf-src=')), `${locale} news detail includes a PDF body reference`)
    const response = await call(`/${locale}/news/${encodeURIComponent(newsOriginal.slug)}`, {}, new Map()), document = parseDocument(await response.text())
    assert(document.querySelectorAll('.public-pdf-document').length === 1 && !document.querySelector('iframe'), `${locale} PDF detail has a seamless lazy container without native viewer chrome`)
  }
  const pdfRange = await call(pdfPath, { headers: { range: 'bytes=0-65535' } }, new Map())
  assert(pdfRange.status === 206 && pdfRange.headers.get('content-range') === `bytes 0-65535/${pdfBytes.length}` && pdfRange.headers.get('accept-ranges') === 'bytes', 'public PDF range response has correct HTTP headers')
  assert(Buffer.from(await pdfRange.arrayBuffer()).equals(pdfBytes.subarray(0,65536)) && pdfRange.headers.get('cache-control').includes('no-store'), 'public PDF range bytes are exact and reauthorized on every request')
  await expectStatus(pdfPath.replace('key=', 'key=unrelated-'), 404, undefined, new Map(), 'unrelated PDF key is not authorized by a public article')
  await saveNews({ visibility: 'hidden' })
  await expectStatus(pdfPath, 404, undefined, new Map(), 'hidden news revokes an existing PDF body URL')
  await saveNews({ visibility: 'public' })
  const beforeRemoval = (await (await call(newsPath)).json()).record
  const removePdf = await call(`/api/v1/admin/complete/news/${encodeURIComponent(seededNews.uid)}/rich-text`, { method: 'PATCH', headers: mutationHeaders, body: JSON.stringify({ document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Attachment removed' }] }] }, expectedUpdatedAt: beforeRemoval.updated_at }) })
  assert(removePdf.status === 200, 'removes PDF through the formal rich-text editor', await removePdf.text())
  await expectStatus(pdfPath, 404, undefined, new Map(), 'removing the PDF node revokes its body URL')
  // Real public message writes use only this isolated fixture database.
  await saveNews({ visibility: 'public', published_at: '2026-01-01T00:00:00.000Z', allow_comments: 1 })
  for (const locale of ['zh', 'en']) {
    const detail = await expectStatus(`/${locale}/news/${encodeURIComponent(newsOriginal.slug)}`, 200, undefined, new Map(), `${locale} news message entry`)
    const document = parseDocument(detail.body)
    const toggle = document.querySelector('.public-news-messages__toggle')
    assert(toggle?.getAttribute('aria-expanded') === 'false', `${locale} news message form starts collapsed`)
    assert(!document.querySelector('.public-news-messages form'), `${locale} news form does not request a session before opening`)
    const contact = await expectStatus(`/${locale}/contact`, 200, undefined, new Map(), `${locale} working contact component`)
    const contactDocument = parseDocument(contact.body)
    assert(!contact.body.includes('PublicContactContactForm') && Boolean(contactDocument.querySelector('.public-form[role="status"]')), `${locale} contact component renders its loading state`)
    const activeContact = contactDocument.querySelector(`.public-nav a[href="/${locale}/contact"]`)
    assert(activeContact?.getAttribute('aria-current') === 'page' && !activeContact.classList.contains('public-navigation-link--primary'), `${locale} contact navigation uses the normal active style`)
    const restingContact = document.querySelector(`.public-nav a[href="/${locale}/contact"]`)
    assert(Boolean(restingContact) && !restingContact.classList.contains('public-navigation-link--primary') && !restingContact.hasAttribute('aria-current'), `${locale} contact navigation has no permanent dark state`)
  }
  const publicMessageHeaders = { origin: requestOrigin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.141' }
  const newsMessageBody = { newsUid: seededNews.uid, name: 'Round 4 visitor', email: 'round4@example.invalid', messageType: 'other', subject: 'News message acceptance', content: 'This is an isolated news feedback submission with a complete source association.' }
  const sentNews = await call('/api/v1/public/contact', { method: 'POST', headers: publicMessageHeaders, body: JSON.stringify(newsMessageBody) }, new Map())
  const newsReceipt = await sentNews.json()
  assert(sentNews.status === 200 && newsReceipt.accepted === true, 'anonymous news message accepts a valid public origin')
  const storedResponse = await call(`/api/v1/admin/content/messages/${encodeURIComponent(newsReceipt.reference)}`)
  assert(storedResponse.status === 200, 'admin message detail reads the new receipt')
  const storedNews = (await storedResponse.json()).values
  assert(storedNews?.content.includes(newsOriginal.title) && storedNews?.content.includes(`/zh/news/${newsOriginal.slug}`) && storedNews?.content.endsWith(newsMessageBody.content), 'backend message includes trusted news title, URL and original content')
  assert(storedNews?.visibility === 'hidden' && storedNews?.status === 'new', 'news feedback is delivered privately to the admin inbox')
  const regularMessage = await call('/api/v1/public/contact', { method: 'POST', headers: publicMessageHeaders, body: JSON.stringify({ ...newsMessageBody, newsUid: null, subject: 'General contact acceptance' }) }, new Map())
  assert(regularMessage.status === 200 && (await regularMessage.json()).accepted, 'ordinary navbar contact messages still submit')
  await saveNews({ allow_comments: 0 })
  const closedNews = await call('/api/v1/public/contact', { method: 'POST', headers: publicMessageHeaders, body: JSON.stringify(newsMessageBody) }, new Map())
  assert(closedNews.status === 403 && (await closedNews.json()).error?.code === 'INTERACTION_DISABLED', 'closing news messages immediately rejects an existing form')
  const closedDetail = await expectStatus(`/zh/news/${encodeURIComponent(newsOriginal.slug)}`, 200, undefined, new Map(), 'closed news detail')
  assert(!parseDocument(closedDetail.body).querySelector('.public-news-messages__toggle'), 'closed news has no message button')
  await saveNews({ visibility: newsOriginal.visibility, published_at: newsOriginal.published_at, allow_comments: newsOriginal.allow_comments })
  await expectStatus('/pdfjs/6.3.289/standard_fonts/LiberationSans-Regular.ttf', 200, undefined, new Map(), 'PDF standard fonts are bundled as local assets')

  const mediaMarker = randomUUID()
  const regressionPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  const mediaUpload = await call(`/api/v1/admin/complete/media/upload?filename=${encodeURIComponent(`${mediaMarker}.png`)}&title=${encodeURIComponent('回收站生产验收')}&category=production-regression`, {
    method: 'POST',
    headers: { ...mutationHeaders, 'content-type': 'image/png' },
    body: regressionPng,
  }, adminCookies)
  const mediaUploadBody = await mediaUpload.json()
  const uploadedMedia = mediaUploadBody.media
  assert(mediaUpload.status === 200 && uploadedMedia?.uid && uploadedMedia?.status === 'active', 'media upload for trash workflow')

  const metadataUpdate = await call(`/api/v1/admin/complete/media/${encodeURIComponent(uploadedMedia.uid)}/metadata`, {
    method: 'PATCH', headers: mutationHeaders,
    body: JSON.stringify({ title: '回收站生产验收（已保存）', category: 'production-regression-saved', expectedUpdatedAt: uploadedMedia.updatedAt }),
  }, adminCookies)
  const metadataBody = await metadataUpdate.json()
  assert(metadataUpdate.status === 200 && metadataBody.title === '回收站生产验收（已保存）', 'media metadata save')

  const trashMedia = await call(`/api/v1/admin/complete/media/${encodeURIComponent(uploadedMedia.uid)}/status`, {
    method: 'PATCH', headers: mutationHeaders,
    body: JSON.stringify({ status: 'trash', expectedUpdatedAt: metadataBody.updatedAt }),
  }, adminCookies)
  const trashMediaBody = await trashMedia.json()
  assert(trashMedia.status === 200 && trashMediaBody.status === 'trash', 'direct media trash mutation')
  const activeAfterTrash = await (await call('/api/v1/admin/complete/media?page=1&pageSize=100', {}, adminCookies)).json()
  const trashAfterTrash = await (await call('/api/v1/admin/complete/media/trash?page=1&pageSize=100', {}, adminCookies)).json()
  assert(!activeAfterTrash.rows?.some(row => row.uid === uploadedMedia.uid), 'trashed media disappears from active list')
  assert(trashAfterTrash.rows?.some(row => row.uid === uploadedMedia.uid && row.status === 'trash'), 'trashed media appears in dedicated trash list')

  const restoreMedia = await call(`/api/v1/admin/complete/media/${encodeURIComponent(uploadedMedia.uid)}/status`, {
    method: 'PATCH', headers: mutationHeaders,
    body: JSON.stringify({ status: 'active', expectedUpdatedAt: trashMediaBody.updatedAt }),
  }, adminCookies)
  const restoreMediaBody = await restoreMedia.json()
  assert(restoreMedia.status === 200 && restoreMediaBody.status === 'active', 'media restore validates storage and persists')
  const activeAfterRestore = await (await call('/api/v1/admin/complete/media?page=1&pageSize=100', {}, adminCookies)).json()
  const trashAfterRestore = await (await call('/api/v1/admin/complete/media/trash?page=1&pageSize=100', {}, adminCookies)).json()
  assert(activeAfterRestore.rows?.some(row => row.uid === uploadedMedia.uid && row.status === 'active'), 'restored media returns to active list')
  assert(!trashAfterRestore.rows?.some(row => row.uid === uploadedMedia.uid), 'restored media disappears from trash list')

  const mediaBackup = await call('/api/v1/admin/complete/import-export/export', {
    method: 'POST', headers: mutationHeaders,
    body: JSON.stringify({ format: 'backup', tables: ['media_assets'], includeMediaFiles: true, passphrase: password }),
  }, adminCookies)
  const mediaBackupBody = await mediaBackup.json()
  assert(mediaBackup.status === 200 && mediaBackupBody.mediaFilesIncluded === true && mediaBackupBody.mediaFiles >= 1 && mediaBackupBody.mediaBytes >= regressionPng.byteLength, 'encrypted backup includes managed media objects')
  const mediaBackupPreview = await call('/api/v1/admin/complete/import-export/preview', {
    method: 'POST', headers: mutationHeaders,
    body: JSON.stringify({ content: mediaBackupBody.content, passphrase: password, mode: 'merge' }),
  }, adminCookies)
  const mediaBackupPreviewBody = await mediaBackupPreview.json()
  assert(mediaBackupPreview.status === 200 && mediaBackupPreviewBody.mediaFilesIncluded === true && mediaBackupPreviewBody.media?.included >= 1 && mediaBackupPreviewBody.media?.missing === 0, 'media backup preview validates catalog and payload')
  const mediaRoot = resolve(directory, 'media')
  const mediaObjectPath = resolve(mediaRoot, ...String(uploadedMedia.objectKey).split('/'))
  assert(mediaObjectPath.startsWith(`${mediaRoot}${sep}`), 'uploaded media object remains inside isolated media root')
  await unlink(mediaObjectPath)
  const missingMedia = await (await call(`/api/v1/admin/complete/media/${encodeURIComponent(uploadedMedia.uid)}/check?deep=1`, {}, adminCookies)).json()
  assert(missingMedia.exists === false && missingMedia.consistent === false, 'media entity is physically absent before backup restore')
  const mediaBackupApplied = await call('/api/v1/admin/complete/import-export/apply', {
    method: 'POST', headers: mutationHeaders,
    body: JSON.stringify({ content: mediaBackupBody.content, passphrase: password, digest: mediaBackupPreviewBody.digest, mode: 'merge', confirmation: 'MERGE_ACADEMIC_CMS_DATA' }),
  }, adminCookies)
  const mediaBackupAppliedBody = await mediaBackupApplied.json()
  assert(mediaBackupApplied.status === 200 && mediaBackupAppliedBody.mediaFilesRestored >= 1 && mediaBackupAppliedBody.mediaFilesCreated >= 1, 'media backup restore recreates missing managed objects')
  const restoredMediaInspection = await (await call(`/api/v1/admin/complete/media/${encodeURIComponent(uploadedMedia.uid)}/check?deep=1`, {}, adminCookies)).json()
  assert(restoredMediaInspection.exists === true && restoredMediaInspection.consistent === true, 'restored media entity matches catalog metadata')

  const globalList = await call('/api/v1/admin/complete/resource/global-settings?page=1&pageSize=10', {}, adminCookies)
  const globalListBody = await globalList.json()
  const originalGlobal = globalListBody.rows?.[0]
  assert(Boolean(originalGlobal?.uid && originalGlobal?.updated_at), 'seeded global settings available for quick mutation')
  const globalMutationPath = `/api/v1/admin/complete/resource/global-settings/${encodeURIComponent(originalGlobal.uid)}`
  const globalDetail = await call(globalMutationPath, {}, adminCookies)
  const globalDetailBody = await globalDetail.json()
  assert(globalDetail.status === 200 && globalDetailBody.record?.uid === originalGlobal.uid, 'global settings detail loads for editor')
  const encryptedGlobalBackup = await call('/api/v1/admin/complete/import-export/export', {
    method: 'POST', headers: mutationHeaders,
    body: JSON.stringify({ format: 'backup', tables: ['global_settings'], passphrase: password }),
  }, adminCookies)
  const encryptedGlobalBackupBody = await encryptedGlobalBackup.json()
  assert(encryptedGlobalBackup.status === 200 && typeof encryptedGlobalBackupBody.content === 'string' && encryptedGlobalBackupBody.rows > 0, 'encrypted global configuration backup export')
  const originalRegistration = Number(originalGlobal.allow_public_registration) === 1 ? 1 : 0
  const originalMaxMb = Number(globalDetailBody.record.upload_max_size_mb)
  const originalDeepLConfigured = globalDetailBody.record.deepl_api_key_configured === true
  const changedMaxMb = originalMaxMb >= 20 ? 19 : originalMaxMb + 1
  const changedGlobal = await call(globalMutationPath, {
    method: 'PATCH', headers: mutationHeaders,
    body: JSON.stringify({
      expectedUpdatedAt: originalGlobal.updated_at,
      allow_public_registration: originalRegistration ? 0 : 1,
      upload_max_size_mb: changedMaxMb,
      secretOperations: { deepl_api_key: { action: 'replace', value: 'temporary-production-regression-key' } },
    }),
  }, adminCookies)
  const changedGlobalBody = await changedGlobal.json()
  assert(changedGlobal.status === 200, 'global settings value and secret replacement')
  const keptGlobal = await call(globalMutationPath, {
    method: 'PATCH', headers: mutationHeaders,
    body: JSON.stringify({ expectedUpdatedAt: changedGlobalBody.record.updated_at, secretOperations: { deepl_api_key: { action: 'keep' } } }),
  }, adminCookies)
  await keptGlobal.json()
  assert(keptGlobal.status === 200, 'global settings secret keep')
  const changedMediaPolicy = await (await call('/api/v1/admin/complete/media/stats', {}, adminCookies)).json()
  assert(changedMediaPolicy.policy?.configuredMaxMb === changedMaxMb, 'saved global configuration reaches runtime media policy immediately')
  const backupPreview = await call('/api/v1/admin/complete/import-export/preview', {
    method: 'POST', headers: mutationHeaders,
    body: JSON.stringify({ content: encryptedGlobalBackupBody.content, passphrase: password, mode: 'merge' }),
  }, adminCookies)
  const backupPreviewBody = await backupPreview.json()
  assert(backupPreview.status === 200 && backupPreviewBody.configurationRestored === true && backupPreviewBody.configurationTables?.includes('global_settings'), 'configuration backup preview declares activation scope')
  const backupApplied = await call('/api/v1/admin/complete/import-export/apply', {
    method: 'POST', headers: mutationHeaders,
    body: JSON.stringify({ content: encryptedGlobalBackupBody.content, passphrase: password, digest: backupPreviewBody.digest, mode: 'merge', confirmation: 'MERGE_ACADEMIC_CMS_DATA' }),
  }, adminCookies)
  const backupAppliedBody = await backupApplied.json()
  assert(backupApplied.status === 200 && backupAppliedBody.configurationRestored === true && backupAppliedBody.requiresReload === true, 'configuration backup restore reports reload requirement')
  assert(backupAppliedBody.invalidatedCacheTags?.includes('public:settings') && backupAppliedBody.invalidatedCacheTags?.includes('public:media-policy'), 'configuration restore invalidates canonical runtime cache tags')
  const restoredGlobal = await (await call(globalMutationPath, {}, adminCookies)).json()
  assert(Number(restoredGlobal.record?.allow_public_registration) === originalRegistration && Number(restoredGlobal.record?.upload_max_size_mb) === originalMaxMb && restoredGlobal.record?.deepl_api_key_configured === originalDeepLConfigured, 'encrypted backup restores normal and secret global configuration')
  const restoredMediaPolicy = await (await call('/api/v1/admin/complete/media/stats', {}, adminCookies)).json()
  assert(restoredMediaPolicy.policy?.configuredMaxMb === originalMaxMb, 'restored global configuration reaches runtime media policy')

  const readerCookies = new Map()
  const readerLogin = await call('/api/v1/auth/login', {
    method: 'POST',
    headers: { origin: requestOrigin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'demo_user_09', password }),
  }, readerCookies)
  assert(readerLogin.status === 200, 'low-privilege account login')
  await expectStatus('/api/v1/admin/complete/resource/site-settings?page=1&pageSize=10', 403, undefined, readerCookies, 'low-privilege API denial')

  const removedPaths = [
    '/admin/site-settings', '/admin/global-settings', '/admin/navigation-items', '/admin/media-library',
    '/admin/translation-cache', '/admin/translations', '/admin/operation-logs', '/admin/users',
    '/admin/roles', '/admin/permissions', '/admin/backup', '/admin/research-interests', '/admin/student-category-displays',
    '/admin/news/new', '/admin/news/news%3Ademo',
  ]
  for (const path of removedPaths) await expectStatus(path, 404, undefined, adminCookies, `removed route ${path}`)
  await expectStatus('/api/v1/admin/content/news?page=1&pageSize=10', 404, undefined, adminCookies, 'removed generic news API')

  // Exceed the old 150-request window on an isolated visitor without changing
  // the production limiter, then prove genuine API throttling remains bounded.
  const rapidHeaders = { 'x-forwarded-for': '192.0.2.142' }
  for (let batch = 0; batch < 20; batch++) {
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => call(index % 2 ? '/en/news' : '/zh/publications', { headers: rapidHeaders }, new Map())))
    for (const response of responses) {
      assert(response.status === 200, 'rapid navigation remains available past the old shared quota')
      const html = await response.text()
      assert(!html.includes('Too Many Requests'), 'rapid document contains no generic rate error')
    }
  }
  const publicRead = await call('/api/v1/public/news?locale=zh', { headers: rapidHeaders }, new Map())
  assert(publicRead.status === 200 && publicRead.headers.get('x-ratelimit-limit') === '480', 'public content reads have a separate one-minute budget')
  await publicRead.arrayBuffer()
  const limitHeaders = { 'x-forwarded-for': '192.0.2.143' }
  let limited
  for (let index = 0; index < 62; index++) {
    const response = await call('/api/v1/public/contact', { headers: limitHeaders }, new Map())
    await response.arrayBuffer()
    if (response.status === 429) { limited = response; break }
    assert(response.status === 200, 'contact settings reads stay valid until their own quota')
  }
  assert(limited?.status === 429 && limited.headers.get('x-ratelimit-limit') === '60', 'genuine contact API rate limits remain active')
  const afterLimit = await call('/zh/contact', { headers: limitHeaders }, new Map())
  assert(afterLimit.status === 200, 'exhausting a contact API bucket does not block its document')
  await afterLimit.arrayBuffer()

  await new Promise(accept => setTimeout(accept, 100))
  assert(!/Please prefer using message for longer error messages instead of statusMessage/u.test(serverLog), 'no H3 statusMessage deprecation warning')
  assert(!/\[request error\].*\[unhandled\]/u.test(serverLog), 'no unhandled production request errors')

  const report = {
    status: 'passed',
    generatedAt: new Date().toISOString(),
    pages: pagePaths.length,
    APIs: apiPaths.length,
    removedRoutes: removedPaths.length,
    checks,
  }
  await mkdir(reportDirectory, { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ ...report, report: 'reports/final-regression/production-http.json' }, null, 2)}\n`)
} catch (error) {
  await mkdir(reportDirectory, { recursive: true })
  await writeFile(reportPath, `${JSON.stringify({ status: 'failed', generatedAt: new Date().toISOString(), checks, error: redact(error instanceof Error ? error.message : String(error)) }, null, 2)}\n`)
  throw error
} finally {
  await stop(child)
  domWindow.close()
  if (geoServer) { geoServer.closeAllConnections(); await new Promise(accept => geoServer.close(accept)) }
  serverLog = redact(serverLog)
  await mkdir(reportDirectory, { recursive: true })
  await writeFile(resolve(reportDirectory, 'production-server.log'), serverLog)
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
