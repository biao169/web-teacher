import type { H3Event } from 'h3'
import { createBackupEnvelope, MAX_BACKUP_BYTES, MAX_EXPORT_ROWS, normalizeObjectKey, parseBackupEnvelope, redactSensitive } from '~~/shared/complete-admin/core.mjs'
import type { AuthModule } from '~~/shared/enums/auth'
import type { Row } from '../../../db/models'
import { cacheTagsForMutation } from '../../cache/invalidation-map'
import type { MediaBackupObject, MediaBackupRestoreResult } from '../media/media-service'
import type { AdminPrincipal } from '../../utils/complete-admin/auth'
import { serializeSafeCsv } from '../../utils/complete-admin/csv'
import { resolveAdminDatabase, type SqlAdapter, type SqlOperation } from '../../utils/complete-admin/db'
import { useMediaRuntime } from '../../utils/media-runtime'

export const TRANSFER_TABLES = Object.freeze([
  'site_settings', 'global_settings', 'navigation_items', 'profiles', 'research_interests', 'publications', 'projects', 'patents',
  'students', 'student_category_displays', 'news', 'courses', 'messages', 'media_assets', 'translation_cache', 'auth_roles', 'auth_users', 'auth_permissions',
] as const)

const CONFIGURATION_TABLES = Object.freeze(['site_settings', 'global_settings', 'navigation_items'] as const)
const CACHE_MODULE_BY_TABLE: Readonly<Record<typeof TRANSFER_TABLES[number], AuthModule>> = Object.freeze({
  site_settings: 'site_settings', global_settings: 'global_settings', navigation_items: 'navigation_items', profiles: 'profiles',
  research_interests: 'research_interests', publications: 'publications', projects: 'projects', patents: 'patents', students: 'students',
  student_category_displays: 'student_category_displays', news: 'news', courses: 'courses', messages: 'messages', media_assets: 'media_assets',
  translation_cache: 'translation_cache', auth_roles: 'auth', auth_users: 'auth', auth_permissions: 'auth',
})

const IMPORT_ORDER = Object.freeze([
  'media_assets', 'auth_roles', 'auth_users', 'auth_permissions', 'profiles', 'research_interests', 'publications', 'projects',
  'patents', 'students', 'student_category_displays', 'site_settings', 'global_settings', 'navigation_items', 'news', 'courses', 'messages', 'translation_cache',
] as const)
const SENSITIVE = new Set(['password_hash', 'token_hash', 'libretranslate_api_key', 'deepl_api_key', 'google_translate_api_key', 'microsoft_translator_key', 'patentsview_api_key', 'epo_ops_client_id', 'epo_ops_client_secret'])
const ONLINE_IMPORT_ROWS = 500
const UPSERT_CHUNK_ROWS = 50
const UPSERT_CHUNK_BYTES = 768 * 1024
const MAX_IMPORT_OPERATIONS = 100
const MAX_MEDIA_BACKUP_OBJECTS = 100
const MAX_MEDIA_BACKUP_BYTES = 24 * 1024 * 1024
const UID_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u
type RestoreMode = 'merge' | 'replace'
type Scalar = string | number | null
type JsonRecord = Record<string, unknown>

interface BackupEnvelope {
  format: string
  version: number
  createdAt: string
  schemaVersion: string
  tables: Record<string, JsonRecord[]>
  mediaObjects?: BackupMediaObject[]
}

interface BackupMediaObject {
  objectKey: string
  storageKind: 'local' | 'r2'
  mimeType: string
  size: number
  checksumSha256: string
  data: string
}

interface EncryptedBackupEnvelope {
  format?: unknown
  version?: unknown
  kdf?: { name?: unknown; iterations?: unknown; salt?: unknown }
  cipher?: { name?: unknown; iv?: unknown; data?: unknown }
}

interface PreparedTable {
  name: string
  keys: string[]
  rows: Record<string, Scalar>[]
}

function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(value)) throw new Error('UNSAFE_IDENTIFIER')
  return `"${value}"`
}
function base64Url(bytes: Uint8Array): string {
  let source = ''
  for (let index = 0; index < bytes.length; index += 0x8000) source += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(source).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}
