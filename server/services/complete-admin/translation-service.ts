import type { H3Event } from 'h3'
import { resolveTranslationConfig, planTranslationBatches, translationFailureMessage } from '../../../shared/admin/translation'
import { createTranslationClient } from './translation-provider'
export { buildTranslationEnvelope, parseTranslationEnvelope, planTranslationBatches } from '../../../shared/admin/translation'
import { normalizeUid, redactSensitive } from '~~/shared/complete-admin/core.mjs'
import { normalizeAdminSuggestionKey, splitAdminSuggestionValue } from '~~/shared/admin/suggestion-tools'
import { DATABASE_LIMITS } from '../../../db/contracts'
import { canonicalSourceText, translationSourceHash } from '../../i18n/fingerprint'
import { buildSourceRefKey, parseSourceRefKey } from '../../i18n/source-ref'
import type { AdminPrincipal } from '../../utils/complete-admin/auth'
import { resolveAdminDatabase, type SqlAdapter, type SqlOperation } from '../../utils/complete-admin/db'

type SettingsRecord = Record<string, unknown>

interface TranslationField { readonly name: string; readonly manual?: string }
interface TranslationEntity { readonly table: string; readonly fields: readonly TranslationField[]; readonly where: string }
interface SourceMetadata {
  table: string
  uid: string
  field: string
  sourceUpdatedAt: string
  attemptCount: number
  retryAfter: string | null
  leaseToken: string | null
  leaseExpiresAt: string | null
}
interface SourceCandidate extends SourceMetadata { ref: string; text: string; hash: string }
interface TranslationRow {
  [key: string]: unknown
  uid: string
  source_hash: string
  source_ref_key: string
  source_text: string
  translated_text?: string | null
  provider?: string | null
  status: 'pending' | 'success' | 'failed'
  is_manual: number
  is_current: number
  source_refs: string
  error_message?: string | null
  updated_at: string
}
type ClaimedTranslationRow = TranslationRow & { metadata: SourceMetadata; leaseUpdatedAt: string }

// Provider request builders intentionally cap one item at 20,000 characters.
const MAX_SOURCE_TEXT = 20_000
const MAX_ATTEMPTS = 3
const LEASE_MILLISECONDS = 2 * 60 * 1000
const PUBLIC_TRANSLATION_TAG = 'public:translations'

const fields = (...values: Array<string | readonly [string, string]>): readonly TranslationField[] => values.map(value => (
  typeof value === 'string' ? { name: value } : { name: value[0], manual: value[1] }
))

// Keep this registry aligned with every PublicTranslationPlan.add() call.
const FIELD_REGISTRY: readonly TranslationEntity[] = Object.freeze([
  { table: 'site_settings', fields: fields(['site_name', 'site_name_en'], 'hero_title', 'hero_subtitle', 'seo_title', 'seo_description', 'seo_keywords', 'footer_text'), where: 'is_active = 1' },
  { table: 'navigation_items', fields: fields(['title', 'title_en']), where: `visibility = 'public' AND enabled = 1 AND location IN ('header','hero','footer')` },
  { table: 'profiles', fields: fields(['name', 'name_en'], 'role', 'title', 'organization', 'lab', ['bio', 'bio_en'], 'education', 'experience', 'recruiting', 'office'), where: `visibility = 'public' AND is_active = 1` },
  { table: 'research_interests', fields: fields(['name', 'name_en'], 'description'), where: `visibility = 'public'` },
  { table: 'publications', fields: fields('title', 'authors', 'venue', 'publication_type', 'author_role', 'corresponding_authors', 'index_type', 'display_tags', 'abstract', 'keywords'), where: `visibility = 'public'` },
  { table: 'projects', fields: fields('name', 'source', 'fund_name', 'project_role', 'principal', 'members', 'status', 'summary'), where: `visibility = 'public'` },
  { table: 'patents', fields: fields('name', 'country', 'patent_type', 'inventors', 'owner', 'legal_status', 'summary'), where: `visibility = 'public'` },
  { table: 'students', fields: fields(['name', 'name_en'], 'degree', 'grade', 'direction', 'status', 'destination', 'awards', 'bio'), where: `visibility = 'public'` },
  { table: 'student_category_displays', fields: fields(['label', 'label_en']), where: 'enabled = 1' },
  { table: 'news', fields: fields('title', 'category', 'content'), where: `visibility = 'public'` },
  { table: 'courses', fields: fields('name', 'semester', 'audience', 'summary', 'references_text'), where: `visibility = 'public'` },
])

const ENTITY_BY_TABLE = new Map(FIELD_REGISTRY.map(item => [item.table, item]))
const SUGGESTION_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  profiles: ['role', 'title', 'organization', 'lab'],
  publications: ['venue', 'year', 'authors', 'publication_type', 'author_role', 'corresponding_authors', 'index_type', 'display_tags', 'keywords'],
  projects: ['source', 'fund_name', 'project_role', 'principal', 'members', 'status'],
  patents: ['country', 'patent_type', 'inventors', 'owner', 'legal_status'],
  students: ['degree', 'category', 'grade', 'direction', 'status'],
  student_category_displays: ['keywords'],
  news: ['category'], courses: ['semester', 'audience'], media_assets: ['category'],
})
const MULTI_VALUE_SUGGESTION_FIELDS = new Set([
  'publications.authors', 'publications.publication_type', 'publications.author_role',
  'publications.corresponding_authors', 'publications.index_type', 'publications.display_tags', 'publications.keywords',
  'projects.project_role', 'projects.members', 'patents.inventors', 'patents.owner',
  'students.category', 'students.direction', 'student_category_displays.keywords',
  'news.category', 'courses.audience', 'media_assets.category',
])

