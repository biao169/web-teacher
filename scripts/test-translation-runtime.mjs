const ACKNOWLEDGEMENT = 'I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_DATABASE'
if (process.env.CMS_TRANSLATION_TEST_ACK !== ACKNOWLEDGEMENT) throw new Error(`Set CMS_TRANSLATION_TEST_ACK=${ACKNOWLEDGEMENT}`)

const baseUrl = process.env.CMS_TEST_BASE_URL ?? 'http://127.0.0.1:8024'
const requestOrigin = process.env.CMS_TEST_ORIGIN ?? baseUrl
const providerUrl = process.env.CMS_FAKE_TRANSLATION_URL ?? 'http://127.0.0.1:8124'
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
function csrfToken() { return [...cookies].find(([name]) => name.toLowerCase().includes('csrf'))?.[1] ?? '' }
async function request(path, { method = 'GET', body, omitCsrf = false, authenticated = true } = {}) {
  const headers = new Headers({ accept: 'application/json', 'user-agent': 'Academic-CMS-Translation-Test/1.0' })
  if (authenticated && cookies.size) headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '))
  if (!['GET', 'HEAD'].includes(method)) {
    headers.set('origin', requestOrigin)
    headers.set('sec-fetch-site', 'same-origin')
    headers.set('content-type', 'application/json')
    if (!omitCsrf && authenticated) headers.set('x-csrf-token', csrfToken())
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  if (authenticated) absorbCookies(response)
  const text = await response.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* Page responses can be HTML. */ }
  return { status: response.status, text, json }
}
function expectStatus(result, expected, label) { if (!expected.includes(result.status)) throw new Error(`${label}: HTTP ${result.status} ${result.text.slice(0, 800)}`) }
function errorCode(result) { return result.json?.data?.error?.code ?? result.json?.error?.code ?? '' }
async function resourceList(resource, query = '') {
  const result = await request(`/api/v1/admin/complete/resource/${resource}?page=1&pageSize=100&sort=updated_at&direction=desc${query}`)
  expectStatus(result, [200], `${resource} list`)
  return result.json.rows
}
async function resourceDetail(resource, uid) {
  const result = await request(`/api/v1/admin/complete/resource/${resource}/${encodeURIComponent(uid)}`)
  expectStatus(result, [200], `${resource} detail`)
  return result.json.record
}
async function resourceUpdate(resource, uid, values) {
  const current = await resourceDetail(resource, uid)
  const result = await request(`/api/v1/admin/complete/resource/${resource}/${encodeURIComponent(uid)}`, { method: 'PATCH', body: { ...values, expectedUpdatedAt: current.updated_at } })
  expectStatus(result, [200], `${resource} update`)
  return result.json.record
}

const login = await request('/api/v1/auth/login', { method: 'POST', body: { username, password } })
expectStatus(login, [200], 'login')
if (!csrfToken()) throw new Error('CSRF cookie was not issued')
const page = await request('/admin/translation')
expectStatus(page, [200], 'translation workspace page')

const settings = (await resourceList('global-settings'))[0]
if (!settings?.uid) throw new Error('No global settings record')
await resourceUpdate('global-settings', settings.uid, {
  translation_provider: 'libretranslate', translation_providers: '["libretranslate"]',
  libretranslate_url: providerUrl, translation_batch_size: 50, translation_worker_count: 3, translation_timeout_seconds: 5,
})

const csrfRejected = await request('/api/v1/admin/complete/translation/scan', { method: 'POST', body: { limit: 120 }, omitCsrf: true })
expectStatus(csrfRejected, [403], 'translation CSRF rejection')

const scan = await request('/api/v1/admin/complete/translation/scan', { method: 'POST', body: { limit: 120 } })
expectStatus(scan, [200], 'translation scan')
if ((scan.json?.scanned ?? 0) < 20 || (scan.json?.needed ?? 0) < 10) throw new Error('Translation scan did not discover real public fields')
const repeatedScan = await request('/api/v1/admin/complete/translation/scan', { method: 'POST', body: { limit: 120 } })
expectStatus(repeatedScan, [200], 'idempotent translation scan')
if (repeatedScan.json?.needed !== 0) throw new Error('Repeated scan created duplicate translation work')

