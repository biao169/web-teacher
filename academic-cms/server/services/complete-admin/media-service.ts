import type { H3Event } from 'h3'
import { getHeader, getQuery, readRawBody } from 'h3'
import { getPlatformMediaStores } from '#media-platform'
import { mediaScanStatus, startMediaFullScan } from './media-full-scan'
import { detectImageDimensions, detectMediaSignature, MAX_UPLOAD_BYTES, normalizeObjectKey, normalizeUid, normalizeUploadExtensions, redactSensitive } from '~~/shared/complete-admin/core.mjs'
import type { Row } from '../../../db/models'
import type { AdminPrincipal } from '../../utils/complete-admin/auth'
import { resolveOptionalSession } from '../../utils/auth-runtime'
import { useMediaRuntime } from '../../utils/media-runtime'
import { resolveAdminDatabase, type SqlOperation } from '../../utils/complete-admin/db'

const MAX_IMAGE_EDGE = 8192
const MAX_IMAGE_PIXELS = 40_000_000


interface R2ObjectLike {
  size: number
  etag?: string
  httpEtag?: string
  body?: ReadableStream
  httpMetadata?: { contentType?: string; contentDisposition?: string; cacheControl?: string }
  customMetadata?: Record<string, string>
  arrayBuffer?(): Promise<ArrayBuffer>
}
interface R2BucketLike {
  put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream, options?: Record<string, unknown>): Promise<R2ObjectLike | null>
  head(key: string): Promise<R2ObjectLike | null>
  get(key: string): Promise<R2ObjectLike | null>
  delete(key: string): Promise<void>
}

const MIME_ALIASES: Record<string, string[]> = {
  'image/jpeg': ['image/jpeg', 'image/jpg', 'image/pjpeg'],
  'image/png': ['image/png'], 'image/gif': ['image/gif'], 'image/webp': ['image/webp'],
  'application/pdf': ['application/pdf'], 'application/zip': ['application/zip', 'application/x-zip-compressed']
}
const REFERENCE_FIELDS = Object.freeze([
  { table: 'site_settings', field: 'logo_key', label: '网站设置', title: 'site_name' },
  { table: 'site_settings', field: 'favicon_key', label: '网站设置', title: 'site_name' },
  { table: 'site_settings', field: 'og_image_key', label: '网站设置', title: 'site_name' },
  { table: 'profiles', field: 'avatar_key', label: '教师与团队', title: 'name' },
  { table: 'publications', field: 'pdf_key', label: '论文', title: 'title' },
  { table: 'patents', field: 'certificate_key', label: '专利与软件著作', title: 'name' },
  { table: 'students', field: 'avatar_key', label: '学生', title: 'name' },
  { table: 'news', field: 'cover_key', label: '新闻动态', title: 'title' },
  { table: 'courses', field: 'syllabus_key', label: '课程', title: 'name' },
  { table: 'courses', field: 'material_key', label: '课程', title: 'name' },
  { table: 'messages', field: 'attachment_key', label: '联系留言', title: 'subject' },
] as const)
const MAX_MEDIA_BATCH = 25

function usageAdminPath(table: string, uidValue: unknown, richText = false): string | null {
  let uid: string
  try { uid = normalizeUid(uidValue) } catch { return null }
  const encodedUid = encodeURIComponent(uid)
  if (table === 'site_settings') return `/admin/settings/site?edit=${encodedUid}`
  if (table === 'profiles') return `/admin/profiles/${encodedUid}`
  if (table === 'publications') return `/admin/publications/${encodedUid}`
  if (table === 'patents') return `/admin/patents/${encodedUid}`
  if (table === 'students') return `/admin/students/${encodedUid}`
  if (table === 'courses') return `/admin/courses/${encodedUid}`
  if (table === 'messages') return `/admin/messages/${encodedUid}`
  if (table === 'news') return richText ? `/admin/news/editor/${encodedUid}` : `/admin/news?edit=${encodedUid}`
  return null
}

function r2FromEvent(event: H3Event): R2BucketLike | null {
  const context = event.context as Record<string, any>
  const env = context.cloudflare?.env ?? context.env ?? context.runtime?.env
  for (const name of [process.env.CMS_R2_BINDING, 'MEDIA', 'R2', 'MEDIA_BUCKET'].filter(Boolean) as string[]) {
    const value = env?.[name]
    if (value && typeof value.put === 'function' && typeof value.head === 'function') return value as R2BucketLike
  }
  return null
}

async function localRoot(event: H3Event): Promise<string> {
  const moduleName = 'node:path'
  const path = await import(/* @vite-ignore */ moduleName) as typeof import('node:path')
  const configured = path.resolve(useMediaRuntime(event).config.mediaRoot)
  if (configured === path.parse(configured).root || configured === path.resolve(process.cwd())) throw new Error('INVALID_MEDIA_ROOT')
  return configured
}