interface ScanCursor { entity: number; row: number; field: number; reconcile: number }
function scanCursor(value: unknown): ScanCursor {
  if (value === undefined || value === null) return { entity: 0, row: 0, field: 0, reconcile: 0 }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SCAN_CURSOR')
  const cursor = value as Record<string, unknown>
  if (Object.keys(cursor).some(key => !['entity', 'row', 'field', 'reconcile'].includes(key)) || !['entity', 'row', 'field', 'reconcile'].every(key => Number.isSafeInteger(cursor[key]) && Number(cursor[key]) >= 0) || Number(cursor.entity) > FIELD_REGISTRY.length || Number(cursor.field) > 30) throw new Error('INVALID_SCAN_CURSOR')
  return { entity: Number(cursor.entity), row: Number(cursor.row), field: Number(cursor.field), reconcile: Number(cursor.reconcile) }
}
const metadataSql = (field: string) => `CASE WHEN json_valid(source_refs) THEN json_extract(source_refs, '$[0].${field}') END`
const attemptSql = `COALESCE(${metadataSql('attemptCount')}, 0)`
const dueSql = `MAX(COALESCE(${metadataSql('retryAfter')}, ''), COALESCE(${metadataSql('leaseExpiresAt')}, ''))`
async function queueContinuation(db: SqlAdapter): Promise<{ remaining: number; nextRunAt: string | null }> {
  const row = await db.first<{ remaining: number; nextRunAt: string | null }>(`SELECT COUNT(*) AS remaining, MIN(${dueSql}) AS nextRunAt FROM translation_cache WHERE target_lang = 'en' AND is_current = 1 AND is_manual = 0 AND status IN ('pending','failed') AND ${attemptSql} < ${MAX_ATTEMPTS}`)
  const next = row?.nextRunAt
  return { remaining: Number(row?.remaining ?? 0), nextRunAt: next && Date.parse(next) > Date.now() ? next : null }
}

function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(value)) throw new Error('UNSAFE_IDENTIFIER')
  return `"${value}"`
}
function nowAfter(previous?: string | null): string {
  const now = Date.now()
  const prior = previous ? Date.parse(previous) : 0
  return new Date(Math.max(now, Number.isFinite(prior) ? prior + 1 : now)).toISOString()
}
function audit(principal: AdminPrincipal, action: string, targetUid: string | null, summary: string, detail: unknown, now: string): SqlOperation {
  return { sql: `INSERT INTO operation_logs (uid, actor_uid, actor_name, action, module, target_uid, summary, detail_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'translation', ?, ?, ?, 'success', ?, ?)`, params: [`log:${crypto.randomUUID()}`, principal.userUid, principal.displayName || principal.username, action, targetUid, summary, JSON.stringify(redactSensitive(detail)), now, now], expectChanges: 1 }
}
function invalidateTranslationCache(now: string): SqlOperation {
  return { sql: `INSERT INTO cache_generations (tag, generation, updated_at) VALUES (?, 1, ?) ON CONFLICT(tag) DO UPDATE SET generation = cache_generations.generation + 1, updated_at = excluded.updated_at`, params: [PUBLIC_TRANSLATION_TAG, now], expectChanges: { min: 1 } }
}
function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = canonicalSourceText(value)
  return text.trim() && text.length <= MAX_SOURCE_TEXT ? text : null
}
function emptyMetadata(table: string, uid: string, field: string, sourceUpdatedAt: string): SourceMetadata {
  return { table, uid, field, sourceUpdatedAt, attemptCount: 0, retryAfter: null, leaseToken: null, leaseExpiresAt: null }
}
function candidateMetadata(value: SourceCandidate): SourceMetadata {
  return { table: value.table, uid: value.uid, field: value.field, sourceUpdatedAt: value.sourceUpdatedAt, attemptCount: value.attemptCount, retryAfter: value.retryAfter, leaseToken: value.leaseToken, leaseExpiresAt: value.leaseExpiresAt }
}
function parseMetadata(value: unknown, fallbackRef?: string): SourceMetadata | null {
  let parsed: unknown = value
  try { if (typeof parsed === 'string') parsed = JSON.parse(parsed) } catch { return null }
  const item = Array.isArray(parsed) ? parsed[0] : null
  if (!item || typeof item !== 'object') return null
  const raw = item as Record<string, unknown>
  let reference: { entity: string; uid: string; field: string } | null = null
  try { if (fallbackRef) reference = parseSourceRefKey(fallbackRef) } catch { return null }
  const table = String(raw.table ?? reference?.entity ?? '')
  const uid = String(raw.uid ?? reference?.uid ?? '')
  const field = String(raw.field ?? reference?.field ?? '')
  const sourceUpdatedAt = String(raw.sourceUpdatedAt ?? '')
  if (!ENTITY_BY_TABLE.has(table) || !uid || !field || Number.isNaN(Date.parse(sourceUpdatedAt))) return null
  const attemptCount = Number(raw.attemptCount ?? 0)
  return {
    table, uid, field, sourceUpdatedAt: new Date(sourceUpdatedAt).toISOString(),
    attemptCount: Number.isSafeInteger(attemptCount) && attemptCount >= 0 ? Math.min(attemptCount, MAX_ATTEMPTS) : 0,
    retryAfter: typeof raw.retryAfter === 'string' && !Number.isNaN(Date.parse(raw.retryAfter)) ? new Date(raw.retryAfter).toISOString() : null,
    leaseToken: typeof raw.leaseToken === 'string' && raw.leaseToken.length <= 200 ? raw.leaseToken : null,
    leaseExpiresAt: typeof raw.leaseExpiresAt === 'string' && !Number.isNaN(Date.parse(raw.leaseExpiresAt)) ? new Date(raw.leaseExpiresAt).toISOString() : null,
  }
}
function serializeMetadata(value: SourceMetadata | SourceCandidate): string { return JSON.stringify([candidateMetadata(value as SourceCandidate)]) }

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
async function activeSettings(db: SqlAdapter, ensure = false): Promise<SettingsRecord> {
  let settings = await db.first<SettingsRecord>(`SELECT * FROM global_settings ORDER BY updated_at DESC, id DESC LIMIT 1`)
  if (!settings && ensure) {
    // One existing table, one atomic insert: concurrent empty-site requests cannot create two defaults.
    await db.run(`INSERT INTO global_settings (uid, translation_worker_count) SELECT ?, 1 WHERE NOT EXISTS (SELECT 1 FROM global_settings)`, [`global-settings:${crypto.randomUUID()}`])
    settings = await db.first<SettingsRecord>(`SELECT * FROM global_settings ORDER BY updated_at DESC, id DESC LIMIT 1`)
  }
  return settings ?? {}
}
function parseJobState(settings: SettingsRecord): SettingsRecord {
  try {
    const value: unknown = typeof settings.translation_job_state === 'string' ? JSON.parse(settings.translation_job_state) : settings.translation_job_state
    return objectRecord(value) ?? {}
  } catch { return { status: 'invalid' } }
}
async function saveJobState(db: SqlAdapter, settings: SettingsRecord, state: Record<string, unknown>): Promise<void> {
  if (!Number.isSafeInteger(Number(settings.id))) throw new Error('GLOBAL_SETTINGS_NOT_FOUND')
  const result = await db.run(`UPDATE global_settings SET translation_job_state = ? WHERE id = ?`, [JSON.stringify(state), Number(settings.id)])
  if (result.changes !== 1) throw new Error('GLOBAL_SETTINGS_NOT_FOUND')
}
async function queueCounts(db: SqlAdapter): Promise<{ pending: number; success: number; failed: number; manual: number; inactive: number }> {
  const rows = await db.all<{ status: string; is_manual: number; is_current: number; total: number }>(`SELECT status, is_manual, is_current, COUNT(*) AS total FROM translation_cache WHERE target_lang = 'en' GROUP BY status, is_manual, is_current`)
  const output = { pending: 0, success: 0, failed: 0, manual: 0, inactive: 0 }
  for (const row of rows) {
    const count = Number(row.total ?? 0)
    if (row.is_current !== 1) output.inactive += count
    else if (row.is_manual === 1 && row.status === 'success') output.manual += count
    else if (row.status === 'pending') output.pending += count
    else if (row.status === 'success') output.success += count
    else if (row.status === 'failed') output.failed += count
  }
  return output
}
function stateFromCounts(previous: SettingsRecord, provider: string | null, counts: Awaited<ReturnType<typeof queueCounts>>, now: string, status?: string): Record<string, unknown> {
  const active = counts.pending + counts.success + counts.failed + counts.manual
  return {
    version: 2,
    uid: typeof previous.uid === 'string' ? previous.uid : `translation-job:${crypto.randomUUID()}`,
    status: status ?? (counts.pending ? 'running' : counts.failed ? 'failed' : active ? 'completed' : 'idle'),
    provider,
    total: active,
    pending: counts.pending,
    completed: counts.success + counts.manual,
    failed: counts.failed,
    manual: counts.manual,
    createdAt: typeof previous.createdAt === 'string' ? previous.createdAt : now,
    updatedAt: now,
    ...(previous.lastError ? { lastError: previous.lastError } : {}),
    ...(previous.pausedAt ? { pausedAt: previous.pausedAt } : {}),
  }
}