let translations = await resourceList('translation')
let heroRows = await resourceList('translation', '&q=hero_title&is_current=true')
if (!heroRows.some(row => /^site_settings\/.+\/hero_title$/u.test(row.source_ref_key))) throw new Error('Canonical source references were not created')
const manualBusinessFields = await resourceList('translation', '&q=site_name&is_current=true')
if (manualBusinessFields.some(row => row.source_ref_key.endsWith('/site_name'))) throw new Error('Business-owned English fields did not suppress automatic cache entries')

const paused = await request('/api/v1/admin/complete/translation/task', { method: 'PATCH', body: { action: 'pause' } })
expectStatus(paused, [200], 'pause translation task')
const blockedRun = await request('/api/v1/admin/complete/translation/run', { method: 'POST', body: {} })
expectStatus(blockedRun, [409], 'paused translation task guard')
if (errorCode(blockedRun) !== 'TRANSLATION_JOB_PAUSED') throw new Error('Paused task returned the wrong error code')
expectStatus(await request('/api/v1/admin/complete/translation/task', { method: 'PATCH', body: { action: 'resume' } }), [200], 'resume translation task')

// The fake provider fails exactly its first call. Verify failure persistence,
// explicit retry, bounded processing, then drain this 120-field test queue.
const firstRun = await request('/api/v1/admin/complete/translation/run', { method: 'POST', body: {} })
expectStatus(firstRun, [200], 'first translation batch')
if ((firstRun.json?.failed ?? 0) < 1 || (firstRun.json?.completed ?? 0) < 1) throw new Error('Provider partial failure was not persisted independently')
let failedRows = await resourceList('translation', '&status=failed&is_current=true')
if (!failedRows.length || !failedRows[0].error_message) throw new Error('Failure details are missing from the translation list')
const retry = await request('/api/v1/admin/complete/translation/retry', { method: 'POST', body: { uids: [failedRows[0].uid] } })
expectStatus(retry, [200], 'retry failed translation')
if (retry.json?.retried !== 1) throw new Error('Failed translation was not reset for immediate retry')

for (let index = 0; index < 6; index++) {
  const run = await request('/api/v1/admin/complete/translation/run', { method: 'POST', body: {} })
  expectStatus(run, [200], `drain translation batch ${index + 1}`)
  if (run.json?.status === 'completed') break
}

translations = await resourceList('translation', '&is_current=true')
heroRows = await resourceList('translation', '&q=hero_title&is_current=true')
const hero = heroRows.find(row => /^site_settings\/.+\/hero_title$/u.test(row.source_ref_key))
if (!hero || hero.status !== 'success' || !hero.translated_text?.startsWith('EN:')) throw new Error('Hero translation did not complete')
const sourceMeta = JSON.parse(hero.source_refs)?.[0]
if (!sourceMeta?.sourceUpdatedAt || sourceMeta.attemptCount < 1 || sourceMeta.leaseToken !== null) throw new Error('Translation execution metadata is incomplete')

const englishHome = await request('/api/v1/public/home?locale=en', { authenticated: false })
expectStatus(englishHome, [200], 'English public home')
if (!JSON.stringify(englishHome.json).includes(hero.translated_text)) throw new Error('Canonical translation hash did not match the public reader')

const manualText = `Manually reviewed hero ${Date.now()}`
const manual = await request(`/api/v1/admin/complete/translation/${encodeURIComponent(hero.uid)}`, { method: 'PATCH', body: { translatedText: manualText, expectedUpdatedAt: hero.updated_at } })
expectStatus(manual, [200], 'manual translation')
const conflict = await request(`/api/v1/admin/complete/translation/${encodeURIComponent(hero.uid)}`, { method: 'PATCH', body: { translatedText: 'stale overwrite', expectedUpdatedAt: hero.updated_at } })
expectStatus(conflict, [409], 'manual optimistic lock')

const manualHome = await request('/api/v1/public/home?locale=en', { authenticated: false })
expectStatus(manualHome, [200], 'public home after manual translation')
if (!JSON.stringify(manualHome.json).includes(manualText)) throw new Error('Manual translation did not invalidate and refresh the public cache')