function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length > MAX_BACKUP_BYTES * 2) throw new Error('INVALID_BACKUP_ENCODING')
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  const source = atob(padded)
  const output = new Uint8Array(source.length)
  for (let index = 0; index < source.length; index += 1) output[index] = source.charCodeAt(index)
  return output
}
function ownedBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy.buffer
}
function modeValue(value: unknown): RestoreMode {
  const mode = String(value ?? 'merge')
  if (mode !== 'merge' && mode !== 'replace') throw new Error('INVALID_IMPORT_MODE')
  return mode
}
async function deriveBackupKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const normalized = passphrase.normalize('NFC')
  if ([...normalized].length < 15 || new TextEncoder().encode(normalized).byteLength > 1024) throw new Error('BACKUP_PASSPHRASE_INVALID')
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalized), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: ownedBuffer(salt), iterations: 600_000 }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
async function encryptBackup(value: unknown, passphrase: string): Promise<Record<string, unknown>> {
  const plain = new TextEncoder().encode(JSON.stringify(value))
  if (plain.byteLength > MAX_BACKUP_BYTES) throw new Error('BACKUP_SIZE_LIMIT')
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveBackupKey(passphrase, salt)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  return { format: 'academic-cms-encrypted-backup', version: 1, kdf: { name: 'PBKDF2-SHA256', iterations: 600_000, salt: base64Url(salt) }, cipher: { name: 'AES-256-GCM', iv: base64Url(iv), data: base64Url(new Uint8Array(cipher)) } }
}
async function decryptBackup(value: unknown, passphrase: string): Promise<unknown> {
  const envelope = value as EncryptedBackupEnvelope
  if (envelope?.format !== 'academic-cms-encrypted-backup' || envelope?.version !== 1 || envelope?.kdf?.name !== 'PBKDF2-SHA256' || envelope?.kdf?.iterations !== 600_000 || envelope?.cipher?.name !== 'AES-256-GCM') throw new Error('INVALID_ENCRYPTED_BACKUP')
  const salt = fromBase64Url(String(envelope.kdf.salt ?? ''))
  const iv = fromBase64Url(String(envelope.cipher.iv ?? ''))
  const cipher = fromBase64Url(String(envelope.cipher.data ?? ''))
  if (salt.byteLength !== 32 || iv.byteLength !== 12 || cipher.byteLength > MAX_BACKUP_BYTES + 32) throw new Error('INVALID_ENCRYPTED_BACKUP')
  try {
    const key = await deriveBackupKey(passphrase, salt)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ownedBuffer(iv) }, key, ownedBuffer(cipher))
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain))
  } catch { throw new Error('BACKUP_DECRYPT_FAILED') }
}
async function digest(value: unknown): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))
  return base64Url(bytes)
}
async function decodeMediaObjects(input: unknown): Promise<BackupMediaObject[]> {
  if (input === undefined) return []
  if (!Array.isArray(input) || input.length > MAX_MEDIA_BACKUP_OBJECTS) throw new Error('INVALID_MEDIA_BACKUP_OBJECTS')
  const output: BackupMediaObject[] = []
  let total = 0
  const keys = new Set<string>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (Object.getPrototypeOf(raw) !== Object.prototype && Object.getPrototypeOf(raw) !== null)) throw new Error('INVALID_MEDIA_BACKUP_OBJECT')
    const source = raw as JsonRecord
    if (Object.keys(source).some(key => !['objectKey', 'storageKind', 'mimeType', 'size', 'checksumSha256', 'data'].includes(key))) throw new Error('INVALID_MEDIA_BACKUP_FIELD')
    const objectKey = normalizeObjectKey(source.objectKey)
    if (keys.has(objectKey)) throw new Error('DUPLICATE_MEDIA_BACKUP_OBJECT')
    const storageKind = String(source.storageKind ?? '')
    const mimeType = String(source.mimeType ?? '').toLowerCase()
    const size = Number(source.size)
    const checksumSha256 = String(source.checksumSha256 ?? '')
    if ((storageKind !== 'local' && storageKind !== 'r2') || !/^[a-z0-9!#$&^_.+*-]+\/[a-z0-9!#$&^_.+*-]+$/u.test(mimeType)
      || !Number.isSafeInteger(size) || size < 1 || size > MAX_MEDIA_BACKUP_BYTES || !/^[0-9a-f]{64}$/u.test(checksumSha256)) throw new Error('INVALID_MEDIA_BACKUP_METADATA')
    const bytes = fromBase64Url(String(source.data ?? ''))
    total += bytes.byteLength
    if (bytes.byteLength !== size || total > MAX_MEDIA_BACKUP_BYTES || await digestHex(bytes) !== checksumSha256) throw new Error('INVALID_MEDIA_BACKUP_PAYLOAD')
    keys.add(objectKey)
    output.push({ objectKey, storageKind, mimeType, size, checksumSha256, data: String(source.data) })
  }
  return output
}
async function digestHex(bytes: Uint8Array): Promise<string> {
  const value = new Uint8Array(await crypto.subtle.digest('SHA-256', ownedBuffer(bytes)))
  return [...value].map(part => part.toString(16).padStart(2, '0')).join('')
}
async function tableColumns(db: SqlAdapter, table: string): Promise<string[]> {
  const rows = await db.all<{ name: string }>(`PRAGMA table_info(${identifier(table)})`)
  return rows.map(row => row.name).filter(name => name !== 'id')
}
async function currentSchemaVersion(db: SqlAdapter): Promise<string> {
  const row = await db.first<{ name: string }>('SELECT name FROM _cms_migrations ORDER BY name DESC LIMIT 1')
  const match = /^(\d{4})_/u.exec(String(row?.name ?? ''))
  if (!match) throw new Error('DATABASE_SCHEMA_VERSION_MISSING')
  return match[1]!
}
function validateSchemaVersion(value: unknown, current: string): string {
  const incoming = String(value ?? '')
  if (!/^\d{4}$/u.test(incoming)) throw new Error('INVALID_BACKUP_SCHEMA_VERSION')
  if (incoming > current) throw new Error('BACKUP_SCHEMA_TOO_NEW')
  return incoming
}
function safeScalar(value: unknown): Scalar {
  if (value === null || typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  throw new Error('INVALID_IMPORT_VALUE')
}
function summarizeEnvelope(envelope: BackupEnvelope): { summary: Record<string, number>; total: number } {
  const summary: Record<string, number> = {}
  let total = 0
  for (const [table, rows] of Object.entries(envelope.tables)) {
    if (!TRANSFER_TABLES.includes(table as typeof TRANSFER_TABLES[number])) throw new Error('IMPORT_TABLE_NOT_ALLOWED')
    if (!Array.isArray(rows)) throw new Error('INVALID_IMPORT_TABLE_ROWS')
    summary[table] = rows.length
    total += rows.length
    if (total > ONLINE_IMPORT_ROWS) throw new Error('ONLINE_IMPORT_ROW_LIMIT')
  }
  if (!Object.keys(summary).length) throw new Error('INVALID_IMPORT_TABLES')
  return { summary, total }
}
async function decodeInput(input: unknown): Promise<BackupEnvelope> {
  const request = input && typeof input === 'object' && !Array.isArray(input) ? input as JsonRecord : {}
  let parsed: unknown
  if (typeof request.content === 'string') {
    if (new TextEncoder().encode(request.content).byteLength > MAX_BACKUP_BYTES * 2) throw new Error('BACKUP_SIZE_LIMIT')
    try { parsed = JSON.parse(request.content) } catch { throw new Error('INVALID_BACKUP_JSON') }
  } else parsed = request.content
  const encrypted = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : null
  const value = encrypted?.format === 'academic-cms-encrypted-backup' ? await decryptBackup(parsed, String(request.passphrase ?? '')) : parsed
  const envelope = parseBackupEnvelope(value) as BackupEnvelope
  const extended = value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
  const mediaObjects = await decodeMediaObjects(extended.mediaObjects)
  return mediaObjects.length ? { ...envelope, mediaObjects } : envelope
}

function mediaRows(envelope: BackupEnvelope): JsonRecord[] { return envelope.tables.media_assets ?? [] }
function validateMediaObjectCatalog(envelope: BackupEnvelope): { managed: number; included: number; missing: number; bytes: number } {
  const rows = mediaRows(envelope)
  const objects = envelope.mediaObjects ?? []
  if (objects.length && !Object.hasOwn(envelope.tables, 'media_assets')) throw new Error('MEDIA_BACKUP_CATALOG_REQUIRED')
  const byKey = new Map(rows.map(row => [String(row.object_key ?? ''), row]))
  for (const object of objects) {
    const row = byKey.get(object.objectKey)
    if (!row || !['local', 'r2'].includes(String(row.storage_kind ?? '')) || String(row.mime_type ?? '').toLowerCase() !== object.mimeType
      || Number(row.size) !== object.size || (row.checksum && String(row.checksum) !== object.checksumSha256)) throw new Error('MEDIA_BACKUP_CATALOG_MISMATCH')
  }
  const managed = rows.filter(row => ['local', 'r2'].includes(String(row.storage_kind ?? ''))).length
  return { managed, included: objects.length, missing: Math.max(0, managed - objects.length), bytes: objects.reduce((sum, item) => sum + item.size, 0) }
}
async function prepareTables(db: SqlAdapter, envelope: BackupEnvelope, now: string): Promise<PreparedTable[]> {
  const source = envelope.tables
  const prepared: PreparedTable[] = []
  for (const name of IMPORT_ORDER) {
    const records = source[name]
    if (!records) continue
    const allowed = await tableColumns(db, name)
    const currentLatest = allowed.includes('updated_at')
      ? await db.first<{ updated_at: string | null }>(`SELECT MAX(updated_at) AS updated_at FROM ${identifier(name)}`)
      : null
    const currentLatestMillis = Date.parse(String(currentLatest?.updated_at ?? ''))
    const activationMillis = Math.max(Date.parse(now), Number.isFinite(currentLatestMillis) ? currentLatestMillis + records.length : 0)
    const recency = records.map((raw, index) => {
      const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? Date.parse(String((raw as JsonRecord).updated_at ?? '')) : Number.NaN
      return { index, value: Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY }
    }).sort((left, right) => left.value - right.value || left.index - right.index)
    const restoredUpdatedAt = new Map(recency.map((item, rank) => [item.index, new Date(activationMillis - records.length + rank + 1).toISOString()]))
    const rows = records.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (Object.getPrototypeOf(raw) !== Object.prototype && Object.getPrototypeOf(raw) !== null)) throw new Error('INVALID_IMPORT_RECORD')
      const input = raw as Record<string, unknown>
      if (Object.hasOwn(input, 'id')) throw new Error('IMPORT_INTERNAL_FIELD')
      const unknown = Object.keys(input).find(key => !allowed.includes(key))
      if (unknown) throw new Error(`IMPORT_UNKNOWN_FIELD:${unknown}`)
      if (!UID_RE.test(String(input.uid ?? ''))) throw new Error('IMPORT_UID_REQUIRED')
      if (name === 'auth_users' && !input.password_hash) throw new Error('IMPORT_PASSWORD_HASH_REQUIRED')
      const row: Record<string, Scalar> = {}
      for (const [key, value] of Object.entries(input)) row[key] = safeScalar(value)
      if (allowed.includes('updated_at')) row.updated_at = restoredUpdatedAt.get(index) ?? now
      if (allowed.includes('created_at') && !row.created_at) row.created_at = now
      return row
    })
    if (!rows.length) { prepared.push({ name, keys: [], rows: [] }); continue }
    const keys = allowed.filter(key => Object.hasOwn(rows[0]!, key))
    const signature = JSON.stringify(keys)
    if (rows.some(row => JSON.stringify(allowed.filter(key => Object.hasOwn(row, key))) !== signature)) throw new Error('IMPORT_FIELD_SHAPE_MISMATCH')
    prepared.push({ name, keys, rows })
  }
  return prepared
}