async function currentSource(db: SqlAdapter, sourceRefKey: string): Promise<SourceCandidate | null> {
  const reference = parseSourceRefKey(sourceRefKey)
  const entity = ENTITY_BY_TABLE.get(reference.entity)
  const field = entity?.fields.find(item => item.name === reference.field)
  if (!entity || !field) return null
  const selected = ['uid', 'updated_at', field.name, ...(field.manual ? [field.manual] : [])]
  const row = await db.first<Record<string, unknown>>(`SELECT ${selected.map(identifier).join(', ')} FROM ${identifier(entity.table)} WHERE uid = ? AND ${entity.where} LIMIT 1`, [reference.uid])
  if (!row || (field.manual && normalizedText(row[field.manual]))) return null
  const text = normalizedText(row[field.name])
  const sourceUpdatedAt = typeof row.updated_at === 'string' && !Number.isNaN(Date.parse(row.updated_at)) ? new Date(row.updated_at).toISOString() : ''
  if (!text || !sourceUpdatedAt) return null
  return { ref: sourceRefKey, text, hash: await translationSourceHash(text), ...emptyMetadata(entity.table, reference.uid, field.name, sourceUpdatedAt) }
}

async function runWorkers<T>(items: readonly T[], count: number, task: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(Math.max(1, count), items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      if (item) await task(item)
    }
  }))
}

export class CompleteAdminTranslationService {
  constructor(private readonly event: H3Event, private readonly principal: AdminPrincipal) {}

  async overview(): Promise<Record<string, unknown>> {
    const db = await resolveAdminDatabase(this.event)
    const [counts, settings, totals, deduplication] = await Promise.all([
      db.all<{ status: string; is_manual: number; is_current: number; total: number }>(`SELECT status, is_manual, is_current, COUNT(*) AS total FROM translation_cache GROUP BY status, is_manual, is_current ORDER BY is_current DESC, status, is_manual`),
      activeSettings(db), queueCounts(db),
      db.first<{ records: number; uniqueTexts: number }>(`SELECT COUNT(*) AS records, COUNT(DISTINCT source_text) AS uniqueTexts FROM translation_cache WHERE source_lang = 'zh' AND target_lang = 'en' AND status IN ('pending','failed') AND is_current = 1 AND is_manual = 0 AND ${attemptSql} < ${MAX_ATTEMPTS}`),
    ])
    return {
      counts, totals, deduplication,
      ...resolveTranslationConfig(settings),
      maxAttempts: MAX_ATTEMPTS,
      state: parseJobState(settings),
    }
  }

