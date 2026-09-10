import Database from 'better-sqlite3'
import { stat, unlink, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

const ACKNOWLEDGEMENT = 'I_UNDERSTAND_THIS_MUTATES_DISPOSABLE_MEDIA_AND_DATABASE'
if (process.env.CMS_MEDIA_TEST_ACK !== ACKNOWLEDGEMENT) {
  throw new Error(`Set CMS_MEDIA_TEST_ACK=${ACKNOWLEDGEMENT} to run the media mutation test`)
}

const baseUrl = process.env.CMS_TEST_BASE_URL ?? 'http://127.0.0.1:8022'
const requestOrigin = process.env.CMS_TEST_ORIGIN ?? baseUrl
const username = process.env.CMS_TEST_USERNAME ?? ''
const password = process.env.CMS_TEST_PASSWORD ?? ''
const databasePath = resolve(process.env.CMS_TEST_DATABASE_PATH ?? '')
const mediaRoot = resolve(process.env.CMS_TEST_MEDIA_ROOT ?? '')
const projectRoot = resolve(process.cwd())
if (!username || !password) throw new Error('CMS_TEST_USERNAME and CMS_TEST_PASSWORD are required')
if (!databasePath.startsWith(`${projectRoot}${sep}.tmp${sep}production-e2e-media-`) || !mediaRoot.startsWith(`${projectRoot}${sep}.tmp${sep}production-e2e-media-`)) {
  throw new Error('Media runtime tests require an isolated .tmp/production-e2e-media-* database and media root')
}

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
function cookieHeader() { return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') }
function csrfToken() { return [...cookies].find(([name]) => name.toLowerCase().includes('csrf'))?.[1] ?? '' }

async function request(path, { method = 'GET', body, rawBody, contentType, omitCsrf = false, authenticated = true } = {}) {
  const headers = new Headers({ accept: 'application/json', 'user-agent': 'Academic-CMS-Media-Test/1.0' })
  if (authenticated && cookies.size) headers.set('cookie', cookieHeader())
  if (!['GET', 'HEAD'].includes(method)) {
    headers.set('origin', requestOrigin)
    headers.set('sec-fetch-site', 'same-origin')
    headers.set('content-type', contentType ?? (rawBody === undefined ? 'application/json' : 'application/octet-stream'))
    if (!omitCsrf && authenticated) headers.set('x-csrf-token', csrfToken())
  }
  const payload = rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body)
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: payload })
  if (authenticated) absorbCookies(response)
  const text = await response.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* Non-JSON is validated by status or requestBytes. */ }
  return { status: response.status, text, json, headers: response.headers }
}

async function requestBytes(url, { range, authenticated = true } = {}) {
  const headers = new Headers({ 'user-agent': 'Academic-CMS-Media-Test/1.0' })
  if (authenticated && cookies.size) headers.set('cookie', cookieHeader())
  if (range) headers.set('range', range)
  const response = await fetch(url.startsWith('http') ? url : `${baseUrl}${url}`, { headers })
  return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()), headers: response.headers }
}

function expectStatus(result, expected, label) {
  if (!expected.includes(result.status)) {
    const code = result.headers?.get?.('x-admin-error-code')
    throw new Error(`${label}: HTTP ${result.status}${code ? ` [${code}]` : ''} ${String(result.text ?? '').slice(0, 700)}`)
  }
}
function errorPayload(result) { return result.json?.data?.error ?? result.json?.error ?? {} }
async function mediaDetail(uid) {
  const result = await request(`/api/v1/admin/complete/resource/media/${encodeURIComponent(uid)}`)
  expectStatus(result, [200], 'media detail')
  return result.json.record
}
async function upload(name, title, mime, bytes) {
  const result = await request(`/api/v1/admin/complete/media/upload?filename=${encodeURIComponent(name)}&title=${encodeURIComponent(title)}&category=runtime-test`, { method: 'POST', rawBody: bytes, contentType: mime })
  expectStatus(result, [200], `upload ${name}`)
  return result.json.media
}
function localObjectPath(objectKey) {
  const target = resolve(mediaRoot, ...String(objectKey).split('/'))
  if (!target.startsWith(`${mediaRoot}${sep}`)) throw new Error('Object path escaped isolated media root')
  return target
}