async function cacheTagsForRestoredTables(tables: ReadonlySet<string>): Promise<string[]> {
  const tags = new Set<string>()
  for (const table of tables) {
    const module = CACHE_MODULE_BY_TABLE[table as typeof TRANSFER_TABLES[number]]
    if (!module) continue
    for (const tag of await cacheTagsForMutation({ module })) tags.add(tag)
  }
  for (const tag of await cacheTagsForMutation({ module: 'import_export' })) tags.add(tag)
  return [...tags].sort()
}
function chunks(rows: Record<string, Scalar>[]): Record<string, Scalar>[][] {
  const output: Record<string, Scalar>[][] = []
  let current: Record<string, Scalar>[] = []
  let bytes = 2
  for (const row of rows) {
    const rowBytes = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1
    if (rowBytes > UPSERT_CHUNK_BYTES) throw new Error('IMPORT_ROW_TOO_LARGE')
    if (current.length && (current.length >= UPSERT_CHUNK_ROWS || bytes + rowBytes > UPSERT_CHUNK_BYTES)) {
      output.push(current); current = []; bytes = 2
    }
    current.push(row); bytes += rowBytes
  }
  if (current.length) output.push(current)
  return output
}
function buildUpsert(table: PreparedTable, mode: RestoreMode): SqlOperation[] {
  if (!table.rows.length) return []
  const columns = table.keys.map(identifier).join(', ')
  const projection = table.keys.map(key => `json_extract(value, '$.${key}')`).join(', ')
  const mutable = table.keys.filter(key => key !== 'uid' && key !== 'created_at')
  if (mode === 'merge' && !mutable.length) throw new Error('IMPORT_RECORD_HAS_NO_MUTABLE_FIELDS')
  const conflict = mode === 'merge' ? ` ON CONFLICT(uid) DO UPDATE SET ${mutable.map(key => `${identifier(key)} = excluded.${identifier(key)}`).join(', ')}` : ''
  return chunks(table.rows).map(part => ({
    sql: `INSERT INTO ${identifier(table.name)} (${columns}) SELECT ${projection} FROM json_each(?) WHERE 1${conflict}`,
    params: [JSON.stringify(part)],
    expectChanges: { min: 1 },
  }))
}
function audit(principal: AdminPrincipal, action: string, summary: string, detail: unknown, now: string): SqlOperation {
  return { sql: "INSERT INTO operation_logs (uid,actor_uid,actor_name,action,module,target_uid,summary,detail_json,status,created_at,updated_at) VALUES (?,?,?,?, 'import_export',NULL,?,?, 'success',?,?)", params: [`log:${crypto.randomUUID()}`, principal.userUid, principal.displayName || principal.username, action, summary, JSON.stringify(redactSensitive(detail)), now, now], expectChanges: 1 }
}