  async testConfiguration(): Promise<Record<string, unknown>> {
    const db = await resolveAdminDatabase(this.event)
    const settings = await activeSettings(db)
    const configuration = resolveTranslationConfig(settings)
    const client = createTranslationClient(settings, configuration)
    const [result] = await client.translate(['这是网站翻译功能的连接测试。'])
    return { configuration, success: !result!.error, provider: result!.provider, translated: result!.translated ?? null,
      code: result!.error?.code ?? null, message: result!.error ? translationFailureMessage(result!.error.code) : '连接成功，已收到英文译文。', providerRequests: client.requestCount }
  }

  async scan(limitValue: unknown = 500, cursorValue?: unknown): Promise<Record<string, unknown>> {
    const limit = Number(limitValue ?? 500)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2000) throw new Error('INVALID_SCAN_LIMIT')
    const db = await resolveAdminDatabase(this.event)
    const settings = await activeSettings(db, true)
    const configuration = resolveTranslationConfig(settings)
    const provider = configuration.provider
    const candidates: SourceCandidate[] = []
    const suppressed = new Set<string>()

    const cursor = scanCursor(cursorValue)
    let visited = 0
    sourceScan: for (; cursor.entity < FIELD_REGISTRY.length; cursor.entity++, cursor.row = 0, cursor.field = 0) {
      const entity = FIELD_REGISTRY[cursor.entity]!
      const selected = [...new Set(['id', 'uid', 'updated_at', ...entity.fields.flatMap(field => [field.name, ...(field.manual ? [field.manual] : [])])])]
      const rows = await db.all<Record<string, unknown>>(`SELECT ${selected.map(identifier).join(', ')} FROM ${identifier(entity.table)} WHERE ${entity.where} AND id >= ? ORDER BY id ASC LIMIT ?`, [cursor.row, limit + 1])
      for (const row of rows) {
        const id = Number(row.id)
        const start = id === cursor.row ? cursor.field : 0
        const uid = String(row.uid ?? '')
        const sourceUpdatedAt = typeof row.updated_at === 'string' && !Number.isNaN(Date.parse(row.updated_at)) ? new Date(row.updated_at).toISOString() : ''
        if (!uid || !sourceUpdatedAt) { cursor.row = id + 1; cursor.field = 0; continue }
        for (let index = start; index < entity.fields.length; index++) {
          if (visited >= limit) { cursor.row = id; cursor.field = index; break sourceScan }
          visited++
          const field = entity.fields[index]!
          const ref = buildSourceRefKey({ entity: entity.table, uid, field: field.name })
          if (field.manual && normalizedText(row[field.manual])) { suppressed.add(ref); continue }
          const text = normalizedText(row[field.name])
          if (text) candidates.push({ ref, text, hash: await translationSourceHash(text), ...emptyMetadata(entity.table, uid, field.name, sourceUpdatedAt) })
        }
        cursor.row = id + 1; cursor.field = 0
      }
    }

    const existing = new Map<string, TranslationRow>()
    for (let index = 0; index < candidates.length; index += 90) {
      const part = candidates.slice(index, index + 90)
      const rows = await db.all<TranslationRow>(`SELECT uid, source_hash, source_ref_key, source_text, translated_text, provider, status, is_manual, is_current, source_refs, error_message, updated_at FROM translation_cache WHERE source_ref_key IN (${part.map(() => '?').join(', ')}) AND target_lang = 'en' ORDER BY source_ref_key ASC, is_current DESC, updated_at DESC, id DESC`, part.map(item => item.ref))
      for (const row of rows) if (!existing.has(row.source_ref_key)) existing.set(row.source_ref_key, row)
    }

    const now = new Date().toISOString()
    let needed = 0
    let refreshed = 0
    let invalidated = 0
    const operations: SqlOperation[] = []
    for (const candidate of candidates) {
      const previous = existing.get(candidate.ref)
      const previousMeta = previous ? parseMetadata(previous.source_refs, previous.source_ref_key) : null
      if (previous && previous.is_current === 1 && previous.source_hash === candidate.hash && previous.source_text === candidate.text) {
        if (previousMeta?.sourceUpdatedAt !== candidate.sourceUpdatedAt) {
          operations.push({ sql: `UPDATE translation_cache SET source_refs = ?, updated_at = ? WHERE uid = ? AND updated_at = ?`, params: [serializeMetadata(candidate), nowAfter(previous.updated_at), previous.uid, previous.updated_at], expectChanges: 1 })
          refreshed++
        }
        continue
      }
      needed++
      if (previous && previous.status !== 'success') {
        operations.push({
          sql: `UPDATE translation_cache SET source_hash = ?, source_text = ?, translated_text = '', provider = ?, status = 'pending', is_manual = 0, is_current = 1, source_refs = ?, error_message = NULL, updated_at = ? WHERE uid = ? AND updated_at = ?`,
          params: [candidate.hash, candidate.text, provider, serializeMetadata(candidate), nowAfter(previous.updated_at), previous.uid, previous.updated_at], expectChanges: 1,
        })
      } else {
        if (previous?.is_current === 1) {
          operations.push({ sql: `UPDATE translation_cache SET is_current = 0, updated_at = ? WHERE source_ref_key = ? AND target_lang = 'en' AND is_current = 1`, params: [nowAfter(previous.updated_at), candidate.ref], expectChanges: { min: 1 } })
          invalidated++
        }
        operations.push({
          sql: `INSERT INTO translation_cache (uid, source_hash, source_ref_key, source_text, source_lang, target_lang, translated_text, provider, status, is_manual, is_current, source_refs, error_message, created_at, updated_at) VALUES (?, ?, ?, ?, 'zh', 'en', '', ?, 'pending', 0, 1, ?, NULL, ?, ?)`,
          params: [`translation:${crypto.randomUUID()}`, candidate.hash, candidate.ref, candidate.text, provider, serializeMetadata(candidate), now, now], expectChanges: 1,
        })
      }
    }