const bypass = await request(`/api/v1/admin/complete/resource/translation/${encodeURIComponent(hero.uid)}`, { method: 'PATCH', body: { is_current: 0, expectedUpdatedAt: manual.json.record.updated_at } })
expectStatus(bypass, [422], 'generic lifecycle bypass rejection')
if (errorCode(bypass) !== 'READ_ONLY_FIELD') throw new Error('Generic translation lifecycle bypass returned the wrong error')

const site = (await resourceList('site-settings')).find(row => row.is_active === 1)
const sourceGuardRow = (await resourceList('translation', '&q=hero_subtitle&is_current=true')).find(row => row.source_ref_key.endsWith('/hero_subtitle'))
if (!site || !sourceGuardRow) throw new Error('Source revision guard fixtures are missing')
await resourceUpdate('site-settings', site.uid, { hero_subtitle: `${sourceGuardRow.source_text}（已更新）` })
const staleManual = await request(`/api/v1/admin/complete/translation/${encodeURIComponent(sourceGuardRow.uid)}`, { method: 'PATCH', body: { translatedText: 'must be rejected', expectedUpdatedAt: sourceGuardRow.updated_at } })
expectStatus(staleManual, [409], 'source revision guard')
if (errorCode(staleManual) !== 'TRANSLATION_SOURCE_CHANGED') throw new Error('Changed source returned the wrong conflict code')

const invalidate = await request('/api/v1/admin/complete/translation/invalidate', { method: 'POST', body: { uids: [hero.uid] } })
expectStatus(invalidate, [200], 'manual cache invalidation')
if (invalidate.json?.invalidated !== 1) throw new Error('Manual cache invalidation did not update the selected record')
const fallbackHome = await request('/api/v1/public/home?locale=en', { authenticated: false })
expectStatus(fallbackHome, [200], 'public home after invalidation')
if (JSON.stringify(fallbackHome.json).includes(manualText)) throw new Error('Invalidated manual translation is still visible publicly')
const changedRescan = await request('/api/v1/admin/complete/translation/scan', { method: 'POST', body: { limit: 120 } })
expectStatus(changedRescan, [200], 'rescan changed and invalidated sources')
if ((changedRescan.json?.needed ?? 0) < 2) throw new Error('Rescan did not enqueue invalidated and source-changed fields')
const pendingSubtitle = (await resourceList('translation', '&q=hero_subtitle&is_current=true')).find(row => row.source_ref_key.endsWith('/hero_subtitle'))
if (!pendingSubtitle || pendingSubtitle.status !== 'pending') throw new Error('Changed source was not re-enqueued')
await resourceUpdate('site-settings', site.uid, { hero_subtitle: `${pendingSubtitle.source_text}（再次更新）` })
const changedPendingRescan = await request('/api/v1/admin/complete/translation/scan', { method: 'POST', body: { limit: 120 } })
expectStatus(changedPendingRescan, [200], 'rescan changed pending source')
const refreshedPending = (await resourceList('translation', '&q=hero_subtitle&is_current=true')).find(row => row.source_ref_key.endsWith('/hero_subtitle'))
if (!refreshedPending || refreshedPending.status !== 'pending' || !refreshedPending.source_text.endsWith('（再次更新）')) throw new Error('Pending source refresh was incorrectly invalidated')

const overview = await request('/api/v1/admin/complete/translation/overview')
expectStatus(overview, [200], 'translation overview')
if (!overview.json?.totals || overview.json?.state?.version !== 2) throw new Error('Persistent translation task state is incomplete')
const providerStats = await fetch(`${providerUrl}/stats`).then(response => response.json())
if (providerStats.failures !== 1 || providerStats.calls < 2) throw new Error('Fake provider was not exercised as expected')

console.log(JSON.stringify({
  page: page.status, login: login.status, csrfRejected: csrfRejected.status,
  scan: scan.json, repeatedScanNeeded: repeatedScan.json.needed, changedRescanNeeded: changedRescan.json.needed,
  changedPendingRescanNeeded: changedPendingRescan.json.needed, pausedRun: blockedRun.status,
  firstBatch: firstRun.json, retried: retry.json.retried,
  publicCacheHit: true, manualOverride: true, optimisticLock: conflict.status,
  sourceRevisionGuard: staleManual.status, lifecycleBypass: bypass.status,
  invalidated: invalidate.json.invalidated, providerStats,
}, null, 2))