const login = await request('/api/v1/auth/login', { method: 'POST', body: { username, password } })
expectStatus(login, [200], 'login')
if (!csrfToken()) throw new Error('The canonical CSRF cookie was not issued')

const page = await request('/admin/media')
expectStatus(page, [200], 'media page')
const trashPage = await request('/admin/media/trash')
expectStatus(trashPage, [200], 'media trash page')
const settingsList = await request('/api/v1/admin/complete/resource/global-settings?page=1&pageSize=20&sort=updated_at&direction=desc')
expectStatus(settingsList, [200], 'global settings policy list')
const settingsUid = settingsList.json?.rows?.[0]?.uid
if (!settingsUid) throw new Error('The upload policy record is missing')
const settingsDetail = await request(`/api/v1/admin/complete/resource/global-settings/${encodeURIComponent(settingsUid)}`)
expectStatus(settingsDetail, [200], 'global settings policy detail')
const enableArchive = await request(`/api/v1/admin/complete/resource/global-settings/${encodeURIComponent(settingsUid)}`, {
  method: 'PATCH',
  body: {
    upload_allowed_extensions: '["jpg","jpeg","png","webp","pdf","zip"]',
    expectedUpdatedAt: settingsDetail.json.record.updated_at,
  },
})
expectStatus(enableArchive, [200], 'enable ZIP in upload policy')
const statsBefore = await request('/api/v1/admin/complete/media/stats')
expectStatus(statsBefore, [200], 'media stats')
if (!statsBefore.json?.policy?.allowedExtensions?.includes('zip')) throw new Error('Updated media upload policy is missing ZIP')

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n')
const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const largePng = new Uint8Array(2_100_000)
largePng.set(png)
const marker = Date.now()
const image = await upload(`runtime-${marker}.png`, `运行验收图片 ${marker}`, 'image/png', png)
const document = await upload(`runtime-${marker}.pdf`, `运行验收 PDF ${marker}`, 'application/pdf', pdf)
const archive = await upload(`runtime-${marker}.zip`, `运行验收 ZIP ${marker}`, 'application/zip', zip)
const largeImage = await upload(`runtime-large-${marker}.png`, `超过默认中间件阈值的图片 ${marker}`, 'image/png', largePng)
for (const item of [image, document, archive, largeImage]) {
  if (item.storageKind !== 'local' || item.status !== 'active') throw new Error('Upload did not use the configured Local store')
  if ((await stat(localObjectPath(item.objectKey))).size !== item.size) throw new Error('Uploaded object is not in the configured media root')
}

const oversized = new Uint8Array((20 * 1024 * 1024) + 1)
oversized.set(png)
const oversizedUpload = await request(`/api/v1/admin/complete/media/upload?filename=oversized-${marker}.png&title=oversized&category=runtime-test`, { method: 'POST', rawBody: oversized, contentType: 'image/png' })
expectStatus(oversizedUpload, [413], 'oversized upload rejection')

const mimeMismatch = await request(`/api/v1/admin/complete/media/upload?filename=wrong.pdf&title=wrong&category=runtime-test`, { method: 'POST', rawBody: png, contentType: 'application/pdf' })
expectStatus(mimeMismatch, [415], 'MIME mismatch')
const unsupportedSvg = await request('/api/v1/admin/complete/media/upload?filename=unsafe.svg&title=unsafe&category=runtime-test', { method: 'POST', rawBody: new TextEncoder().encode('<svg onload="alert(1)"/>'), contentType: 'image/svg+xml' })
expectStatus(unsupportedSvg, [415], 'SVG rejection')

const filtered = await request('/api/v1/admin/complete/resource/media?page=1&pageSize=20&f_status=active&f_mime_type=image%2F*&f_category=runtime-test')
expectStatus(filtered, [200], 'server-side media filters')
if (!filtered.json?.rows?.some(row => row.uid === image.uid) || filtered.json.rows.some(row => !String(row.mime_type).startsWith('image/'))) throw new Error('Server-side MIME/category filtering failed')
const activeListBeforeTrash = await request('/api/v1/admin/complete/media?page=1&pageSize=100&f_status=trash')
expectStatus(activeListBeforeTrash, [200], 'active media dedicated list')
if (![image.uid, document.uid, archive.uid].every(uid => activeListBeforeTrash.json?.rows?.some(row => row.uid === uid && row.status === 'active'))) throw new Error('Active media endpoint did not force active status')
const trashListBeforeTrash = await request('/api/v1/admin/complete/media/trash?page=1&pageSize=100&f_status=active')
expectStatus(trashListBeforeTrash, [200], 'trash media dedicated list')
if (trashListBeforeTrash.json?.rows?.some(row => [image.uid, document.uid, archive.uid].includes(row.uid))) throw new Error('Active uploads leaked into the trash list')