    if (suppressed.size) {
      const refs = [...suppressed]
      for (let index = 0; index < refs.length; index += 80) {
        const part = refs.slice(index, index + 80)
        operations.push({ sql: `UPDATE translation_cache SET is_current = 0, updated_at = ? WHERE target_lang = 'en' AND is_current = 1 AND source_ref_key IN (${part.map(() => '?').join(', ')})`, params: [now, ...part] })
      }
    }

    const currentRows = cursor.entity === FIELD_REGISTRY.length ? await db.all<TranslationRow>(`SELECT id, uid, source_hash, source_ref_key, source_text, status, is_manual, is_current, source_refs, updated_at FROM translation_cache WHERE target_lang = 'en' AND is_current = 1 AND id > ? ORDER BY id ASC LIMIT 2000`, [cursor.reconcile]) : []
    if (currentRows.length) cursor.reconcile = Number(currentRows.at(-1)!.id)
    const nextCursor = cursor.entity < FIELD_REGISTRY.length || currentRows.length === 2000 ? cursor : null
    const candidateMap = new Map(candidates.map(item => [item.ref, item]))
    invalidated += currentRows.filter(row => suppressed.has(row.source_ref_key)).length
    for (const row of currentRows) {
      if (suppressed.has(row.source_ref_key)) continue
      // Candidate mutations above already preserve, refresh, replace, or enqueue
      // these rows. Reconciliation is only for sources omitted because they are
      // no longer public, no longer present, or no longer registered.
      if (candidateMap.has(row.source_ref_key)) continue
      const expected = await currentSource(db, row.source_ref_key).catch(() => null)
      if (expected && expected.hash === row.source_hash && expected.text === row.source_text) continue
      operations.push({ sql: `UPDATE translation_cache SET is_current = 0, error_message = ?, updated_at = ? WHERE uid = ? AND is_current = 1`, params: [expected ? 'SOURCE_CHANGED_RESCAN_REQUIRED' : 'SOURCE_NOT_PUBLIC', nowAfter(row.updated_at), row.uid], expectChanges: { max: 1 } })
      invalidated++
    }