async function rollbackRestoredMedia(event: H3Event, restored: readonly MediaBackupRestoreResult[], originalError: unknown): Promise<never> {
  const failures: unknown[] = []
  for (const item of [...restored].reverse()) {
    try { await useMediaRuntime(event).service.rollbackBackupRestore(item) }
    catch (error) { failures.push(error) }
  }
  if (failures.length) {
    throw new Error('MEDIA_BACKUP_ROLLBACK_FAILED', {
      cause: new AggregateError([originalError, ...failures], 'Media restore failed and one or more newly-created objects could not be rolled back'),
    })
  }
  throw originalError
}

export async function previewAdminBackup(db: SqlAdapter, envelope: BackupEnvelope, mode: RestoreMode): Promise<Record<string, unknown>> {
  const currentVersion = await currentSchemaVersion(db)
  const incomingVersion = validateSchemaVersion(envelope.schemaVersion, currentVersion)
  const { summary: counts, total } = summarizeEnvelope(envelope)
  const prepared = await prepareTables(db, envelope, new Date().toISOString())
  const summary: Array<Record<string, string | number>> = []
  let inserts = 0
  let updates = 0
  let deletes = 0
  for (const table of prepared) {
    const uids = table.rows.map(row => row.uid)
    const existing = uids.length ? Number((await db.first<{ count: number }>(`SELECT COUNT(*) AS count FROM ${identifier(table.name)} WHERE uid IN (SELECT value FROM json_each(?))`, [JSON.stringify(uids)]))?.count ?? 0) : 0
    const current = Number((await db.first<{ count: number }>(`SELECT COUNT(*) AS count FROM ${identifier(table.name)}`))?.count ?? 0)
    const inserted = table.rows.length - existing
    const removed = mode === 'replace' ? Math.max(0, current - existing) : 0
    inserts += inserted; updates += existing; deletes += removed
    summary.push({ name: table.name, rows: table.rows.length, inserts: inserted, updates: existing, deletes: removed })
  }
  const warnings = [
    ...(incomingVersion < currentVersion ? [`备份 Schema ${incomingVersion} 早于当前 ${currentVersion}，将按当前约束验证。`] : []),
    ...(mode === 'replace' ? ['替换模式会删除所选表中未出现在备份内的记录，并可能因外键引用而整体失败。'] : []),
    ...(Object.keys(counts).some(name => name.startsWith('auth_')) ? ['恢复账号或权限数据会撤销全部活动 Session。'] : []),
    ...(Object.hasOwn(counts, 'media_assets') && !(envelope.mediaObjects?.length) ? ['该备份只包含媒体元数据，不包含本地文件或 R2 对象；恢复前需另行同步媒体实体文件。'] : []),
    ...(CONFIGURATION_TABLES.some(name => Object.hasOwn(counts, name)) ? ['配置恢复提交后会立即失效相关运行缓存；当前后台页面需刷新后重新装载配置。'] : []),
  ]
  const media = validateMediaObjectCatalog(envelope)
  if (media.missing > 0 && media.included > 0) warnings.push(`媒体快照缺少 ${media.missing} 个受管理对象；缺失对象的元数据仍可恢复，但文件不会出现。`)
  const configurationTables = CONFIGURATION_TABLES.filter(name => Object.hasOwn(counts, name))
  return { tables:summary, summary: counts, totalRows: total, total, inserts, updates, deletes, mode, warnings, configurationTables, configurationRestored: configurationTables.length > 0, mediaFilesIncluded: media.included > 0, media, schemaVersion: incomingVersion, currentSchemaVersion: currentVersion, format: envelope.format, version: envelope.version, createdAt: envelope.createdAt }
}