const scan = await request(`/api/v1/admin/complete/media/scan?uids=${encodeURIComponent([image.uid, document.uid, archive.uid].join(','))}&deep=1`)
expectStatus(scan, [200], 'deep media scan')
if (scan.json?.checks?.some(item => item.exists !== true || item.consistent !== true || item.checksumVerified !== true)) throw new Error('Deep Local storage verification failed')

const previews = await request(`/api/v1/admin/complete/media/previews?uids=${encodeURIComponent([image.uid, document.uid, archive.uid].join(','))}`)
expectStatus(previews, [200], 'authorized previews')
const previewByUid = new Map(previews.json.items.map(item => [item.uid, item.view]))
if ([image.uid, document.uid, archive.uid].some(uid => !previewByUid.get(uid)?.available)) throw new Error('A private preview grant is missing')
const imageUrl = previewByUid.get(image.uid).url
const deliveredImage = await requestBytes(`${baseUrl}${imageUrl}`)
expectStatus(deliveredImage, [200], 'signed image delivery')
if (!Buffer.from(deliveredImage.bytes).equals(Buffer.from(png))) throw new Error('Signed image delivery bytes changed')
const unsigned = await requestBytes(`${baseUrl}/media/${image.objectKey}`)
expectStatus(unsigned, [404], 'unsigned media rejection')
const pdfRange = await requestBytes(`${baseUrl}${previewByUid.get(document.uid).url}`, { range: 'bytes=0-3' })
expectStatus(pdfRange, [206], 'PDF range delivery')
if (new TextDecoder().decode(pdfRange.bytes) !== '%PDF') throw new Error('PDF range response is incorrect')

const imageBeforeEdit = await mediaDetail(image.uid)
const metadata = await request(`/api/v1/admin/complete/media/${encodeURIComponent(image.uid)}/metadata`, { method: 'PATCH', body: { title: `已编辑图片 ${marker}`, category: 'edited-runtime', expectedUpdatedAt: imageBeforeEdit.updated_at } })
expectStatus(metadata, [200], 'media metadata update')
const staleGrant = await requestBytes(`${baseUrl}${imageUrl}`)
expectStatus(staleGrant, [404], 'stale media grant after metadata update')
const csrfRejected = await request(`/api/v1/admin/complete/media/${encodeURIComponent(image.uid)}/metadata`, { method: 'PATCH', body: { title: 'should-not-save', category: 'bad', expectedUpdatedAt: metadata.json.updatedAt }, omitCsrf: true })
expectStatus(csrfRejected, [403], 'media CSRF rejection')

const newsCreate = await request('/api/v1/admin/complete/resource/news', { method: 'POST', body: { title: `媒体引用验收 ${marker}`, slug: `media-runtime-${marker}`, content: '临时正文', content_format: 'plain', visibility: 'hidden' } })
expectStatus(newsCreate, [200], 'create rich media reference owner')
const rich = await request(`/api/v1/admin/complete/news/${encodeURIComponent(newsCreate.json.record.uid)}/rich-text`, { method: 'PATCH', body: { document: { type: 'doc', content: [{ type: 'image', attrs: { objectKey: image.objectKey, alt: '运行验收图片', float: 'none' } }] }, expectedUpdatedAt: newsCreate.json.record.updated_at } })
expectStatus(rich, [200], 'create rich media usage')
const usage = await request(`/api/v1/admin/complete/media/${encodeURIComponent(image.uid)}/usage`)
expectStatus(usage, [200], 'rich media usage lookup')
if (!usage.json?.usages?.some(item => item.field === 'content.rich_media' && item.uid === newsCreate.json.record.uid)) throw new Error('Rich-text media usage was not detected')
if (!usage.json?.usages?.some(item => item.field === 'content.rich_media' && item.adminPath === `/admin/news/editor/${encodeURIComponent(newsCreate.json.record.uid)}`)) throw new Error('Rich-text usage did not include its trusted admin path')
const referencedTrash = await request(`/api/v1/admin/complete/media/${encodeURIComponent(image.uid)}/status`, { method: 'PATCH', body: { status: 'trash', expectedUpdatedAt: (await mediaDetail(image.uid)).updated_at } })
expectStatus(referencedTrash, [409], 'referenced media trash guard')
if (errorPayload(referencedTrash).code !== 'MEDIA_STILL_REFERENCED') throw new Error('Referenced media returned the wrong error')
const deleteNews = await request(`/api/v1/admin/complete/resource/news/${encodeURIComponent(newsCreate.json.record.uid)}?updatedAt=${encodeURIComponent(rich.json.record.updated_at)}`, { method: 'DELETE' })
expectStatus(deleteNews, [200, 204], 'delete rich media owner')