    for (let index = 0; index < operations.length; index += DATABASE_LIMITS.batchStatements) {
      await db.batch(operations.slice(index, index + DATABASE_LIMITS.batchStatements))
    }
    const counts = await queueCounts(db)
    const latest = parseJobState(await activeSettings(db))
    const state = stateFromCounts(latest, provider, counts, now, latest.status === 'paused' ? 'paused' : counts.pending ? 'pending' : counts.failed ? 'failed' : 'completed')
    await saveJobState(db, settings, state)
    await db.batch([audit(this.principal, 'scan', null, '扫描并校准翻译需求', { scanned: candidates.length, needed, refreshed, invalidated, suppressed: suppressed.size }, now), ...(invalidated ? [invalidateTranslationCache(now)] : [])])
    return { scanned: candidates.length, needed, refreshed, invalidated, suppressed: suppressed.size, truncated: nextCursor !== null, nextCursor, visited, state }
  }

  async run(input: unknown = {}): Promise<Record<string, unknown>> {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
    let selectedUids: string[] | null = null
    if (source.uids !== undefined) {
      if (!Array.isArray(source.uids) || source.uids.length < 1 || source.uids.length > 50) throw new Error('INVALID_TRANSLATION_RUN_SELECTION')
      selectedUids = source.uids.map(normalizeUid)
      if (new Set(selectedUids).size !== selectedUids.length) throw new Error('INVALID_TRANSLATION_RUN_SELECTION')
    }
    const db = await resolveAdminDatabase(this.event)
    const settings = await activeSettings(db, true)
    const previousState = parseJobState(settings)
    if (previousState.status === 'paused') throw new Error('TRANSLATION_JOB_PAUSED')
    const configuration = resolveTranslationConfig(settings)
    const provider = configuration.provider
    const configuredBatch = configuration.batchSize
    const batchSize = selectedUids ? selectedUids.length : configuredBatch
    const workerCount = configuration.workerCount
    const now = new Date().toISOString()
    const runnableStatuses = selectedUids ? `('pending','failed','success')` : `('pending','failed')`
    const selectedClause = selectedUids ? ` AND uid IN (${selectedUids.map(() => '?').join(', ')})` : ''
    const available = await db.all<TranslationRow>(`SELECT uid, source_hash, source_ref_key, source_text, status, is_manual, is_current, source_refs, updated_at FROM translation_cache WHERE target_lang = 'en' AND status IN ${runnableStatuses} AND is_manual = 0 AND is_current = 1${selectedClause} AND (status = 'success' OR ${attemptSql} < ${MAX_ATTEMPTS}) AND ${dueSql} <= ? ORDER BY updated_at ASC, id ASC LIMIT ?`, [...(selectedUids ?? []), now, Math.min(200, batchSize * 4)])
    const rows = available.filter(row => {
      const meta = parseMetadata(row.source_refs, row.source_ref_key)
      if (!meta || (row.status !== 'success' && meta.attemptCount >= MAX_ATTEMPTS)) return false
      if (meta.retryAfter && Date.parse(meta.retryAfter) > Date.now()) return false
      return !meta.leaseExpiresAt || Date.parse(meta.leaseExpiresAt) <= Date.now()
    }).slice(0, batchSize)
    // Expand pending duplicates before taking leases: the page/batch boundary must
    // not cause the same text to be sent again on the next automatic request.
    // Explicit selections remain scoped to the selected rows. Successful history
    // and manually reviewed translations are never used as a translation source.
    if (!selectedUids) {
      const seeds = [...new Map(rows.map(row => [row.source_text, row])).values()]
      const seen = new Set(rows.map(row => row.uid))
      for (const seed of seeds) {
        let cursor = 0
        while (true) {
          const duplicates = await db.all<TranslationRow>(`SELECT id, uid, source_hash, source_ref_key, source_text, status, is_manual, is_current, source_refs, updated_at FROM translation_cache WHERE id > ? AND source_lang = 'zh' AND target_lang = 'en' AND source_hash = ? AND source_text = ? AND status IN ('pending','failed') AND is_manual = 0 AND is_current = 1 AND ${attemptSql} < ${MAX_ATTEMPTS} AND ${dueSql} <= ? ORDER BY id LIMIT 100`, [cursor, seed.source_hash, seed.source_text, now])
          if (!duplicates.length) break
          for (const row of duplicates) {
            cursor = Number(row.id)
            if (!seen.has(row.uid)) { rows.push(row); seen.add(row.uid) }
          }
        }
      }
    }
    if (!rows.length) {
      const counts = await queueCounts(db)
      const status = counts.pending ? 'waiting' : counts.failed ? 'failed' : 'completed'
      const state = stateFromCounts(previousState, provider, counts, now, status)
      await saveJobState(db, settings, state)
      return { processed: 0, completed: 0, failed: 0, stale: 0, providerRequests: 0, savedRequests: 0, status, state, continuation: await queueContinuation(db) }
    }

    // A selection containing only protected/manual rows is a no-op, even without a provider.
    if (!provider) throw new Error('TRANSLATION_CONFIGURATION_REQUIRED')
    const claimed: ClaimedTranslationRow[] = []
    const requestLeaseToken = `lease:${crypto.randomUUID()}`
    for (const row of rows) {
      const metadata = parseMetadata(row.source_refs, row.source_ref_key)
      if (!metadata) continue
      const leaseUpdatedAt = nowAfter(row.updated_at)
      const leased = { ...metadata, attemptCount: row.status === 'success' ? 1 : metadata.attemptCount + 1, retryAfter: null, leaseToken: requestLeaseToken, leaseExpiresAt: new Date(Date.now() + LEASE_MILLISECONDS).toISOString() }
      const result = await db.run(`UPDATE translation_cache SET source_refs = ?, updated_at = ? WHERE uid = ? AND updated_at = ? AND is_current = 1 AND is_manual = 0 AND status IN ${runnableStatuses}
        AND NOT EXISTS (SELECT 1 FROM translation_cache AS busy WHERE busy.source_hash = ? AND busy.source_text = ? AND busy.target_lang = 'en' AND busy.is_current = 1 AND busy.is_manual = 0
          AND CASE WHEN json_valid(busy.source_refs) THEN json_extract(busy.source_refs, '$[0].leaseExpiresAt') END > ?
          AND COALESCE(CASE WHEN json_valid(busy.source_refs) THEN json_extract(busy.source_refs, '$[0].leaseToken') END, '') <> ?)`, [serializeMetadata(leased), leaseUpdatedAt, row.uid, row.updated_at, row.source_hash, row.source_text, now, requestLeaseToken])
      if (result.changes === 1) claimed.push({ ...row, metadata: leased, leaseUpdatedAt })
    }

    let completed = 0
    let failed = 0
    let stale = 0
    const client = createTranslationClient(settings, configuration)
    const failures = new Map<string, { provider: string | null; code: string; message: string; count: number }>()
    const ready: ClaimedTranslationRow[] = []
    await runWorkers(claimed, Math.min(workerCount, claimed.length), async row => {
      const liveBefore = await currentSource(db, row.source_ref_key).catch(() => null)
      if (!liveBefore || liveBefore.hash !== row.source_hash || liveBefore.text !== row.source_text || liveBefore.sourceUpdatedAt !== row.metadata.sourceUpdatedAt) {
        await db.run(`UPDATE translation_cache SET is_current = 0, error_message = 'SOURCE_CHANGED_RESCAN_REQUIRED', source_refs = ?, updated_at = ? WHERE uid = ? AND updated_at = ?`, [serializeMetadata({ ...row.metadata, leaseToken: null, leaseExpiresAt: null }), nowAfter(row.leaseUpdatedAt), row.uid, row.leaseUpdatedAt])
        stale++
        return
      }
      ready.push(row)
    })

    const groups = new Map<string, ClaimedTranslationRow[]>()
    for (const row of ready) {
      const group = groups.get(row.source_text) ?? []
      group.push(row); groups.set(row.source_text, group)
    }
    const uniqueTexts = groups.size
    const duplicateTexts = ready.length - uniqueTexts
    const batches = planTranslationBatches([...groups.values()].map(group => group[0]!), configuredBatch)
    await runWorkers(batches, Math.min(workerCount, batches.length), async batch => {
      const outcomes = await client.translate(batch.map(row => row.source_text))
      for (const [index, representative] of batch.entries()) {
        const outcome = outcomes[index]!
        for (const row of groups.get(representative.source_text)!) {
          if (outcome.error) {
            const error = outcome.error
            const retrySeconds = Math.max(error.retryAfterSeconds, Math.min(3600, 60 * (2 ** Math.max(0, row.metadata.attemptCount - 1))))
            const metadata = { ...row.metadata, retryAfter: row.metadata.attemptCount >= MAX_ATTEMPTS ? null : new Date(Date.now() + retrySeconds * 1000).toISOString(), leaseToken: null, leaseExpiresAt: null }
            const result = await db.run(`UPDATE translation_cache SET status = 'failed', error_message = ?, provider = ?, source_refs = ?, updated_at = ? WHERE uid = ? AND updated_at = ? AND is_manual = 0 AND is_current = 1`, [error.code, outcome.provider, serializeMetadata(metadata), nowAfter(row.leaseUpdatedAt), row.uid, row.leaseUpdatedAt])
            if (result.changes === 1) {
              failed++
              const key = `${outcome.provider}:${error.code}`
              const item = failures.get(key) ?? { provider: outcome.provider, code: error.code, message: translationFailureMessage(error.code), count: 0 }
              item.count++; failures.set(key, item)
            } else stale++
            continue
          }
          const liveAfter = await currentSource(db, row.source_ref_key).catch(() => null)
          if (!liveAfter || liveAfter.hash !== row.source_hash || liveAfter.text !== row.source_text || liveAfter.sourceUpdatedAt !== row.metadata.sourceUpdatedAt) {
            await db.run(`UPDATE translation_cache SET is_current = 0, error_message = 'SOURCE_CHANGED_DURING_TRANSLATION', source_refs = ?, updated_at = ? WHERE uid = ? AND updated_at = ?`, [serializeMetadata({ ...row.metadata, leaseToken: null, leaseExpiresAt: null }), nowAfter(row.leaseUpdatedAt), row.uid, row.leaseUpdatedAt])
            stale++
            continue
          }
          const result = await db.run(`UPDATE translation_cache SET translated_text = ?, provider = ?, status = 'success', error_message = NULL, source_refs = ?, updated_at = ? WHERE uid = ? AND source_hash = ? AND source_text = ? AND updated_at = ? AND is_manual = 0 AND is_current = 1`, [outcome.translated, outcome.provider, serializeMetadata({ ...row.metadata, retryAfter: null, leaseToken: null, leaseExpiresAt: null }), nowAfter(row.leaseUpdatedAt), row.uid, row.source_hash, row.source_text, row.leaseUpdatedAt])
          if (result.changes === 1) completed++
          else stale++
        }
      }
    })
    const providerRequests = client.requestCount
    const failureDetails = [...failures.values()]

    const finishedAt = new Date().toISOString()
    const counts = await queueCounts(db)
    const latest = parseJobState(await activeSettings(db))
    const status = latest.status === 'paused' ? 'paused' : counts.pending ? 'running' : counts.failed ? 'failed' : 'completed'
    const state = stateFromCounts({ ...previousState, lastError: failureDetails[0]?.message }, provider, counts, finishedAt, status)
    await saveJobState(db, settings, state)
    await db.batch([
      audit(this.principal, failed ? 'translate_batch_partial' : 'translate_batch', null, failed ? '自动翻译批次部分失败' : '执行自动翻译批次', { provider, selection: selectedUids ? selectedUids.length : null, processed: claimed.length, completed, failed, stale, uniqueTexts, duplicateTexts, providerRequests, savedRequests: Math.max(0, ready.length - providerRequests) }, finishedAt),
      ...((completed || stale) ? [invalidateTranslationCache(finishedAt)] : []),
    ])
    return { processed: claimed.length, completed, failed, stale, uniqueTexts, duplicateTexts, providerRequests, savedRequests: Math.max(0, ready.length - providerRequests), status, state, failures: failureDetails, continuation: await queueContinuation(db) }
  }

  async retry(uidValues: unknown): Promise<Record<string, unknown>> {
    if (!Array.isArray(uidValues) || uidValues.length < 1 || uidValues.length > 100) throw new Error('INVALID_TRANSLATION_RETRY_SELECTION')
    const uids = uidValues.map(normalizeUid)
    if (new Set(uids).size !== uids.length) throw new Error('INVALID_TRANSLATION_RETRY_SELECTION')
    const db = await resolveAdminDatabase(this.event)
    const settings = await activeSettings(db, true)
    const rows = await db.all<TranslationRow>(`SELECT uid, source_hash, source_ref_key, source_text, status, is_manual, is_current, source_refs, updated_at FROM translation_cache WHERE uid IN (${uids.map(() => '?').join(', ')})`, uids)
    let retried = 0
    let stale = 0
    for (const row of rows) {
      if (row.status !== 'failed' || row.is_manual === 1 || row.is_current !== 1) continue
      const live = await currentSource(db, row.source_ref_key).catch(() => null)
      if (!live || live.hash !== row.source_hash || live.text !== row.source_text) {
        await db.run(`UPDATE translation_cache SET is_current = 0, error_message = 'SOURCE_CHANGED_RESCAN_REQUIRED', updated_at = ? WHERE uid = ? AND updated_at = ?`, [nowAfter(row.updated_at), row.uid, row.updated_at])
        stale++
        continue
      }
      const meta = emptyMetadata(live.table, live.uid, live.field, live.sourceUpdatedAt)
      const result = await db.run(`UPDATE translation_cache SET status = 'pending', source_refs = ?, error_message = NULL, updated_at = ? WHERE uid = ? AND updated_at = ? AND status = 'failed' AND is_current = 1`, [serializeMetadata(meta), nowAfter(row.updated_at), row.uid, row.updated_at])
      retried += result.changes
    }
    const now = new Date().toISOString()
    const counts = await queueCounts(db)
    const state = stateFromCounts(parseJobState(settings), resolveTranslationConfig(settings).provider, counts, now, counts.pending ? 'pending' : counts.failed ? 'failed' : 'completed')
    await saveJobState(db, settings, state)
    await db.batch([audit(this.principal, 'retry', null, '重试失败译文', { requested: uids.length, retried, stale }, now), ...(stale ? [invalidateTranslationCache(now)] : [])])
    return { requested: uids.length, retried, stale, state }
  }

  async setPaused(actionValue: unknown): Promise<Record<string, unknown>> {
    const action = String(actionValue ?? '')
    if (action !== 'pause' && action !== 'resume') throw new Error('INVALID_TRANSLATION_TASK_ACTION')
    const db = await resolveAdminDatabase(this.event)
    const settings = await activeSettings(db, true)
    const now = new Date().toISOString()
    const counts = await queueCounts(db)
    const previous = parseJobState(settings)
    const status = action === 'pause' ? 'paused' : counts.pending ? 'pending' : counts.failed ? 'failed' : 'completed'
    const state = stateFromCounts({ ...previous, ...(action === 'pause' ? { pausedAt: now } : { pausedAt: undefined }) }, resolveTranslationConfig(settings).provider, counts, now, status)
    await saveJobState(db, settings, state)
    await db.batch([audit(this.principal, action, null, action === 'pause' ? '暂停翻译任务' : '恢复翻译任务', {}, now)])
    return { state }
  }

  async invalidate(uidValues: unknown): Promise<Record<string, unknown>> {
    if (!Array.isArray(uidValues) || uidValues.length < 1 || uidValues.length > 100) throw new Error('INVALID_TRANSLATION_INVALIDATE_SELECTION')
    const uids = uidValues.map(normalizeUid)
    if (new Set(uids).size !== uids.length) throw new Error('INVALID_TRANSLATION_INVALIDATE_SELECTION')
    const db = await resolveAdminDatabase(this.event)
    const now = new Date().toISOString()
    const result = await db.run(`UPDATE translation_cache SET is_current = 0, error_message = 'MANUALLY_INVALIDATED', updated_at = ? WHERE uid IN (${uids.map(() => '?').join(', ')}) AND is_current = 1`, [now, ...uids])
    await db.batch([audit(this.principal, 'invalidate', null, '人工失效翻译缓存', { requested: uids.length, invalidated: result.changes }, now), ...(result.changes ? [invalidateTranslationCache(now)] : [])])
    return { requested: uids.length, invalidated: result.changes }
  }

  async manual(uidValue: unknown, translatedText: unknown, expectedUpdatedAt: unknown): Promise<Record<string, unknown>> {
    const uid = normalizeUid(uidValue)
    const text = canonicalSourceText(String(translatedText ?? '')).trim()
    if (!text || text.length > 500_000) throw new Error('INVALID_TRANSLATED_TEXT')
    const expected = String(expectedUpdatedAt ?? '').trim()
    if (!expected || Number.isNaN(Date.parse(expected))) throw new Error('EXPECTED_UPDATED_AT_REQUIRED')
    const canonicalExpected = new Date(expected).toISOString()
    const db = await resolveAdminDatabase(this.event)
    const current = await db.first<TranslationRow>(`SELECT uid, source_hash, source_ref_key, source_text, status, is_manual, is_current, source_refs, updated_at FROM translation_cache WHERE uid = ?`, [uid])
    if (!current) throw new Error('RECORD_NOT_FOUND')
    if (current.updated_at !== canonicalExpected) throw new Error('TRANSLATION_EDIT_CONFLICT')
    const metadata = parseMetadata(current.source_refs, current.source_ref_key)
    const live = await currentSource(db, current.source_ref_key).catch(() => null)
    if (!metadata || !live || live.hash !== current.source_hash || live.text !== current.source_text || live.sourceUpdatedAt !== metadata.sourceUpdatedAt || current.is_current !== 1) throw new Error('TRANSLATION_SOURCE_CHANGED')
    const now = nowAfter(current.updated_at)
    await db.batch([
      { sql: `UPDATE translation_cache SET translated_text = ?, provider = 'manual', status = 'success', is_manual = 1, is_current = 1, source_refs = ?, error_message = NULL, updated_at = ? WHERE uid = ? AND updated_at = ? AND source_hash = ? AND source_text = ? AND is_current = 1`, params: [text, serializeMetadata({ ...metadata, retryAfter: null, leaseToken: null, leaseExpiresAt: null }), now, uid, current.updated_at, current.source_hash, current.source_text], expectChanges: 1 },
      audit(this.principal, 'manual_translation', uid, '人工修订译文', { sourceRef: current.source_ref_key }, now), invalidateTranslationCache(now),
    ])
    const row = await db.first<Record<string, unknown>>(`SELECT uid, source_ref_key, source_text, translated_text, source_lang, target_lang, provider, status, is_manual, is_current, source_refs, error_message, updated_at FROM translation_cache WHERE uid = ?`, [uid])
    if (!row) throw new Error('RECORD_NOT_FOUND')
    return row
  }

  async suggestions(module: unknown, fieldValue: unknown, queryValue: unknown): Promise<Record<string, unknown>> {
    const table = String(module ?? '')
    const field = String(fieldValue ?? '')
    if (!SUGGESTION_FIELDS[table]?.includes(field)) throw new Error('SUGGESTION_FIELD_NOT_ALLOWED')
    const query = String(queryValue ?? '').normalize('NFC').trim()
    if (query.length > 100) throw new Error('INVALID_SUGGESTION_QUERY')
    const db = await resolveAdminDatabase(this.event)
    const rows = await db.all<{ value: string }>(`SELECT ${identifier(field)} AS value FROM ${identifier(table)} WHERE ${identifier(field)} IS NOT NULL AND trim(CAST(${identifier(field)} AS TEXT)) <> '' ${query ? `AND CAST(${identifier(field)} AS TEXT) LIKE ? ESCAPE '\\'` : ''} ORDER BY updated_at DESC, id DESC LIMIT 300`, query ? [`%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`] : [])
    const multiple = MULTI_VALUE_SUGGESTION_FIELDS.has(`${table}.${field}`)
    const normalizedQuery = normalizeAdminSuggestionKey(query)
    const values = new Map<string, string>()
    for (const row of rows) {
      for (const token of splitAdminSuggestionValue(row.value, multiple)) {
        const key = normalizeAdminSuggestionKey(token)
        if (normalizedQuery && !key.includes(normalizedQuery)) continue
        if (!values.has(key) || token.length < values.get(key)!.length) values.set(key, token)
        if (values.size >= 50) break
      }
      if (values.size >= 50) break
    }
    return { module: table, field, multiple, values: [...values.values()].slice(0, 50) }
  }
}
