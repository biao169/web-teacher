const ACKNOWLEDGEMENT = 'I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_DATABASE'

if (process.env.CMS_NEWS_TEST_ACK !== ACKNOWLEDGEMENT) {
  throw new Error(`Set CMS_NEWS_TEST_ACK=${ACKNOWLEDGEMENT} to run the news mutation test`)
}

const baseUrl = process.env.CMS_TEST_BASE_URL ?? 'http://127.0.0.1:8021'
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
function csrfToken() { return [...cookies].find(([name]) => name.toLowerCase().includes('csrf'))?.[1] ?? '' }
async function request(path, { method = 'GET', body, omitCsrf = false, authenticated = true } = {}) {
  const headers = new Headers({ accept: 'application/json', 'user-agent': 'Academic-CMS-News-Test/1.0' })
  if (authenticated && cookies.size) headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '))
  if (!['GET', 'HEAD'].includes(method)) {
    headers.set('origin', requestOrigin); headers.set('sec-fetch-site', 'same-origin'); headers.set('content-type', 'application/json')
    if (!omitCsrf && authenticated) headers.set('x-csrf-token', csrfToken())
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  if (authenticated) absorbCookies(response)
  const text = await response.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* HTML responses are checked through status and text. */ }
  return { status: response.status, text, json }
}
function expectStatus(result, expected, label) { if (!expected.includes(result.status)) throw new Error(`${label}: HTTP ${result.status} ${result.text.slice(0, 700)}`) }
function errorPayload(result) { return result.json?.data?.error ?? result.json?.error ?? {} }
async function detail(uid) {
  const result = await request(`/api/v1/admin/complete/resource/news/${encodeURIComponent(uid)}`)
  expectStatus(result, [200], 'news detail')
  return result.json.record
}
async function create(values, label = 'create news') {
  const result = await request('/api/v1/admin/complete/resource/news', { method: 'POST', body: values })
  expectStatus(result, [200], label)
  return result.json.record
}
async function update(uid, values, label = 'update news') {
  const current = await detail(uid)
  const result = await request(`/api/v1/admin/complete/resource/news/${encodeURIComponent(uid)}`, { method: 'PATCH', body: { ...values, expectedUpdatedAt: current.updated_at } })
  expectStatus(result, [200], label)
  return result.json.record
}

const login = await request('/api/v1/auth/login', { method: 'POST', body: { username, password } })
expectStatus(login, [200], 'login')
if (!csrfToken()) throw new Error('The canonical CSRF cookie was not issued')

const page = await request('/admin/news')
expectStatus(page, [200], 'news page')
const modules = await request('/api/v1/admin/complete/modules')
expectStatus(modules, [200], 'module descriptors')
const descriptor = modules.json?.modules?.find(module => module.key === 'news')
if (!descriptor?.fields?.some(field => field.key === 'related_publication_uid' && field.type === 'relation')) throw new Error('News relation UI descriptor is missing')
if (!descriptor?.fields?.some(field => field.key === 'content_format' && field.default === 'plain')) throw new Error('News format default is missing')

for (const resource of ['publications', 'projects', 'students']) {
  const related = await request(`/api/v1/admin/content/${resource}?page=1&pageSize=20&q=demo`)
  expectStatus(related, [200], `${resource} relation choices`)
  if (!related.json?.items?.length) throw new Error(`${resource} relation choices are empty`)
}

const marker = Date.now()
const slug = `runtime-news-${marker}`
const title = `新闻完整性验收 ${marker}`
const draft = await create({
  title, slug: slug.toUpperCase(), category: '验收测试', cover_key: 'demo/covers/research-01.png',
  content: '这是新闻发布流程的初始纯文本。', content_format: 'plain',
  related_publication_uid: 'demo:publication:01', related_project_uid: 'demo:project:01', related_student_uid: 'demo:student:01',
  allow_comments: 1, published_at: null, visibility: 'hidden', is_featured: 1, sort_order: 990,
})
if (draft.slug !== slug || draft.visibility !== 'hidden' || draft.related_project_uid !== 'demo:project:01') throw new Error('Draft normalization or relations were not persisted')