const imageReady = await mediaDetail(image.uid)
const archiveReady = await mediaDetail(archive.uid)
const batchTrash = await request('/api/v1/admin/complete/media/batch-status', { method: 'PATCH', body: { status: 'trash', records: [{ uid: image.uid, expectedUpdatedAt: imageReady.updated_at }, { uid: archive.uid, expectedUpdatedAt: archiveReady.updated_at }] } })
expectStatus(batchTrash, [200], 'batch media trash')
const imageTrashed = await mediaDetail(image.uid)
const archiveTrashed = await mediaDetail(archive.uid)
if (imageTrashed.status !== 'trash' || archiveTrashed.status !== 'trash') throw new Error('Batch trash was not persisted')
const activeListAfterTrash = await request('/api/v1/admin/complete/media?page=1&pageSize=100')
expectStatus(activeListAfterTrash, [200], 'active list after trash')
if (activeListAfterTrash.json?.rows?.some(row => row.uid === image.uid || row.uid === archive.uid)) throw new Error('Trashed media remained visible in the active list')
const trashListAfterTrash = await request('/api/v1/admin/complete/media/trash?page=1&pageSize=100')
expectStatus(trashListAfterTrash, [200], 'trash list after trash')
if (![image.uid, archive.uid].every(uid => trashListAfterTrash.json?.rows?.some(row => row.uid === uid && row.status === 'trash'))) throw new Error('Trashed media was not visible in the dedicated trash list')
const batchRestore = await request('/api/v1/admin/complete/media/batch-status', { method: 'PATCH', body: { status: 'active', records: [{ uid: image.uid, expectedUpdatedAt: imageTrashed.updated_at }, { uid: archive.uid, expectedUpdatedAt: archiveTrashed.updated_at }] } })
expectStatus(batchRestore, [200], 'batch media restore')
const activeListAfterRestore = await request('/api/v1/admin/complete/media?page=1&pageSize=100')
expectStatus(activeListAfterRestore, [200], 'active list after restore')
if (![image.uid, archive.uid].every(uid => activeListAfterRestore.json?.rows?.some(row => row.uid === uid && row.status === 'active'))) throw new Error('Restored media did not return to the active list')

const missing = await upload(`missing-${marker}.png`, `缺失对象验收 ${marker}`, 'image/png', png)
await unlink(localObjectPath(missing.objectKey))
const missingCheck = await request(`/api/v1/admin/complete/media/${encodeURIComponent(missing.uid)}/check?deep=1`)
expectStatus(missingCheck, [200], 'missing object check')
if (missingCheck.json?.exists !== false || missingCheck.json?.consistent !== false) throw new Error('Missing Local object was not detected')
const missingTrash = await request(`/api/v1/admin/complete/media/${encodeURIComponent(missing.uid)}/status`, { method: 'PATCH', body: { status: 'trash', expectedUpdatedAt: (await mediaDetail(missing.uid)).updated_at } })
expectStatus(missingTrash, [200], 'trash missing object record')
const missingRestore = await request(`/api/v1/admin/complete/media/${encodeURIComponent(missing.uid)}/status`, { method: 'PATCH', body: { status: 'active', expectedUpdatedAt: (await mediaDetail(missing.uid)).updated_at } })
expectStatus(missingRestore, [409], 'restore missing object guard')

