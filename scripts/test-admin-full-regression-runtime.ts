import { ADMIN_CONTENT_MODULES, adminContentModule, type AdminFieldDefinition } from '../shared/admin/content-modules'
import { ADMIN_MODULES } from '../shared/admin/registry'

const ACKNOWLEDGEMENT = 'I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_DATABASE'
if (process.env.CMS_ADMIN_REGRESSION_ACK !== ACKNOWLEDGEMENT) {
  throw new Error(`Set CMS_ADMIN_REGRESSION_ACK=${ACKNOWLEDGEMENT} to run the full admin mutation test`)
}

const baseUrl = process.env.CMS_TEST_BASE_URL ?? ''
const requestOrigin = process.env.CMS_TEST_ORIGIN ?? baseUrl
const username = process.env.CMS_TEST_USERNAME ?? ''
const password = process.env.CMS_TEST_PASSWORD ?? ''
if (!/^https:\/\/127\.0\.0\.1:\d+$/u.test(baseUrl) || requestOrigin !== baseUrl || !username || !password) {
  throw new Error('An isolated loopback HTTPS origin and test credentials are required')
}

const cookies = new Map<string, string>()
function absorbCookies(response: Response): void {
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(';', 1)[0] ?? ''
    const separator = pair.indexOf('=')
    if (separator < 1) continue
    const name = pair.slice(0, separator)
    const value = pair.slice(separator + 1)
    if (value) cookies.set(name, value)
    else cookies.delete(name)
  }
}
function csrfToken(): string { return [...cookies].find(([name]) => name.toLowerCase().includes('csrf'))?.[1] ?? '' }
function cookieHeader(): string { return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') }

interface Result { status: number; text: string; json: any; headers: Headers }
async function request(path: string, options: { method?: string; body?: unknown; omitCsrf?: boolean; authenticated?: boolean } = {}): Promise<Result> {
  const method = options.method ?? 'GET'
  const authenticated = options.authenticated !== false
  const headers = new Headers({ accept: 'application/json', 'user-agent': 'Academic-CMS-Admin-Full-Regression/1.0' })
  if (authenticated && cookies.size) headers.set('cookie', cookieHeader())
  if (!['GET', 'HEAD'].includes(method)) {
    headers.set('origin', requestOrigin)
    headers.set('sec-fetch-site', 'same-origin')
    headers.set('content-type', 'application/json')
    if (authenticated && !options.omitCsrf) headers.set('x-csrf-token', csrfToken())
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (authenticated) absorbCookies(response)
  const text = await response.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { /* HTML is checked by status. */ }
  return { status: response.status, text, json, headers: response.headers }
}
function expectStatus(result: Result, expected: readonly number[], label: string): void {
  if (!expected.includes(result.status)) throw new Error(`${label}: HTTP ${result.status} ${result.text.slice(0, 700)}`)
}

const marker = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
function fieldValue(field: AdminFieldDefinition, module: string): string | number | boolean | null {
  if (field.defaultValue !== undefined) return field.defaultValue
  if (module === 'student_category_displays' && field.name === 'key') return `full-regression-${marker}`.toLowerCase()
  const label = `全量回归-${module}-${marker}`
  switch (field.kind) {
    case 'boolean': return false
    case 'integer': return Math.max(field.min ?? 0, 1)
    case 'decimal': return 1.5
    case 'select': return field.options?.[0]?.value ?? ''
    case 'date': return '2026-09-04'
    case 'datetime': return '2026-09-04T00:00:00.000Z'
    case 'email': return `regression-${marker}@example.invalid`
    case 'url': return `https://example.invalid/${module}/${marker}`
    case 'slug': return `full-regression-${marker}`.toLowerCase()
    case 'media': return null
    default: return label
  }
}

const assertions: string[] = []
const login = await request('/api/v1/auth/login', { method: 'POST', body: { username, password } })
expectStatus(login, [200], 'login')
if (!csrfToken()) throw new Error('Login did not issue the CSRF cookie')
assertions.push('authentication')

const anonymousCapabilities = await request('/api/v1/admin/capabilities', { authenticated: false })
expectStatus(anonymousCapabilities, [401], 'anonymous capabilities')
const capabilities = await request('/api/v1/admin/capabilities')
expectStatus(capabilities, [200], 'capabilities')
if (capabilities.json?.capabilities?.length !== ADMIN_MODULES.length) throw new Error('Capability count differs from the admin registry')
for (const module of ADMIN_MODULES) {
  const row = capabilities.json.capabilities.find((item: any) => item.module === module.module)
  if (!row || row.path !== module.path || row.connected !== true) throw new Error(`Capability mismatch: ${module.module}`)
}
assertions.push('registry-capabilities')

const navigation = await request('/api/v1/admin/navigation')
expectStatus(navigation, [200], 'permission-aware navigation')
const dashboard = await request('/api/v1/admin/dashboard')
expectStatus(dashboard, [200], 'dashboard data')
for (const module of ADMIN_MODULES) {
  const page = await request(module.path)
  expectStatus(page, [200], `${module.module} page`)
  if (!page.headers.get('cache-control')?.includes('no-store')) throw new Error(`${module.module} page is cacheable`)
}
const systemCheck = await request('/admin/system-check')
expectStatus(systemCheck, [200], 'system check page')
assertions.push('all-pages')

const csrfRejected = await request('/api/v1/admin/content/profiles', { method: 'POST', body: { values: {} }, omitCsrf: true })
expectStatus(csrfRejected, [403], 'generic mutation CSRF rejection')
const unknownModule = await request('/api/v1/admin/content/not-a-module')
expectStatus(unknownModule, [404], 'unknown content module')
assertions.push('negative-boundaries')

const generic: Record<string, Record<string, unknown>> = {}
for (const module of ADMIN_CONTENT_MODULES) {
  const definition = adminContentModule(module)
  const list = await request(`/api/v1/admin/content/${module}?page=1&pageSize=20`)
  expectStatus(list, [200], `${module} list`)
  if (list.json?.module !== module || !Array.isArray(list.json?.items)) throw new Error(`${module} returned an invalid list contract`)
  if (list.json.items[0]?.uid) {
    const detail = await request(`/api/v1/admin/content/${module}/${encodeURIComponent(list.json.items[0].uid)}`)
    expectStatus(detail, [200], `${module} detail`)
  }

  if (!definition.canCreate) {
    if (!list.json.items[0]?.uid) throw new Error(`${module} needs a seeded record for its update workflow`)
    const current = await request(`/api/v1/admin/content/${module}/${encodeURIComponent(list.json.items[0].uid)}`)
    expectStatus(current, [200], `${module} seeded detail`)
    const batchField = definition.batchFields[0]
    if (!batchField) throw new Error(`${module} has no editable workflow`)
    const batch = await request(`/api/v1/admin/content/${module}/batch`, {
      method: 'PATCH',
      body: { uids: [current.json.uid], expectedUpdatedAtByUid: { [current.json.uid]: current.json.updatedAt }, values: { [batchField]: current.json.values[batchField] } },
    })
    expectStatus(batch, [200], `${module} batch update`)
    generic[module] = { list: list.status, detail: current.status, batch: batch.status }
    continue
  }

  const values: Record<string, string | number | boolean | null> = {}
  for (const field of definition.fields) {
    if (!field.readOnly && (field.required || field.defaultValue !== undefined || field.name === definition.primaryField || definition.uniqueFields?.includes(field.name))) {
      values[field.name] = fieldValue(field, module)
    }
  }
  const create = await request(`/api/v1/admin/content/${module}`, { method: 'POST', body: { values } })
  expectStatus(create, [200], `${module} create`)
  const created = create.json?.record
  if (!created?.uid || !created?.updatedAt) throw new Error(`${module} create contract is invalid`)
  const detail = await request(`/api/v1/admin/content/${module}/${encodeURIComponent(created.uid)}`)
  expectStatus(detail, [200], `${module} created detail`)
  const primaryField = definition.fields.find(field => field.name === definition.primaryField)
  if (!primaryField) throw new Error(`${module} has no primary field`)
  const updatedValue = primaryField.kind === 'slug' ? `updated-${marker}` : `已编辑-${module}-${marker}`
  const update = await request(`/api/v1/admin/content/${module}/${encodeURIComponent(created.uid)}`, {
    method: 'PATCH', body: { expectedUpdatedAt: detail.json.updatedAt, values: { [definition.primaryField]: updatedValue } },
  })
  expectStatus(update, [200], `${module} update`)
  const batchField = definition.batchFields[0]
  if (!batchField) throw new Error(`${module} has no batch field`)
  const batchValue = update.json.record.values[batchField]
  const batch = await request(`/api/v1/admin/content/${module}/batch`, {
    method: 'PATCH',
    body: { uids: [created.uid], expectedUpdatedAtByUid: { [created.uid]: update.json.record.updatedAt }, values: { [batchField]: batchValue } },
  })
  expectStatus(batch, [200], `${module} batch update`)
  const afterBatch = await request(`/api/v1/admin/content/${module}/${encodeURIComponent(created.uid)}`)
  expectStatus(afterBatch, [200], `${module} detail after batch`)
  const removal = await request(`/api/v1/admin/content/${module}/${encodeURIComponent(created.uid)}`, {
    method: 'DELETE', body: { expectedUpdatedAt: afterBatch.json.updatedAt },
  })
  expectStatus(removal, [200], `${module} delete`)
  const missing = await request(`/api/v1/admin/content/${module}/${encodeURIComponent(created.uid)}`)
  expectStatus(missing, [404], `${module} deleted detail`)
  generic[module] = { list: list.status, create: create.status, detail: detail.status, update: update.status, batch: batch.status, delete: removal.status }
}
assertions.push('generic-content-crud')

for (const resource of ['site-settings', 'global-settings', 'navigation', 'news']) {
  const list = await request(`/api/v1/admin/complete/resource/${resource}?page=1&pageSize=20`)
  expectStatus(list, [200], `${resource} complete list`)
  const uid = list.json?.rows?.[0]?.uid
  if (!uid) throw new Error(`${resource} complete list is empty`)
  const detail = await request(`/api/v1/admin/complete/resource/${resource}/${encodeURIComponent(uid)}`)
  expectStatus(detail, [200], `${resource} complete detail`)
}
assertions.push('explicit-resource-reads')

const specialistEndpoints = [
  ['/api/v1/admin/complete/media/stats', 'media'],
  ['/api/v1/admin/complete/translation/overview', 'translation'],
  ['/api/v1/admin/complete/auth/overview', 'auth'],
  ['/api/v1/admin/complete/logs?page=1&pageSize=20', 'logs'],
] as const
for (const [path, label] of specialistEndpoints) expectStatus(await request(path), [200], label)
const exported = await request('/api/v1/admin/complete/import-export/export', { method: 'POST', body: { format: 'json', tables: ['research_interests'] } })
expectStatus(exported, [200], 'import/export JSON')
if (!exported.json?.content || !exported.json?.filename) throw new Error('Import/export response is incomplete')
assertions.push('specialist-endpoints')

console.log(JSON.stringify({
  status: 'passed',
  modules: ADMIN_MODULES.length,
  pages: ADMIN_MODULES.length + 1,
  generic,
  assertions,
}, null, 2))