const duplicate = await request('/api/v1/admin/complete/resource/news', { method: 'POST', body: { title: '重复 Slug', slug, content_format: 'plain', visibility: 'hidden' } })
expectStatus(duplicate, [409], 'duplicate slug')
if (errorPayload(duplicate).code !== 'DUPLICATE_FIELD' || !errorPayload(duplicate).fieldErrors?.slug) throw new Error('Duplicate slug was not mapped to slug')

const missingDate = await request('/api/v1/admin/complete/resource/news', { method: 'POST', body: { title: '缺少时间', slug: `${slug}-missing-date`, content_format: 'plain', visibility: 'public' } })
expectStatus(missingDate, [422], 'public news without published_at')
if (!errorPayload(missingDate).fieldErrors?.published_at) throw new Error('Missing publish time was not mapped to published_at')

const invalidRelation = await request('/api/v1/admin/complete/resource/news', { method: 'POST', body: { title: '无效关联', slug: `${slug}-invalid-relation`, content_format: 'plain', visibility: 'hidden', related_project_uid: 'missing:project' } })
expectStatus(invalidRelation, [422], 'invalid news relation')
if (!errorPayload(invalidRelation).fieldErrors?.related_project_uid) throw new Error('Invalid relation was not mapped to related_project_uid')

const invalidCover = await request('/api/v1/admin/complete/resource/news', { method: 'POST', body: { title: '无效封面', slug: `${slug}-invalid-cover`, content_format: 'plain', visibility: 'hidden', cover_key: 'missing/cover.png' } })
expectStatus(invalidCover, [422], 'invalid news cover')
if (!errorPayload(invalidCover).fieldErrors?.cover_key) throw new Error('Invalid cover was not mapped to cover_key')

const genericHtml = await request(`/api/v1/admin/complete/resource/news/${encodeURIComponent(draft.uid)}`, { method: 'PATCH', body: { content: '<script>alert(1)</script>', content_format: 'html', expectedUpdatedAt: draft.updated_at } })
expectStatus(genericHtml, [422], 'reject generic HTML write')
if (!errorPayload(genericHtml).fieldErrors?.content) throw new Error('Generic HTML rejection was not mapped to content')

const future = new Date(Date.now() + 86_400_000).toISOString()
const scheduled = await update(draft.uid, { visibility: 'public', published_at: future }, 'schedule news')
const hiddenBeforeCutoff = await request(`/api/v1/public/news/${encodeURIComponent(slug)}?locale=zh`, { authenticated: false })
expectStatus(hiddenBeforeCutoff, [404], 'scheduled news before cutoff')

const document = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: '安全富文本发布验收' }] },
  { type: 'paragraph', attrs: { textAlign: 'justify' }, content: [
    { type: 'text', text: '加粗内容', marks: [{ type: 'bold' }] },
    { type: 'text', text: '与安全链接', marks: [{ type: 'link', attrs: { href: 'https://example.org/news-test' } }] },
  ] },
  { type: 'image', attrs: { objectKey: 'demo/covers/research-02.png', alt: '富文本示例图', float: 'right' } },
] }
const rich = await request(`/api/v1/admin/complete/news/${encodeURIComponent(draft.uid)}/rich-text`, { method: 'PATCH', body: { document, expectedUpdatedAt: scheduled.updated_at } })
expectStatus(rich, [200], 'save rich text')
const richRecord = rich.json.record
if (richRecord.content_format !== 'html' || !richRecord.content.includes('rich-align-center') || !richRecord.content.includes('rich-image-right') || !richRecord.content.includes('<strong>')) throw new Error('Rich-text structure was not rendered and persisted')

const invalidMedia = await request(`/api/v1/admin/complete/news/${encodeURIComponent(draft.uid)}/rich-text`, { method: 'PATCH', body: { document: { type: 'doc', content: [{ type: 'image', attrs: { objectKey: 'missing/image.png', alt: '' } }] }, expectedUpdatedAt: richRecord.updated_at } })
expectStatus(invalidMedia, [400, 422], 'reject missing rich-text media')
if (errorPayload(invalidMedia).code !== 'INVALID_RICH_TEXT_MEDIA') throw new Error('Missing rich-text media returned the wrong error')