const inconsistent = await upload(`inconsistent-${marker}.png`, `摘要不一致验收 ${marker}`, 'image/png', png)
const changedBytes = png.slice()
changedBytes[changedBytes.length - 8] ^= 0x01
await writeFile(localObjectPath(inconsistent.objectKey), changedBytes)
const inconsistentCheck = await request(`/api/v1/admin/complete/media/${encodeURIComponent(inconsistent.uid)}/check?deep=1`)
expectStatus(inconsistentCheck, [200], 'inconsistent object check')
if (inconsistentCheck.json?.sizeMatches !== true || inconsistentCheck.json?.checksumMatches !== false || inconsistentCheck.json?.consistent !== false) throw new Error('Same-size checksum mismatch was not detected')
const inconsistentTrash = await request(`/api/v1/admin/complete/media/${encodeURIComponent(inconsistent.uid)}/status`, { method: 'PATCH', body: { status: 'trash', expectedUpdatedAt: (await mediaDetail(inconsistent.uid)).updated_at } })
expectStatus(inconsistentTrash, [200], 'trash inconsistent object record')
const inconsistentRestore = await request(`/api/v1/admin/complete/media/${encodeURIComponent(inconsistent.uid)}/status`, { method: 'PATCH', body: { status: 'active', expectedUpdatedAt: (await mediaDetail(inconsistent.uid)).updated_at } })
expectStatus(inconsistentRestore, [409], 'restore inconsistent object guard')

const pdfCurrent = await mediaDetail(document.uid)
const pdfTrash = await request(`/api/v1/admin/complete/media/${encodeURIComponent(document.uid)}/status`, { method: 'PATCH', body: { status: 'trash', expectedUpdatedAt: pdfCurrent.updated_at } })
expectStatus(pdfTrash, [200], 'trash PDF for retention cleanup')
const expiredAt = '2020-01-01T00:00:00.000Z'
const db = new Database(databasePath)
db.pragma('foreign_keys = ON')
db.prepare('UPDATE media_assets SET updated_at = ? WHERE uid = ?').run(expiredAt, document.uid)
db.close()
const cleanup = await request('/api/v1/admin/complete/media/cleanup', { method: 'POST', body: { limit: 25 } })
expectStatus(cleanup, [200], 'expired media cleanup')
if (!cleanup.json?.purged?.includes(document.uid)) throw new Error('Expired unreferenced PDF was not purged')
const removedPdf = await request(`/api/v1/admin/complete/resource/media/${encodeURIComponent(document.uid)}`)
expectStatus(removedPdf, [404], 'purged media catalog row')
try { await stat(localObjectPath(document.objectKey)); throw new Error('Purged media object still exists') } catch (error) { if (error?.code !== 'ENOENT') throw error }

const auditLogs = await request('/api/v1/admin/complete/logs?page=1&pageSize=50&f_module=media')
expectStatus(auditLogs, [200], 'media audit logs')
if ((auditLogs.json?.total ?? 0) < 10) throw new Error('Media audit records are missing')
const statsAfter = await request('/api/v1/admin/complete/media/stats')
expectStatus(statsAfter, [200], 'updated media stats')

process.stdout.write(`${JSON.stringify({
  page: page.status,
  login: login.status,
  uploads: { image: image.status, pdf: document.status, zip: archive.status, aboveTwoMb: largeImage.size },
  validation: { oversized: oversizedUpload.status, mimeMismatch: mimeMismatch.status, svg: unsupportedSvg.status, csrf: csrfRejected.status },
  filtering: filtered.status,
  deepChecks: scan.json.checks.length,
  signedPreview: deliveredImage.status,
  unsignedRejected: unsigned.status,
  pdfRange: pdfRange.status,
  staleGrantRejected: staleGrant.status,
  richUsageCount: usage.json.total,
  referencedTrashGuard: referencedTrash.status,
  batchTrash: batchTrash.json.updated,
  batchRestore: batchRestore.json.updated,
  missingDetected: missingCheck.json.exists === false,
  missingRestoreGuard: missingRestore.status,
  checksumMismatchDetected: inconsistentCheck.json.checksumMatches === false,
  inconsistentRestoreGuard: inconsistentRestore.status,
  cleanupPurged: cleanup.json.purged.length,
  auditRows: auditLogs.json.total,
  mediaTotalAfter: statsAfter.json.totals.total,
}, null, 2)}\n`)
