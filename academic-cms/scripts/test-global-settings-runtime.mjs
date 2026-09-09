const ACKNOWLEDGEMENT = 'I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_DATABASE'

if (process.env.CMS_GLOBAL_SETTINGS_TEST_ACK !== ACKNOWLEDGEMENT) {
  throw new Error(`Set CMS_GLOBAL_SETTINGS_TEST_ACK=${ACKNOWLEDGEMENT} to run the global-settings mutation test`)
}

const baseUrl = process.env.CMS_TEST_BASE_URL ?? 'http://127.0.0.1:8019'
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

async function request(path, { method = 'GET', body, contentType = 'application/json', omitCsrf = false, authenticated = true } = {}) {
  const headers = new Headers({ accept: 'application/json', 'user-agent': 'Academic-CMS-Global-Settings-Test/1.0' })
  if (authenticated && cookies.size) headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '))
  if (!['GET', 'HEAD'].includes(method)) {
    headers.set('origin', requestOrigin)
    headers.set('sec-fetch-site', 'same-origin')
    headers.set('content-type', contentType)
    if (!omitCsrf && authenticated) headers.set('x-csrf-token', csrfToken())
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body,
  })
  if (authenticated) absorbCookies(response)
  const text = await response.text()
  let json = null
  try { json = text ? JSON.parse(text) : null }
  catch { /* HTML responses are validated by status below. */ }
  return { status: response.status, text, json }
}

function expectStatus(result, expected, label) {
  if (!expected.includes(result.status)) throw new Error(`${label}: HTTP ${result.status} ${result.text.slice(0, 500)}`)
}

async function detail(uid) {
  const result = await request(`/api/v1/admin/complete/resource/global-settings/${encodeURIComponent(uid)}`)
  expectStatus(result, [200], 'global settings detail')
  return result
}