await request('/api/v1/public/news?locale=zh&page=1&pageSize=12', { authenticated: false })
await request('/api/v1/public/home?locale=zh', { authenticated: false })
const published = await update(draft.uid, { visibility: 'public', published_at: new Date(Date.now() - 1_000).toISOString() }, 'publish news now')
const publicList = await request('/api/v1/public/news?locale=zh&page=1&pageSize=12', { authenticated: false })
expectStatus(publicList, [200], 'public news after publish')
if (!publicList.text.includes(title)) throw new Error('Published news did not invalidate the public list cache')
const publicDetail = await request(`/api/v1/public/news/${encodeURIComponent(slug)}?locale=zh`, { authenticated: false })
expectStatus(publicDetail, [200], 'public rich news detail')
const richBlock = publicDetail.json?.item?.blocks?.find(block => block.type === 'rich')
if (!richBlock?.html?.includes('<strong>') || !richBlock.html.includes('rich-align-center') || !richBlock.html.includes('/media/') || richBlock.html.includes('data-object-key') || richBlock.html.includes('<script')) throw new Error('Public rich-text projection lost formatting or bypassed sanitization')
if (publicDetail.json?.item?.related?.length !== 3 || publicDetail.json?.item?.commentsEnabled !== true) throw new Error('Related records or comments flag are missing from public detail')
const publicPage = await request(`/zh/news/${encodeURIComponent(slug)}`, { authenticated: false })
expectStatus(publicPage, [200], 'public news SSR page')
if (!publicPage.text.includes(title) || !publicPage.text.includes('<strong>')) throw new Error('Public news SSR did not render sanitized rich text')

const unscheduled = await create({ title: `批量发布防护 ${marker}`, slug: `${slug}-batch`, content_format: 'plain', visibility: 'hidden' }, 'create unscheduled draft')
const invalidBatch = await request('/api/v1/admin/complete/resource/news/batch', { method: 'PATCH', body: { records: [{ uid: unscheduled.uid, expectedUpdatedAt: unscheduled.updated_at }], field: 'visibility', value: 'public' } })
expectStatus(invalidBatch, [422], 'batch publish without schedule')

const commentBatch = await request('/api/v1/admin/complete/resource/news/batch', { method: 'PATCH', body: { records: [{ uid: unscheduled.uid, expectedUpdatedAt: (await detail(unscheduled.uid)).updated_at }], field: 'allow_comments', value: 1 } })
expectStatus(commentBatch, [200], 'batch comments update')

const csrfRejected = await request(`/api/v1/admin/complete/resource/news/${encodeURIComponent(draft.uid)}`, { method: 'PATCH', body: { title: 'should-not-save', expectedUpdatedAt: published.updated_at }, omitCsrf: true })
expectStatus(csrfRejected, [403], 'CSRF negative test')

const withdrawn = await update(draft.uid, { visibility: 'hidden' }, 'withdraw news')
if (withdrawn.visibility !== 'hidden') throw new Error('News withdrawal was not persisted')
const hiddenAfterWithdraw = await request(`/api/v1/public/news/${encodeURIComponent(slug)}?locale=zh`, { authenticated: false })
expectStatus(hiddenAfterWithdraw, [404], 'withdrawn news detail')

const auditLogs = await request('/api/v1/admin/complete/logs?page=1&pageSize=50&f_module=news')
expectStatus(auditLogs, [200], 'news audit logs')
if ((auditLogs.json?.total ?? 0) < 6) throw new Error('News audit records are missing')

console.log(JSON.stringify({
  page: page.status, login: login.status, relationChoices: true, draftAndSlugNormalization: true,
  validation: { duplicateSlug: duplicate.status, missingPublishTime: missingDate.status, relation: invalidRelation.status, cover: invalidCover.status, genericHtml: genericHtml.status, richMedia: invalidMedia.status },
  scheduledHiddenBeforeCutoff: hiddenBeforeCutoff.status, richText: rich.status, publicList: publicList.status,
  publicDetail: publicDetail.status, publicSsr: publicPage.status, relatedRecords: publicDetail.json.item.related.length,
  commentsEnabled: publicDetail.json.item.commentsEnabled, batchPublishGuard: invalidBatch.status, batchComments: commentBatch.status,
  csrfRejected: csrfRejected.status, withdrawnHidden: hiddenAfterWithdraw.status, auditRows: auditLogs.json.total,
}, null, 2))
