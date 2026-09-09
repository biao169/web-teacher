const ACKNOWLEDGEMENT = 'I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_DATABASE'

if (process.env.CMS_NAVIGATION_TEST_ACK !== ACKNOWLEDGEMENT) {
  throw new Error(`Set CMS_NAVIGATION_TEST_ACK=${ACKNOWLEDGEMENT} to run the navigation mutation test`)
}

const baseUrl = process.env.CMS_TEST_BASE_URL ?? 'http://127.0.0.1:8020'
const requestOrigin = process.env.CMS_TEST_ORIGIN ?? baseUrl
const username = process.env.CMS_TEST_USERNAME ?? ''
const password = process.env.CMS_TEST_PASSWORD ?? ''
if (!username || !password) throw new Error('CMS_TEST_USERNAME and CMS_TEST_PASSWORD are required')

const cookies = new Map()

function absorbCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(';', 1)[0] ?? ''
    const separator = pair.indexOf('=')
    if (separator < 1) continue
    const value = pair.slice(separator + 1)
    if (value) cookies.set(pair.slice(0, separator), value)
    else cookies.delete(pair.slice(0, separator))
  }
}

function csrfToken() {
  return [...cookies].find(([name]) => name.toLowerCase().includes('csrf'))?.[1] ?? ''
}