async function update(uid, values, label = 'global settings update') {
  const current = await detail(uid)
  const result = await request(`/api/v1/admin/complete/resource/global-settings/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    body: { ...values, expectedUpdatedAt: current.json.record.updated_at },
  })
  expectStatus(result, [200], label)
  return result
}

const login = await request('/api/v1/auth/login', { method: 'POST', body: { username, password } })
expectStatus(login, [200], 'login')
if (!cookies.has('academic-cms-csrf') && !cookies.has('__Host-academic-cms-csrf')) throw new Error('The canonical CSRF cookie was not issued')

const page = await request('/admin/settings/global')
expectStatus(page, [200], 'global settings page')

const list = await request('/api/v1/admin/complete/resource/global-settings?page=1&pageSize=20&sort=updated_at&direction=desc')
expectStatus(list, [200], 'global settings list')
const current = list.json?.rows?.[0]
if (!current?.uid) throw new Error('The global settings list is empty')

const marker = Date.now()
const replacementSecret = `global-settings-secret-${marker}`
const saved = await update(current.uid, {
  allow_public_registration: 1,
  allow_anonymous_messages: 0,
  upload_max_size_mb: 5,
  upload_allowed_extensions: '[".PNG","png"]',
  media_trash_retention_days: 45,
  news_pdf_engine: 'pdfjs',
  news_pdf_allow_download: 0,
  news_pdf_watermark: `TEST-${marker}`,
  translation_provider: 'deepl',
  translation_providers: '["deepl","mymemory"]',
  libretranslate_url: 'https://translate.example.invalid/',
  microsoft_translator_region: 'test-region',
  microsoft_translator_endpoint: 'https://api.cognitive.microsofttranslator.com/',
  mymemory_email: `global-settings-${marker}@example.invalid`,
  translation_batch_size: 12,
  translation_worker_count: 3,
  translation_timeout_seconds: 25,
  publication_metadata_provider: 'crossref',
  publication_metadata_providers: '["crossref","openalex"]',
  publication_display_style: 'apa',
  publication_suggestion_cache_seconds: 71,
  profile_suggestion_cache_seconds: 72,
  project_suggestion_cache_seconds: 73,
  patent_suggestion_cache_seconds: 74,
  student_suggestion_cache_seconds: 75,
  news_suggestion_cache_seconds: 76,
  course_suggestion_cache_seconds: 77,
  patent_metadata_providers: '["patentsview","epo-ops"]',
  notify_email: `notify-${marker}@example.invalid`,
  secretOperations: { deepl_api_key: { action: 'replace', value: replacementSecret } },
})
expectStatus(saved, [200], 'global settings full update')

const reread = await detail(current.uid)
const record = reread.json.record
if (record.upload_allowed_extensions !== '["png"]' || record.translation_worker_count !== 3 || record.publication_display_style !== 'apa') {
  throw new Error('Global setting fields were not normalized and persisted')
}
if (record.deepl_api_key_configured !== true || Object.hasOwn(record, 'deepl_api_key') || JSON.stringify(record).includes(replacementSecret)) {
  throw new Error('Secret redaction or configured-state reporting failed')
}

const registration = await request('/api/v1/auth/registration', { authenticated: false })
expectStatus(registration, [200], 'registration availability')
if (registration.json?.enabled !== true) throw new Error('Public registration did not receive the saved global setting')

const contact = await request('/api/v1/public/contact', { authenticated: false })
expectStatus(contact, [200], 'anonymous contact availability')
if (contact.json?.anonymousAllowed !== false || contact.json?.enabled !== false) throw new Error('Anonymous contact did not receive the saved global setting')

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
const allowedUpload = await request(`/api/v1/admin/complete/media/upload?filename=${encodeURIComponent(`policy-${marker}.png`)}&title=${encodeURIComponent('全局设置上传策略测试')}`, {
  method: 'POST', body: png, contentType: 'image/png',
})
expectStatus(allowedUpload, [200], 'allowed PNG upload')

await update(current.uid, {
  notify_email: `keep-${marker}@example.invalid`,
  secretOperations: { deepl_api_key: { action: 'keep' } },
}, 'secret keep')
const kept = await detail(current.uid)
if (kept.json.record.deepl_api_key_configured !== true) throw new Error('Secret keep unexpectedly removed the configured key')

await update(current.uid, {
  upload_allowed_extensions: '["pdf"]',
  secretOperations: { deepl_api_key: { action: 'clear' } },
}, 'secret clear and upload policy update')
const cleared = await detail(current.uid)
if (cleared.json.record.deepl_api_key_configured !== false) throw new Error('Secret clear did not remove the configured key')

const rejectedUpload = await request(`/api/v1/admin/complete/media/upload?filename=${encodeURIComponent(`blocked-${marker}.png`)}&title=${encodeURIComponent('应被策略拒绝')}`, {
  method: 'POST', body: png, contentType: 'image/png',
})
expectStatus(rejectedUpload, [415], 'blocked PNG upload')
if (rejectedUpload.json?.data?.error?.code !== 'UPLOAD_EXTENSION_NOT_ALLOWED' && rejectedUpload.json?.error?.code !== 'UPLOAD_EXTENSION_NOT_ALLOWED') {
  throw new Error('The blocked upload did not return the expected policy error')
}

const beforeInvalid = await detail(current.uid)
const invalidJson = await request(`/api/v1/admin/complete/resource/global-settings/${encodeURIComponent(current.uid)}`, {
  method: 'PATCH',
  body: { upload_allowed_extensions: '{}', expectedUpdatedAt: beforeInvalid.json.record.updated_at },
})
expectStatus(invalidJson, [422], 'invalid upload extension JSON')
const invalidFieldErrors = invalidJson.json?.data?.error?.fieldErrors ?? invalidJson.json?.error?.fieldErrors
if (!invalidFieldErrors?.upload_allowed_extensions) throw new Error('Invalid JSON was not mapped to the upload extension field')

const csrfRejected = await request(`/api/v1/admin/complete/resource/global-settings/${encodeURIComponent(current.uid)}`, {
  method: 'PATCH',
  body: { notify_email: `csrf-${marker}@example.invalid`, expectedUpdatedAt: cleared.json.record.updated_at },
  omitCsrf: true,
})
expectStatus(csrfRejected, [403], 'CSRF negative test')

const auditLogs = await request('/api/v1/admin/complete/logs?page=1&pageSize=20&q=%E5%85%A8%E5%B1%80%E8%AE%BE%E7%BD%AE')
expectStatus(auditLogs, [200], 'global settings audit logs')
if ((auditLogs.json?.total ?? 0) < 3) throw new Error('Global settings audit records are missing')

console.log(JSON.stringify({
  page: page.status,
  login: login.status,
  list: list.status,
  fullUpdate: saved.status,
  reread: reread.status,
  registrationEnabled: registration.json.enabled,
  anonymousMessagesEnabled: contact.json.anonymousAllowed,
  secretReplaceKeepClear: true,
  allowedUpload: allowedUpload.status,
  rejectedUpload: rejectedUpload.status,
  invalidJson: invalidJson.status,
  csrfRejected: csrfRejected.status,
  auditRows: auditLogs.json.total,
}, null, 2))