export class CompleteAdminTransferService {
  constructor(private readonly event: H3Event, private readonly principal: AdminPrincipal) {}
  private async db(): Promise<SqlAdapter> { return resolveAdminDatabase(this.event) }

  async export(input: unknown): Promise<Record<string, unknown>> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_EXPORT_REQUEST')
    const request = input as JsonRecord
    const format = String(request.format ?? 'backup')
    if (!['backup', 'json', 'csv'].includes(format)) throw new Error('INVALID_EXPORT_FORMAT')
    const requested: string[] = Array.isArray(request.tables) ? request.tables.map((value: unknown) => String(value)) : [...TRANSFER_TABLES]
    const selected: string[] = [...new Set(requested)]
    if (!selected.length || selected.some(table => !TRANSFER_TABLES.includes(table as typeof TRANSFER_TABLES[number]))) throw new Error('INVALID_EXPORT_TABLES')
    if (format === 'csv' && selected.length !== 1) throw new Error('CSV_SINGLE_TABLE_REQUIRED')
    const includeMediaFiles = request.includeMediaFiles === true
    if (includeMediaFiles && (format !== 'backup' || !selected.includes('media_assets'))) throw new Error('MEDIA_BACKUP_REQUIRES_ENCRYPTED_BACKUP')
    const db = await this.db()
    const data: Record<string, Record<string, unknown>[]> = {}
    const exportColumns: Record<string, string[]> = {}
    let total = 0
    for (const table of selected) {
      const allColumns = await tableColumns(db, table)
      const columns = format === 'backup' ? allColumns : allColumns.filter(column => !SENSITIVE.has(column))
      const rows = await db.all<Record<string, unknown>>(`SELECT ${columns.map(identifier).join(', ')} FROM ${identifier(table)} ORDER BY id ASC LIMIT ?`, [MAX_EXPORT_ROWS + 1])
      if (rows.length > MAX_EXPORT_ROWS) throw new Error('EXPORT_ROW_LIMIT')
      total += rows.length
      if (total > MAX_EXPORT_ROWS) throw new Error('EXPORT_ROW_LIMIT')
      data[table] = rows
      exportColumns[table] = columns
    }
    const createdAt = new Date().toISOString()
    const schemaVersion = await currentSchemaVersion(db)
    const stamp = createdAt.replace(/[:.]/gu, '-')
    let result: Record<string, unknown>
    const mediaObjects: BackupMediaObject[] = []
    let mediaBytes = 0
    if (includeMediaFiles) {
      for (const row of data.media_assets ?? []) {
        const object = await useMediaRuntime(this.event).service.readForBackup(row as unknown as Row<'media_assets'>)
        if (!object) continue
        mediaBytes += object.size
        if (mediaObjects.length >= MAX_MEDIA_BACKUP_OBJECTS || mediaBytes > MAX_MEDIA_BACKUP_BYTES) throw new Error('MEDIA_BACKUP_SIZE_LIMIT')
        mediaObjects.push({ objectKey: object.objectKey, storageKind: object.storageKind, mimeType: object.mimeType, size: object.size, checksumSha256: object.checksumSha256, data: base64Url(object.bytes) })
      }
    }
    if (format === 'csv') {
      const table = selected[0]!
      result = { filename: `${table}-${stamp}.csv`, mime: 'text/csv;charset=utf-8', encoding: 'utf8', content: serializeSafeCsv(data[table]!, exportColumns[table]), rows: total }
    } else {
      const baseEnvelope = createBackupEnvelope(data, { schemaVersion, createdAt })
      const envelope = mediaObjects.length ? { ...baseEnvelope, mediaObjects } : baseEnvelope
      if (format === 'json') result = { filename: `academic-cms-export-${stamp}.json`, mime: 'application/json;charset=utf-8', encoding: 'utf8', content: JSON.stringify(envelope, null, 2), rows: total }
      else result = { filename: `academic-cms-backup-${stamp}.acms`, mime: 'application/octet-stream', encoding: 'utf8', content: JSON.stringify(await encryptBackup(envelope, String(request.passphrase ?? ''))), rows: total, mediaFilesIncluded: mediaObjects.length > 0, mediaFiles: mediaObjects.length, mediaBytes }
    }
    const logged = await db.run("INSERT INTO operation_logs (uid,actor_uid,actor_name,action,module,target_uid,summary,detail_json,status,created_at,updated_at) VALUES (?,?,?,?, 'import_export',NULL,?,?, 'success',?,?)", [`log:${crypto.randomUUID()}`, this.principal.userUid, this.principal.displayName || this.principal.username, 'export', `导出网站数据 ${total} 条`, JSON.stringify({ format, tables: selected, rows: total, mediaFiles: mediaObjects.length, mediaBytes }), createdAt, createdAt])
    if (logged.changes !== 1) throw new Error('EXPORT_AUDIT_FAILED')
    return result
  }

  async preview(input: unknown): Promise<Record<string, unknown>> {
    const request = input && typeof input === 'object' && !Array.isArray(input) ? input as JsonRecord : {}
    const mode = modeValue(request.mode)
    const envelope = await decodeInput(input)
    const db = await this.db()
    const summary = await previewAdminBackup(db, envelope, mode)
    return { ...summary, digest: await digest(envelope) }
  }

  async apply(input: unknown): Promise<Record<string, unknown>> {
    const request = input && typeof input === 'object' && !Array.isArray(input) ? input as JsonRecord : {}
    const mode = modeValue(request.mode)
    const expectedConfirmation = mode === 'replace' ? 'REPLACE_ACADEMIC_CMS_DATA' : 'MERGE_ACADEMIC_CMS_DATA'
    if (request.confirmation !== expectedConfirmation) throw new Error('IMPORT_CONFIRMATION_REQUIRED')
    const envelope = await decodeInput(input)
    const actualDigest = await digest(envelope)
    if (String(request.digest ?? '') !== actualDigest) throw new Error('IMPORT_DIGEST_MISMATCH:Backup changed after preview')
    const db = await this.db()
    const currentVersion = await currentSchemaVersion(db)
    validateSchemaVersion(envelope.schemaVersion, currentVersion)
    const { total } = summarizeEnvelope(envelope)
    const now = new Date().toISOString()
    const tables = await prepareTables(db, envelope, now)
    const selected = new Set(tables.map(table => table.name))
    const mediaSummary = validateMediaObjectCatalog(envelope)
    const restoredMedia: MediaBackupRestoreResult[] = []
    const restoredStorageKinds = new Map<string, 'local' | 'r2'>()
    try {
      for (const object of envelope.mediaObjects ?? []) {
        const bytes = fromBase64Url(object.data)
        const restored = await useMediaRuntime(this.event).service.restoreFromBackup({ ...object, bytes } as MediaBackupObject)
        restoredMedia.push(restored)
        restoredStorageKinds.set(object.objectKey, restored.storageKind)
      }
    } catch (error) { return rollbackRestoredMedia(this.event, restoredMedia, error) }
    let restoresAuth: boolean
    let cacheTags: string[]
    let configurationTables: string[]
    let restoresConfiguration: boolean
    try {
      const mediaTable = tables.find(table => table.name === 'media_assets')
      if (mediaTable) for (const row of mediaTable.rows) {
        const storageKind = restoredStorageKinds.get(String(row.object_key ?? ''))
        if (storageKind) row.storage_kind = storageKind
      }
      const operations: SqlOperation[] = []
      if (mode === 'replace') {
        for (const table of [...IMPORT_ORDER].reverse()) if (selected.has(table)) operations.push({ sql: `DELETE FROM ${identifier(table)}` })
      }
      for (const table of tables) operations.push(...buildUpsert(table, mode))
      restoresAuth = [...selected].some(table => table.startsWith('auth_'))
      if (restoresAuth) operations.push({ sql: "UPDATE auth_sessions SET revoked_at=?,revoke_reason='security_policy',updated_at=? WHERE revoked_at IS NULL", params: [now, now] })
      cacheTags = await cacheTagsForRestoredTables(selected)
      configurationTables = CONFIGURATION_TABLES.filter(name => selected.has(name))
      restoresConfiguration = configurationTables.length > 0
      operations.push(
        audit(this.principal, mode === 'replace' ? 'replace' : 'import', mode === 'replace' ? '替换恢复网站数据' : '合并导入网站数据', { tables: [...selected], rows: total, mode, mediaFiles: mediaSummary.included }, now),
        ...cacheTags.map(tag => ({ sql: "INSERT INTO cache_generations (tag,generation,updated_at) VALUES (?,1,?) ON CONFLICT(tag) DO UPDATE SET generation=cache_generations.generation+1,updated_at=excluded.updated_at", params: [tag, now], expectChanges: { min: 1 } } as SqlOperation)),
      )
      if (operations.length > MAX_IMPORT_OPERATIONS) throw new Error('IMPORT_OPERATION_LIMIT')
      await db.batch(operations)
    } catch (error) {
      return rollbackRestoredMedia(this.event, restoredMedia, error)
    }
    return {
      applied: total, tables: tables.length, mode, sessionsRevoked: restoresAuth,
      configurationTables, configurationRestored: restoresConfiguration, requiresReload: restoresConfiguration || restoresAuth,
      invalidatedCacheTags: cacheTags, mediaFilesIncluded: mediaSummary.included > 0, mediaFilesRestored: mediaSummary.included,
      mediaFilesCreated: restoredMedia.filter(item => item.created).length, mediaFilesReused: restoredMedia.filter(item => !item.created).length,
    }
  }
}