async function request(path, { method = 'GET', body, omitCsrf = false, authenticated = true } = {}) {
  const headers = new Headers({ accept: 'application/json', 'user-agent': 'Academic-CMS-Navigation-Test/1.0' })
  if (authenticated && cookies.size) headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '))
  if (!['GET', 'HEAD'].includes(method)) {
    headers.set('origin', requestOrigin)
    headers.set('sec-fetch-site', 'same-origin')
    headers.set('content-type', 'application/json')
    if (!omitCsrf && authenticated) headers.set('x-csrf-token', csrfToken())
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (authenticated) absorbCookies(response)
  const text = await response.text()
  let json = null
  try { json = text ? JSON.parse(text) : null }
  catch { /* HTML responses are validated by status. */ }
  return { status: response.status, text, json }
}

function expectStatus(result, expected, label) {
  if (!expected.includes(result.status)) throw new Error(`${label}: HTTP ${result.status} ${result.text.slice(0, 500)}`)
}

function errorPayload(result) {
  return result.json?.data?.error ?? result.json?.error ?? {}
}

async function detail(uid) {
  const result = await request(`/api/v1/admin/complete/resource/navigation/${encodeURIComponent(uid)}`)
  expectStatus(result, [200], 'navigation detail')
  return result.json.record
}

async function create(body, label) {
  const result = await request('/api/v1/admin/complete/resource/navigation', { method: 'POST', body })
  expectStatus(result, [200], label)
  if (!result.json?.record?.uid) throw new Error(`${label}: response is missing the created record`)
  return result.json.record
}

const login = await request('/api/v1/auth/login', { method: 'POST', body: { username, password } })
expectStatus(login, [200], 'login')
if (!cookies.has('academic-cms-csrf') && !cookies.has('__Host-academic-cms-csrf')) throw new Error('The canonical CSRF cookie was not issued')

const page = await request('/admin/navigation')
expectStatus(page, [200], 'navigation page')

const initialList = await request('/api/v1/admin/complete/resource/navigation?page=1&pageSize=20&sort=sort_order&direction=asc')
expectStatus(initialList, [200], 'navigation list')

// Warm the public cache before mutations; later assertions prove generation tags really invalidate it.
const warmShell = await request('/api/v1/public/shell?locale=zh', { authenticated: false })
expectStatus(warmShell, [200], 'initial public shell')

const marker = Date.now()
const routeATitle = `导航路甲-${marker}`
const routeBTitle = `导航路乙-${marker}`
const externalTitle = `导航外链-${marker}`
const sidebarTitle = `动态快捷入口-${marker}`
const anchorFragment = `navigation_${marker}`

const routeA = await create({
  title: routeATitle, title_en: `Route A ${marker}`, kind: 'route', url_name: null,
  path: `/research/navigation-${marker}`, fragment: 'overview', icon: 'link', style: 'normal',
  location: 'header', visibility: 'public', enabled: 1, sort_order: 950,
}, 'create route navigation')
const routeB = await create({
  title: routeBTitle, title_en: `Route B ${marker}`, kind: 'button', url_name: 'projects',
  path: null, fragment: null, icon: 'project', style: 'primary', location: 'header',
  visibility: 'public', enabled: 1, sort_order: 951,
}, 'create named-route button')
const external = await create({
  title: externalTitle, title_en: `External ${marker}`, kind: 'external', url_name: null,
  path: `https://example.org/collaborate/${marker}`, fragment: null, icon: 'external-link', style: 'secondary',
  location: 'footer', visibility: 'public', enabled: 1, sort_order: 952,
}, 'create HTTPS navigation')
const sidebar = await create({
  title: sidebarTitle, title_en: `News shortcut ${marker}`, kind: 'button', url_name: null,
  path: '/admin/news', fragment: null, icon: 'news', style: 'normal', location: 'admin-sidebar',
  visibility: 'staff', enabled: 1, sort_order: 5,
}, 'create admin sidebar navigation')

const persisted = await detail(routeA.uid)
if (persisted.path !== `/research/navigation-${marker}` || persisted.kind !== 'route') throw new Error('Created route navigation was not persisted')

const filtered = await request('/api/v1/admin/complete/resource/navigation?page=1&pageSize=20&f_kind=external&f_location=footer&f_visibility=public&f_enabled=true')
expectStatus(filtered, [200], 'combined navigation filters')
if (!filtered.json.rows.some(row => row.uid === external.uid) || filtered.json.rows.some(row => row.kind !== 'external' || row.location !== 'footer' || row.visibility !== 'public' || row.enabled !== 1)) {
  throw new Error('Combined navigation filters returned incorrect records')
}

const adminSidebar = await request('/api/v1/admin/navigation')
expectStatus(adminSidebar, [200], 'admin sidebar navigation')
if (!adminSidebar.json?.items?.some(item => item.uid === sidebar.uid && item.path === '/admin/news' && item.title === sidebarTitle)) {
  throw new Error('Configured admin sidebar navigation was not returned to the authenticated shell')
}

const publicAfterCreate = await request('/api/v1/public/shell?locale=zh', { authenticated: false })
expectStatus(publicAfterCreate, [200], 'public shell after create')
const publicCreatedText = JSON.stringify(publicAfterCreate.json)
if (!publicCreatedText.includes(routeATitle) || !publicCreatedText.includes(externalTitle) || !publicCreatedText.includes(`/zh/research/navigation-${marker}#overview`)) {
  throw new Error('Public navigation did not refresh after creation')
}
if (publicCreatedText.includes(sidebarTitle)) throw new Error('Admin sidebar navigation leaked into the public shell')

const invalidExternal = await request('/api/v1/admin/complete/resource/navigation', {
  method: 'POST',
  body: { title: '无效外链', kind: 'external', path: 'http://example.org/insecure', location: 'header', visibility: 'public', enabled: 1, sort_order: 999 },
})
expectStatus(invalidExternal, [422], 'reject insecure external navigation')
if (!errorPayload(invalidExternal).fieldErrors?.path) throw new Error('Invalid external URL was not mapped to path')

const invalidInternal = await request('/api/v1/admin/complete/resource/navigation', {
  method: 'POST',
  body: { title: '无效站内路径', kind: 'route', path: '/api/v1/private', location: 'header', visibility: 'public', enabled: 1, sort_order: 999 },
})
expectStatus(invalidInternal, [422], 'reject private internal navigation')
if (!errorPayload(invalidInternal).fieldErrors?.path) throw new Error('Invalid internal path was not mapped to path')

const invalidSidebar = await request('/api/v1/admin/complete/resource/navigation', {
  method: 'POST',
  body: { title: '无效后台入口', kind: 'route', path: '/research', location: 'admin-sidebar', visibility: 'staff', enabled: 1, sort_order: 999 },
})
expectStatus(invalidSidebar, [422], 'reject non-admin sidebar target')
if (!errorPayload(invalidSidebar).fieldErrors?.path) throw new Error('Invalid admin sidebar target was not mapped to path')

const sequence = await request('/api/v1/admin/complete/resource/navigation/batch', {
  method: 'PATCH',
  body: {
    records: [
      { uid: routeB.uid, expectedUpdatedAt: (await detail(routeB.uid)).updated_at },
      { uid: routeA.uid, expectedUpdatedAt: (await detail(routeA.uid)).updated_at },
    ],
    field: 'sort_order', sequence: { start: 610, step: 10 },
  },
})
expectStatus(sequence, [200], 'sequence batch sort')
const [sortedB, sortedA] = await Promise.all([detail(routeB.uid), detail(routeA.uid)])
if (sortedB.sort_order !== 610 || sortedA.sort_order !== 620) throw new Error('Sequence batch sorting did not preserve request order')

const externalCurrent = await detail(external.uid)
const anchorUpdate = await request(`/api/v1/admin/complete/resource/navigation/${encodeURIComponent(external.uid)}`, {
  method: 'PATCH',
  body: { kind: 'anchor', url_name: null, path: null, fragment: anchorFragment, location: 'hero', expectedUpdatedAt: externalCurrent.updated_at },
})
expectStatus(anchorUpdate, [200], 'change external navigation into anchor')
const anchor = await detail(external.uid)
if (anchor.kind !== 'anchor' || anchor.path !== null || anchor.fragment !== anchorFragment) throw new Error('Link-type update did not clear hidden target fields')

const publicAfterAnchor = await request('/api/v1/public/shell?locale=zh', { authenticated: false })
expectStatus(publicAfterAnchor, [200], 'public shell after anchor update')
const hero = publicAfterAnchor.json?.navigation?.hero ?? []
if (!hero.some(item => item.uid === external.uid && item.href === `/zh#${anchorFragment}`)) throw new Error('Updated anchor did not appear in the public hero navigation')

const disable = await request('/api/v1/admin/complete/resource/navigation/batch', {
  method: 'PATCH',
  body: { records: [{ uid: external.uid, expectedUpdatedAt: anchor.updated_at }], field: 'enabled', value: 0 },
})
expectStatus(disable, [200], 'batch disable navigation')
const publicAfterDisable = await request('/api/v1/public/shell?locale=zh', { authenticated: false })
expectStatus(publicAfterDisable, [200], 'public shell after disable')
if (JSON.stringify(publicAfterDisable.json).includes(externalTitle)) throw new Error('Disabled navigation remained in the public shell cache')

const routeCurrent = await detail(routeA.uid)
const csrfRejected = await request(`/api/v1/admin/complete/resource/navigation/${encodeURIComponent(routeA.uid)}`, {
  method: 'PATCH', body: { title: 'should-not-save', expectedUpdatedAt: routeCurrent.updated_at }, omitCsrf: true,
})
expectStatus(csrfRejected, [403], 'CSRF negative test')

const auditLogs = await request('/api/v1/admin/complete/logs?page=1&pageSize=50&q=%E5%AF%BC%E8%88%AA%E4%B8%8E%E6%8C%89%E9%92%AE')
expectStatus(auditLogs, [200], 'navigation audit logs')
if ((auditLogs.json?.total ?? 0) < 7) throw new Error('Navigation audit records are missing')

console.log(JSON.stringify({
  page: page.status,
  login: login.status,
  list: initialList.status,
  createRouteButtonExternalAndSidebar: true,
  detail: true,
  combinedFilters: filtered.status,
  configuredAdminSidebar: adminSidebar.status,
  adminSidebarExcludedFromPublic: true,
  validation: { insecureExternal: invalidExternal.status, privateInternal: invalidInternal.status, nonAdminSidebarTarget: invalidSidebar.status },
  sequenceBatchSort: [sortedB.sort_order, sortedA.sort_order],
  typeChangeClearedFields: true,
  publicCacheInvalidated: true,
  batchDisabledHiddenPublicly: true,
  csrfRejected: csrfRejected.status,
  auditRows: auditLogs.json.total,
}, null, 2))