async function localPath(event: H3Event, objectKey: string): Promise<string> {
  const moduleName = 'node:path'
  const path = await import(/* @vite-ignore */ moduleName) as typeof import('node:path')
  const root = await localRoot(event)
  const target = path.resolve(root, ...objectKey.split('/'))
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('MEDIA_PATH_OUTSIDE_ROOT')
  return target
}

async function putLocal(event: H3Event, objectKey: string, bytes: Uint8Array): Promise<void> {
  const fsName = 'node:fs/promises'
  const pathName = 'node:path'
  const [fs, path] = await Promise.all([import(/* @vite-ignore */ fsName) as Promise<typeof import('node:fs/promises')>, import(/* @vite-ignore */ pathName) as Promise<typeof import('node:path')>])
  const target = await localPath(event, objectKey)
  await fs.mkdir(path.dirname(target), { recursive: true })
  const temp = `${target}.${crypto.randomUUID()}.upload`
  try {
    await fs.writeFile(temp, bytes, { flag: 'wx' })
    await fs.rename(temp, target)
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

async function deleteLocal(event: H3Event, objectKey: string): Promise<void> {
  const fsName = 'node:fs/promises'
  const fs = await import(/* @vite-ignore */ fsName) as typeof import('node:fs/promises')
  await fs.rm(await localPath(event, objectKey), { force: true })
}

async function digestHex(bytes: Uint8Array): Promise<string> {
  const digestInput = Uint8Array.from(bytes)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput.buffer))
  return [...digest].map(value => value.toString(16).padStart(2, '0')).join('')
}

function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(value)) throw new Error('UNSAFE_IDENTIFIER')
  return `"${value}"`
}

function audit(principal: AdminPrincipal, action: string, targetUid: string, summary: string, detail: unknown, now: string): SqlOperation {
  return { sql: `INSERT INTO operation_logs (uid, actor_uid, actor_name, action, module, target_uid, summary, detail_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'media', ?, ?, ?, 'success', ?, ?)`, params: [`log:${crypto.randomUUID()}`, principal.userUid, principal.displayName || principal.username, action, targetUid, summary, JSON.stringify(redactSensitive(detail)), now, now], expectChanges: 1 }
}


async function moveLocal(event: H3Event, sourceKey: string, targetKey: string): Promise<void> {
  const fsName = 'node:fs/promises'
  const pathName = 'node:path'
  const [fs, path] = await Promise.all([import(/* @vite-ignore */ fsName) as Promise<typeof import('node:fs/promises')>, import(/* @vite-ignore */ pathName) as Promise<typeof import('node:path')>])
  const source = await localPath(event, sourceKey)
  const target = await localPath(event, targetKey)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.rename(source, target)
}
async function moveR2(bucket: R2BucketLike, sourceKey: string, targetKey: string): Promise<void> {
  const object = await bucket.get(sourceKey)
  if (!object) throw new Error('MEDIA_OBJECT_MISSING')
  let body: ArrayBuffer | Uint8Array | ReadableStream
  if (object.body) body = object.body
  else if (object.arrayBuffer) body = await object.arrayBuffer()
  else throw new Error('R2_OBJECT_BODY_UNAVAILABLE')
  await bucket.put(targetKey, body, {
    ...(object.httpMetadata ? { httpMetadata: object.httpMetadata } : {}),
    ...(object.customMetadata ? { customMetadata: object.customMetadata } : {}),
  })
  await bucket.delete(sourceKey)
}
function cacheGeneration(now: string): SqlOperation {
  return { sql: `INSERT INTO cache_generations (tag, generation, updated_at) VALUES ('public:media', 1, ?) ON CONFLICT(tag) DO UPDATE SET generation = cache_generations.generation + 1, updated_at = excluded.updated_at`, params: [now], expectChanges: { min: 1 } }
}

export class CompleteAdminMediaService {
  constructor(private readonly event: H3Event, private readonly principal: AdminPrincipal) {}

  async startFullScan() {
    const db = await resolveAdminDatabase(this.event)
    if (db.kind !== 'sqlite') throw new Error('MEDIA_DISK_SCAN_REQUIRES_NODE')
    const runtime = useMediaRuntime(this.event)
    const task = await startMediaFullScan({
      db, local: getPlatformMediaStores(this.event, runtime.config).local,
      maxObjectBytes: runtime.config.maxObjectBytes,
      inspect: async asset => ({ ...await runtime.service.inspectStorage(asset, { deepChecksum: true }) }),
      actor: { userUid: this.principal.userUid, name: this.principal.displayName || this.principal.username },
    })
    if (task.work) this.event.waitUntil(task.work)
    return { state: task.state }
  }

