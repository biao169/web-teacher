const ACKNOWLEDGEMENT = 'I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_DATABASE'

if (process.env.CMS_SITE_SETTINGS_TEST_ACK !== ACKNOWLEDGEMENT) {
  throw new Error(`Set CMS_SITE_SETTINGS_TEST_ACK=${ACKNOWLEDGEMENT} to run the site-settings mutation test`)
}

const baseUrl = process.env.CMS_TEST_BASE_URL ?? 'http://127.0.0.1:8018'
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

async function request(path, { method = 'GET', body, omitCsrf = false } = {}) {
  const headers = new Headers({ accept: 'application/json', 'user-agent': 'Academic-CMS-Site-Settings-Test/1.0' })
  if (cookies.size) headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '))
  if (!['GET', 'HEAD'].includes(method)) {
    headers.set('origin', requestOrigin)
    headers.set('sec-fetch-site', 'same-origin')
    headers.set('content-type', 'application/json')
    if (!omitCsrf) headers.set('x-csrf-token', csrfToken())
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  absorbCookies(response)
  const text = await response.text()
  let json = null
  try { json = text ? JSON.parse(text) : null }
  catch { /* HTML responses are validated by status below. */ }
  return { status: response.status, text, json }
}

function expectStatus(result, expected, label) {
  if (!expected.includes(result.status)) {
    throw new Error(`${label}: HTTP ${result.status} ${result.text.slice(0, 300)}`)
  }
}

const login = await request('/api/v1/auth/login', { method: 'POST', body: { username, password } })
expectStatus(login, [200], 'login')
if (!cookies.has('academic-cms-csrf') && !cookies.has('__Host-academic-cms-csrf')) {
  throw new Error('The canonical academic-cms-csrf cookie was not issued')
}

const page = await request('/admin/settings/site')
expectStatus(page, [200], 'site settings page')

const list = await request('/api/v1/admin/complete/resource/site-settings?page=1&pageSize=20')
expectStatus(list, [200], 'site settings list')
const original = list.json?.rows?.[0]
if (!original?.uid) throw new Error('The site settings list is empty')

const detail = await request(`/api/v1/admin/complete/resource/site-settings/${encodeURIComponent(original.uid)}`)
expectStatus(detail, [200], 'site settings detail')

const marker = Date.now()
const update = await request(`/api/v1/admin/complete/resource/site-settings/${encodeURIComponent(original.uid)}`, {
  method: 'PATCH',
  body: {
    site_name: `网站设置编辑测试-${marker}`,
    hero_title: `首页标题-${marker}`,
    seo_title: `SEO标题-${marker}`,
    footer_text: `页脚测试-${marker}`,
    homepage_publication_limit: 7,
    homepage_news_limit: 5,
    expectedUpdatedAt: detail.json.record.updated_at,
  },
})
expectStatus(update, [200], 'site settings update')

const reread = await request(`/api/v1/admin/complete/resource/site-settings/${encodeURIComponent(original.uid)}`)
expectStatus(reread, [200], 'site settings reread')
if (reread.json?.record?.site_name !== `网站设置编辑测试-${marker}` || reread.json?.record?.homepage_publication_limit !== 7) {
  throw new Error('Updated site settings were not persisted')
}

const created = await request('/api/v1/admin/complete/resource/site-settings', {
  method: 'POST',
  body: {
    site_name: `网站设置启用测试-${marker}`,
    site_name_en: `Site Settings Test ${marker}`,
    hero_title: `新首页-${marker}`,
    seo_title: `新SEO-${marker}`,
    footer_text: `新页脚-${marker}`,
    homepage_publication_limit: 6,
    homepage_news_limit: 4,
    is_active: 1,
  },
})
expectStatus(created, [200], 'site settings create and activate')
if (created.json?.record?.is_active !== 1) throw new Error('The new site setting was not activated')

const previous = await request(`/api/v1/admin/complete/resource/site-settings/${encodeURIComponent(original.uid)}`)
expectStatus(previous, [200], 'previous site setting after activation switch')
if (previous.json?.record?.is_active !== 0) throw new Error('The previously active setting was not disabled atomically')

const shell = await request('/api/v1/public/shell?locale=zh')
expectStatus(shell, [200], 'public shell')
if (!JSON.stringify(shell.json).includes(`网站设置启用测试-${marker}`)) {
  throw new Error('The public shell did not receive the newly active site setting')
}

const csrfRejected = await request(`/api/v1/admin/complete/resource/site-settings/${encodeURIComponent(created.json.record.uid)}`, {
  method: 'PATCH',
  body: { site_name: 'should-not-save', expectedUpdatedAt: created.json.record.updated_at },
  omitCsrf: true,
})
expectStatus(csrfRejected, [403], 'CSRF negative test')

const protectedDelete = await request(`/api/v1/admin/complete/resource/site-settings/${encodeURIComponent(created.json.record.uid)}?updatedAt=${encodeURIComponent(created.json.record.updated_at)}`, { method: 'DELETE' })
expectStatus(protectedDelete, [403], 'protected site settings delete')

const auditLogs = await request('/api/v1/admin/complete/logs?page=1&pageSize=20&q=%E7%BD%91%E7%AB%99%E8%AE%BE%E7%BD%AE')
expectStatus(auditLogs, [200], 'site settings audit logs')
if ((auditLogs.json?.total ?? 0) < 2) throw new Error('Site settings audit records are missing')

console.log(JSON.stringify({
  page: page.status,
  login: login.status,
  list: list.status,
  detail: detail.status,
  update: update.status,
  reread: reread.status,
  createAndActivate: created.status,
  previousDeactivated: true,
  publicShell: shell.status,
  csrfRejected: csrfRejected.status,
  protectedDelete: protectedDelete.status,
  auditRows: auditLogs.json.total,
}, null, 2))