  async fullScanStatus(uidValues: string[]) {
    if (uidValues.length > 100) throw new Error('INVALID_MEDIA_SCAN')
    const uids = [...new Set(uidValues.map(normalizeUid))]
    const db = await resolveAdminDatabase(this.event)
    const results = uids.length ? await db.all<{ result_json: string }>(
      `SELECT result_json FROM media_inspections WHERE media_uid IN (${uids.map(() => '?').join(',')})`, uids) : []
    return { supported: db.kind === 'sqlite', state: await mediaScanStatus(db), checks: results.map(row => JSON.parse(row.result_json)) }
  }

  async upload(): Promise<Record<string, unknown>> {
    const db = await resolveAdminDatabase(this.event)
    const uploadPolicy = await db.first<{ upload_max_size_mb: number; upload_allowed_extensions: string }>(`SELECT upload_max_size_mb, upload_allowed_extensions FROM global_settings ORDER BY updated_at DESC, id DESC LIMIT 1`)
    const runtimeLimit = useMediaRuntime(this.event).config.maxObjectBytes
    const configuredLimit = Math.max(1, Math.min(200, Number(uploadPolicy?.upload_max_size_mb ?? 20))) * 1024 * 1024
    const effectiveLimit = Math.min(MAX_UPLOAD_BYTES, configuredLimit, runtimeLimit)
    const declaredLength = Number(getHeader(this.event, 'content-length') ?? 0)
    if (declaredLength && (!Number.isSafeInteger(declaredLength) || declaredLength < 1)) throw new Error('INVALID_UPLOAD_SIZE')
    if (declaredLength > effectiveLimit) throw new Error('UPLOAD_POLICY_SIZE_EXCEEDED')
    const raw = await readRawBody(this.event, false)
    if (raw === null || raw === undefined) throw new Error('EMPTY_UPLOAD')
    const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : Uint8Array.from(raw)
    if (bytes.byteLength < 1) throw new Error('INVALID_UPLOAD_SIZE')
    if (bytes.byteLength > effectiveLimit) throw new Error('UPLOAD_POLICY_SIZE_EXCEEDED')
    const signature = detectMediaSignature(bytes.subarray(0, Math.min(bytes.byteLength, 64)))
    if (!signature) throw new Error('UNSUPPORTED_MEDIA_SIGNATURE')
    const configuredExtensions = normalizeUploadExtensions(uploadPolicy?.upload_allowed_extensions ?? '["png","jpg","jpeg","gif","webp","pdf","zip"]')
    if (!configuredExtensions.includes(signature.extension) && !(signature.extension === 'jpg' && configuredExtensions.includes('jpeg'))) throw new Error('UPLOAD_EXTENSION_NOT_ALLOWED')
    if (signature.mime.startsWith('image/')) {
      const dimensions = detectImageDimensions(bytes, signature.mime)
      if (!dimensions || dimensions.width > MAX_IMAGE_EDGE || dimensions.height > MAX_IMAGE_EDGE || dimensions.pixels > MAX_IMAGE_PIXELS) throw new Error('IMAGE_DIMENSIONS_REJECTED')
    }
    const declaredMime = (getHeader(this.event, 'content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (!MIME_ALIASES[signature.mime]?.includes(declaredMime)) throw new Error('MEDIA_TYPE_MISMATCH')
    const query = getQuery(this.event)
    const uid = query.uid === undefined ? normalizeUid(`media:${crypto.randomUUID()}`) : normalizeUid(query.uid)
    const original = String(query.filename ?? '').normalize('NFC').trim()
    const title = String(query.title ?? original).normalize('NFC').trim()
    const category = String(query.category ?? 'upload').normalize('NFC').trim() || 'upload'
    if (!title || title.length > 300 || category.length > 100 || /[\u0000-\u001f\u007f]/u.test(title + category)) throw new Error('INVALID_MEDIA_METADATA')
    const date = new Date()
    const objectKey = normalizeObjectKey(`uploads/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${signature.extension}`)
    const checksum = await digestHex(bytes)
    const r2 = r2FromEvent(this.event)
    const storageKind = r2 ? 'r2' : 'local'
    if (r2) {
      const stored = await r2.put(objectKey, bytes, { httpMetadata: { contentType: signature.mime }, customMetadata: { sha256: checksum } })
      if (!stored || stored.size !== bytes.byteLength) {
        await r2.delete(objectKey).catch(() => undefined)
        throw new Error('MEDIA_STORAGE_VERIFICATION_FAILED')
      }
    }
    else await putLocal(this.event, objectKey, bytes)
    const now = new Date().toISOString()
    try {
      await db.batch([
        { sql: `INSERT INTO media_assets (uid, object_key, title, category, mime_type, size, storage_kind, status, checksum, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`, params: [uid, objectKey, title, category, signature.mime, bytes.byteLength, storageKind, checksum, now, now], expectChanges: 1 },
        audit(this.principal, 'upload', uid, '上传媒体', { objectKey, mime: signature.mime, size: bytes.byteLength }, now),
        cacheGeneration(now)
      ])
    } catch (error) {
      if (r2) await r2.delete(objectKey).catch(() => undefined)
      else await deleteLocal(this.event, objectKey).catch(() => undefined)
      throw error
    }
    return { uid, objectKey, title, category, mimeType: signature.mime, size: bytes.byteLength, storageKind, status: 'active', checksum, updatedAt: now }
  }

  private async media(uidValue: unknown): Promise<Row<'media_assets'>> {
    const uid = normalizeUid(uidValue)
    const db = await resolveAdminDatabase(this.event)
    const media = await db.first<Record<string, unknown>>(`SELECT * FROM media_assets WHERE uid = ? LIMIT 1`, [uid])
    if (!media) throw new Error('RECORD_NOT_FOUND')
    return media as unknown as Row<'media_assets'>
  }

  async stats(): Promise<Record<string, unknown>> {
    const db = await resolveAdminDatabase(this.event)
    const [totals, categories, settings] = await Promise.all([
      db.first<Record<string, number>>(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status = 'trash' THEN 1 ELSE 0 END) AS trash, COALESCE(SUM(size), 0) AS bytes FROM media_assets`),
      db.all<{ value: string | null; label: string; total: number }>(`SELECT NULLIF(TRIM(category), '') AS value, COALESCE(NULLIF(TRIM(category), ''), '未分类') AS label, COUNT(*) AS total FROM media_assets GROUP BY NULLIF(TRIM(category), '') ORDER BY total DESC, label ASC LIMIT 100`),
      db.first<{ upload_max_size_mb: number; upload_allowed_extensions: string; media_trash_retention_days: number }>(`SELECT upload_max_size_mb, upload_allowed_extensions, media_trash_retention_days FROM global_settings ORDER BY updated_at DESC, id DESC LIMIT 1`),
    ])
    const configuredMb = Math.max(1, Math.min(200, Number(settings?.upload_max_size_mb ?? 20)))
    const runtimeMb = Math.max(1, Math.floor(useMediaRuntime(this.event).config.maxObjectBytes / 1024 / 1024))
    return {
      totals: {
        total: Number(totals?.total ?? 0),
        active: Number(totals?.active ?? 0),
        trash: Number(totals?.trash ?? 0),
        bytes: Number(totals?.bytes ?? 0),
      },
      categories,
      policy: {
        configuredMaxMb: configuredMb,
        effectiveMaxMb: Math.min(configuredMb, Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024), runtimeMb),
        allowedExtensions: normalizeUploadExtensions(settings?.upload_allowed_extensions ?? '["png","jpg","jpeg","gif","webp","pdf","zip"]'),
        trashRetentionDays: Math.max(1, Math.min(3650, Number(settings?.media_trash_retention_days ?? 30))),
      },
    }
  }

  async usage(uidValue: unknown): Promise<Record<string, unknown>> {
    const media = await this.media(uidValue)
    const db = await resolveAdminDatabase(this.event)
    const usages: Record<string, unknown>[] = []
    for (const reference of REFERENCE_FIELDS) {
      const rows = await db.all<Record<string, unknown>>(`SELECT uid, ${identifier(reference.title)} AS record_title FROM ${identifier(reference.table)} WHERE ${identifier(reference.field)} = ? ORDER BY id DESC LIMIT 101`, [media.object_key])
      if (rows.length > 100) throw new Error('MEDIA_USAGE_LIMIT_EXCEEDED')
      usages.push(...rows.map(row => ({
        table: reference.table,
        moduleLabel: reference.label,
        field: reference.field,
        uid: row.uid,
        recordTitle: row.record_title ?? null,
        adminPath: usageAdminPath(reference.table, row.uid),
      })))
    }
    const richRows = await db.all<Record<string, unknown>>(`SELECT uid, title AS record_title FROM news WHERE content_format = 'html' AND instr(content, ?) > 0 ORDER BY id DESC LIMIT 101`, [`data-object-key="${media.object_key}"`])
    if (richRows.length > 100) throw new Error('MEDIA_USAGE_LIMIT_EXCEEDED')
    usages.push(...richRows.map(row => ({
      table: 'news',
      moduleLabel: '新闻动态',
      field: 'content.rich_media',
      uid: row.uid,
      recordTitle: row.record_title ?? null,
      adminPath: usageAdminPath('news', row.uid, true),
    })))
    return { uid: media.uid, objectKey: media.object_key, usages, total: usages.length }
  }

  async usageSummary(uidValues: readonly unknown[]): Promise<Record<string, unknown>> {
    if (!Array.isArray(uidValues) || uidValues.length < 1 || uidValues.length > 100) throw new Error('INVALID_MEDIA_USAGE_SUMMARY')
    const uids = uidValues.map(normalizeUid)
    if (new Set(uids).size !== uids.length) throw new Error('INVALID_MEDIA_USAGE_SUMMARY')
    const db = await resolveAdminDatabase(this.event)
    const directUsage = REFERENCE_FIELDS.map(reference => `
      SELECT requested.uid AS uid, COUNT(target.uid) AS total
      FROM requested
      JOIN ${identifier(reference.table)} AS target ON target.${identifier(reference.field)} = requested.object_key
      GROUP BY requested.uid`).join('\nUNION ALL\n')
    const rows = await db.all<{ uid: string; total: number }>(`
      WITH requested AS (
        SELECT uid, object_key FROM media_assets WHERE uid IN (${uids.map(() => '?').join(', ')})
      ), usage_rows AS (
        ${directUsage}
        UNION ALL
        SELECT requested.uid AS uid, COUNT(target.uid) AS total
        FROM requested
        JOIN news AS target ON target.content_format = 'html'
          AND instr(target.content, 'data-object-key="' || requested.object_key || '"') > 0
        GROUP BY requested.uid
      )
      SELECT requested.uid AS uid, COALESCE(SUM(usage_rows.total), 0) AS total
      FROM requested
      LEFT JOIN usage_rows ON usage_rows.uid = requested.uid
      GROUP BY requested.uid
    `, uids)
    const totals = new Map(rows.map(row => [String(row.uid), Number(row.total ?? 0)]))
    return { items: uids.map(uid => ({ uid, total: totals.get(uid) ?? 0 })) }
  }

  async check(uidValue: unknown, deep = false): Promise<Record<string, unknown>> {
    const media = await this.media(uidValue)
    const inspection = await useMediaRuntime(this.event).service.inspectStorage(media, { deepChecksum: deep })
    return { uid: media.uid, ...inspection }
  }

  async scan(uidValues: readonly unknown[], deep = false): Promise<Record<string, unknown>> {
    if (!Array.isArray(uidValues) || uidValues.length < 1 || uidValues.length > 100) throw new Error('INVALID_MEDIA_SCAN')
    const uids = uidValues.map(normalizeUid)
    if (new Set(uids).size !== uids.length) throw new Error('INVALID_MEDIA_SCAN')
    const db = await resolveAdminDatabase(this.event)
    const rows = await db.all<Record<string, unknown>>(`SELECT * FROM media_assets WHERE uid IN (${uids.map(() => '?').join(', ')})`, uids)
    if (rows.length !== uids.length) throw new Error('RECORD_NOT_FOUND')
    const byUid = new Map(rows.map(row => [String(row.uid), row as unknown as Row<'media_assets'>]))
    const checks = []
    for (const uid of uids) checks.push({ uid, ...await useMediaRuntime(this.event).service.inspectStorage(byUid.get(uid)!, { deepChecksum: deep }) })
    return { checks }
  }

  async previews(uidValues: readonly unknown[]): Promise<Record<string, unknown>> {
    if (!Array.isArray(uidValues) || uidValues.length < 1 || uidValues.length > 100) throw new Error('INVALID_MEDIA_PREVIEW')
    const uids = uidValues.map(normalizeUid)
    if (new Set(uids).size !== uids.length) throw new Error('INVALID_MEDIA_PREVIEW')
    const session = await resolveOptionalSession(this.event)
    if (!session || session.principal.userUid !== this.principal.userUid) throw new Error('FORBIDDEN_MEDIA_PREVIEW')
    const db = await resolveAdminDatabase(this.event)
    const rows = await db.all<Record<string, unknown>>(`SELECT * FROM media_assets WHERE uid IN (${uids.map(() => '?').join(', ')})`, uids)
    const byUid = new Map(rows.map(row => [String(row.uid), row as unknown as Row<'media_assets'>]))
    const assets = uids.map(uid => byUid.get(uid)).filter((row): row is Row<'media_assets'> => Boolean(row))
    const views = await useMediaRuntime(this.event).service.project(assets.map(asset => ({
      objectKey: asset.object_key,
      module: 'media_assets' as const,
      recordUid: asset.uid,
      visibility: 'staff' as const,
      purpose: 'generic' as const,
      referenceRevision: asset.updated_at,
      alt: asset.title ?? asset.object_key,
      title: asset.title,
      disposition: asset.mime_type?.startsWith('image/') || asset.mime_type?.startsWith('video/') || asset.mime_type === 'application/pdf' ? 'inline' as const : 'attachment' as const,
      allowDownload: true,
      fallback: 'none' as const,
    })), session.principal)
    return { items: assets.map((asset, index) => ({ uid: asset.uid, view: views[index] })) }
  }

  async previewsByObjectKeys(keyValues: readonly unknown[]): Promise<Record<string, unknown>> {
    if (!Array.isArray(keyValues) || keyValues.length < 1 || keyValues.length > 25) throw new Error('INVALID_MEDIA_PREVIEW')
    const objectKeys = keyValues.map(normalizeObjectKey)
    if (new Set(objectKeys).size !== objectKeys.length) throw new Error('INVALID_MEDIA_PREVIEW')
    const session = await resolveOptionalSession(this.event)
    if (!session || session.principal.userUid !== this.principal.userUid) throw new Error('FORBIDDEN_MEDIA_PREVIEW')
    const db = await resolveAdminDatabase(this.event)
    const rows = await db.all<Record<string, unknown>>(`SELECT * FROM media_assets WHERE status = 'active' AND object_key IN (${objectKeys.map(() => '?').join(', ')})`, objectKeys)
    const byKey = new Map(rows.map(row => [String(row.object_key), row as unknown as Row<'media_assets'>]))
    const assets = objectKeys.map(key => byKey.get(key)).filter((row): row is Row<'media_assets'> => Boolean(row))
    const views = await useMediaRuntime(this.event).service.project(assets.map(asset => ({
      objectKey: asset.object_key,
      module: 'media_assets' as const,
      recordUid: asset.uid,
      visibility: 'staff' as const,
      purpose: 'generic' as const,
      referenceRevision: asset.updated_at,
      alt: asset.title ?? asset.object_key,
      title: asset.title,
      disposition: asset.mime_type?.startsWith('image/') || asset.mime_type?.startsWith('video/') || asset.mime_type === 'application/pdf' ? 'inline' as const : 'attachment' as const,
      allowDownload: true,
      fallback: 'none' as const,
    })), session.principal)
    return { items: assets.map((asset, index) => ({ objectKey: asset.object_key, uid: asset.uid, view: views[index] })) }
  }

  async preview(uidValue: unknown, rangeHeader?: string | null) {
    const media = await this.media(uidValue)
    return await useMediaRuntime(this.event).service.readForAdministration(media, rangeHeader)
  }

  async setStatus(uidValue: unknown, statusValue: unknown, expectedUpdatedAt: unknown): Promise<Record<string, unknown>> {
    const uid = normalizeUid(uidValue)
    const status = String(statusValue)
    if (!['active', 'trash'].includes(status)) throw new Error('INVALID_MEDIA_STATUS')
    const expected = String(expectedUpdatedAt ?? '').trim()
    if (!expected || Number.isNaN(Date.parse(expected))) throw new Error('EXPECTED_UPDATED_AT_REQUIRED')
    const db = await resolveAdminDatabase(this.event)
    const media = await db.first<Record<string, any>>(`SELECT * FROM media_assets WHERE uid = ? LIMIT 1`, [uid])
    if (!media) throw new Error('RECORD_NOT_FOUND')
    if (new Date(String(media.updated_at)).toISOString() !== new Date(expected).toISOString()) throw new Error('SQL_EXPECTED_CHANGES')
    if (media.status === status) return { uid, status, updatedAt: media.updated_at }
    if (status === 'trash' && Number((await this.usage(uid)).total) > 0) throw new Error('MEDIA_STILL_REFERENCED')
    if (status === 'active') {
      const inspection = await useMediaRuntime(this.event).service.inspectStorage(media as Row<'media_assets'>, { deepChecksum: true })
      if (inspection.exists !== true || inspection.consistent !== true) throw new Error('MEDIA_OBJECT_INCONSISTENT')
    }
    const now = new Date(Math.max(Date.now(), Date.parse(String(media.updated_at)) + 1)).toISOString()
    await db.batch([
      { sql: `UPDATE media_assets SET status = ?, updated_at = ? WHERE uid = ? AND updated_at = ?`, params: [status, now, uid, new Date(expected).toISOString()], expectChanges: 1 },
      audit(this.principal, status === 'trash' ? 'trash' : 'restore', uid, status === 'trash' ? '媒体移入回收站' : '恢复媒体', { objectKey: media.object_key }, now),
      cacheGeneration(now)
    ])
    return { uid, status, updatedAt: now }
  }

  async updateMetadata(uidValue: unknown, body: unknown): Promise<Record<string, unknown>> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_MEDIA_METADATA')
    const source = body as Record<string, unknown>
    const allowed = new Set(['title', 'category', 'expectedUpdatedAt'])
    if (Object.keys(source).some(key => !allowed.has(key))) throw new Error('UNKNOWN_FIELD')
    const uid = normalizeUid(uidValue)
    const expected = String(source.expectedUpdatedAt ?? '').trim()
    if (!expected || Number.isNaN(Date.parse(expected))) throw new Error('EXPECTED_UPDATED_AT_REQUIRED')
    const normalize = (value: unknown, maximum: number): string | null => {
      if (value === null || value === undefined || value === '') return null
      const text = String(value).normalize('NFC').trim()
      if (!text || text.length > maximum || /[\u0000-\u001f\u007f]/u.test(text)) throw new Error('INVALID_MEDIA_METADATA')
      return text
    }
    const title = normalize(source.title, 300)
    const category = normalize(source.category, 100)
    const db = await resolveAdminDatabase(this.event)
    const existing = await db.first<Record<string, any>>(`SELECT uid, object_key, updated_at FROM media_assets WHERE uid = ? LIMIT 1`, [uid])
    if (!existing) throw new Error('RECORD_NOT_FOUND')
    const now = new Date(Math.max(Date.now(), Date.parse(String(existing.updated_at)) + 1)).toISOString()
    await db.batch([
      { sql: `UPDATE media_assets SET title = ?, category = ?, updated_at = ? WHERE uid = ? AND updated_at = ?`, params: [title, category, now, uid, new Date(expected).toISOString()], expectChanges: 1 },
      audit(this.principal, 'update', uid, '更新媒体信息', { objectKey: existing.object_key, fields: ['title', 'category'] }, now),
      cacheGeneration(now),
    ])
    return { uid, title, category, updatedAt: now }
  }

  async batchStatus(body: unknown): Promise<{ updated: number }> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_MEDIA_BATCH')
    const source = body as Record<string, unknown>
    const status = String(source.status ?? '')
    if (!['active', 'trash'].includes(status) || !Array.isArray(source.records) || source.records.length < 1 || source.records.length > MAX_MEDIA_BATCH) throw new Error('INVALID_MEDIA_BATCH')
    const records = source.records.map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_MEDIA_BATCH')
      const row = value as Record<string, unknown>
      const uid = normalizeUid(row.uid)
      const expectedUpdatedAt = String(row.expectedUpdatedAt ?? '').trim()
      if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) throw new Error('EXPECTED_UPDATED_AT_REQUIRED')
      return { uid, expectedUpdatedAt: new Date(expectedUpdatedAt).toISOString() }
    })
    if (new Set(records.map(record => record.uid)).size !== records.length) throw new Error('INVALID_MEDIA_BATCH')
    const db = await resolveAdminDatabase(this.event)
    const rows = await db.all<Record<string, any>>(`SELECT * FROM media_assets WHERE uid IN (${records.map(() => '?').join(', ')})`, records.map(record => record.uid))
    if (rows.length !== records.length) throw new Error('RECORD_NOT_FOUND')
    const byUid = new Map(rows.map(row => [String(row.uid), row]))
    for (const record of records) {
      const media = byUid.get(record.uid)
      if (!media || new Date(String(media.updated_at)).toISOString() !== record.expectedUpdatedAt) throw new Error('SQL_EXPECTED_CHANGES')
      if (media.status === status) continue
      if (status === 'trash' && Number((await this.usage(record.uid)).total) > 0) throw new Error('MEDIA_STILL_REFERENCED')
      if (status === 'active') {
        const inspection = await useMediaRuntime(this.event).service.inspectStorage(media as Row<'media_assets'>, { deepChecksum: true })
        if (inspection.exists !== true || inspection.consistent !== true) throw new Error('MEDIA_OBJECT_INCONSISTENT')
      }
    }
    const now = new Date().toISOString()
    const operations: SqlOperation[] = []
    for (const record of records) {
      const current = byUid.get(record.uid)!
      if (current.status === status) continue
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(String(current.updated_at)) + 1)).toISOString()
      operations.push({ sql: `UPDATE media_assets SET status = ?, updated_at = ? WHERE uid = ? AND updated_at = ?`, params: [status, updatedAt, record.uid, record.expectedUpdatedAt], expectChanges: 1 })
    }
    if (!operations.length) return { updated: 0 }
    operations.push(
      audit(this.principal, status === 'trash' ? 'batch_trash' : 'batch_restore', 'media:batch', status === 'trash' ? '批量回收媒体' : '批量恢复媒体', { count: operations.length }, now),
      cacheGeneration(now),
    )
    await db.batch(operations)
    return { updated: records.filter(record => byUid.get(record.uid)!.status !== status).length }
  }

  async purge(uidValue: unknown, expectedUpdatedAt: unknown): Promise<{ purged: true }> {
    const uid = normalizeUid(uidValue)
    const expected = String(expectedUpdatedAt ?? '').trim()
    if (!expected || Number.isNaN(Date.parse(expected))) throw new Error('EXPECTED_UPDATED_AT_REQUIRED')
    const db = await resolveAdminDatabase(this.event)
    const media = await db.first<Record<string, any>>(`SELECT * FROM media_assets WHERE uid = ? LIMIT 1`, [uid])
    if (!media) throw new Error('RECORD_NOT_FOUND')
    if (media.status !== 'trash') throw new Error('MEDIA_NOT_IN_TRASH')
    const settings = await db.first<{ media_trash_retention_days: number }>(`SELECT media_trash_retention_days FROM global_settings ORDER BY updated_at DESC, id DESC LIMIT 1`)
    const days = Math.max(1, Math.min(3650, Number(settings?.media_trash_retention_days ?? 30)))
    if (Date.parse(String(media.updated_at)) > Date.now() - days * 86_400_000) throw new Error('MEDIA_RETENTION_NOT_EXPIRED')
    const usage = await this.usage(uid)
    if (Number(usage.total) > 0) throw new Error('MEDIA_STILL_REFERENCED')
    const key = normalizeObjectKey(media.object_key)
    if (!['local', 'r2'].includes(String(media.storage_kind))) throw new Error('MEDIA_STORAGE_NOT_PURGEABLE')
    const quarantine = normalizeObjectKey(`purge-quarantine/${crypto.randomUUID()}/${key}`)
    const r2 = r2FromEvent(this.event)
    const inspection = await useMediaRuntime(this.event).service.inspectStorage(media as Row<'media_assets'>)
    let moved = false
    if (inspection.exists === true) {
      if (media.storage_kind === 'r2') {
        if (!r2) throw new Error('R2_BINDING_MISSING')
        await moveR2(r2, key, quarantine)
      } else await moveLocal(this.event, key, quarantine)
      moved = true
    }
    const now = new Date().toISOString()
    try {
      await db.batch([
        { sql: `DELETE FROM media_assets WHERE uid = ? AND status = 'trash' AND updated_at = ?`, params: [uid, new Date(expected).toISOString()], expectChanges: 1 },
        audit(this.principal, 'purge', uid, '永久清理媒体', { objectKey: key, storageKind: media.storage_kind, objectMissing: inspection.exists === false }, now),
        cacheGeneration(now)
      ])
    } catch (error) {
      try {
        if (moved && media.storage_kind === 'r2') await moveR2(r2!, quarantine, key)
        else if (moved) await moveLocal(this.event, quarantine, key)
      } catch { /* 留在隔离区，管理员可根据操作日志恢复。 */ }
      throw error
    }
    if (moved && media.storage_kind === 'r2') await r2!.delete(quarantine).catch(() => undefined)
    else if (moved) await deleteLocal(this.event, quarantine).catch(() => undefined)
    return { purged: true }
  }

  async cleanupExpired(limitValue: unknown): Promise<Record<string, unknown>> {
    const limit = Number(limitValue ?? 25)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('INVALID_MEDIA_CLEANUP_LIMIT')
    const db = await resolveAdminDatabase(this.event)
    const settings = await db.first<{ media_trash_retention_days: number }>(`SELECT media_trash_retention_days FROM global_settings ORDER BY updated_at DESC, id DESC LIMIT 1`)
    const days = Math.max(1, Math.min(3650, Number(settings?.media_trash_retention_days ?? 30)))
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
    const rows = await db.all<{ uid: string; updated_at: string }>(`SELECT uid, updated_at FROM media_assets WHERE status = 'trash' AND updated_at <= ? ORDER BY updated_at ASC, id ASC LIMIT ?`, [cutoff, limit])
    const purged: string[] = []
    const skipped: Array<{ uid: string; reason: string }> = []
    for (const row of rows) {
      try {
        await this.purge(row.uid, row.updated_at)
        purged.push(row.uid)
      }
      catch (error) {
        const reason = error instanceof Error ? (error.message.split(':')[0] ?? 'MEDIA_CLEANUP_FAILED') : 'MEDIA_CLEANUP_FAILED'
        skipped.push({ uid: row.uid, reason })
      }
    }
    return { cutoff, retentionDays: days, candidates: rows.length, purged, skipped }
  }

}
