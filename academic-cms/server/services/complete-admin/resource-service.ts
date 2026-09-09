import type { H3Event } from 'h3'
import { getQuery } from 'h3'
import { normalizePublicListHref } from '../../../shared/utils/public-list-link'
import { RESOURCE_CATALOG, getResource, normalizeBatchRequest, normalizeDirection, normalizePage, normalizePageSize, normalizeRecordInput, normalizeSearch, normalizeUid, normalizeUploadExtensions, redactSensitive, renderRichTextDocument, richTextMediaReferences, validateNavigation } from '~~/shared/complete-admin/core.mjs'
import type { AdminPrincipal } from '../../utils/complete-admin/auth'
import { resolveAdminDatabase, type SqlAdapter, type SqlOperation, type SqlValue } from '../../utils/complete-admin/db'

const IDENTIFIER = /^[a-z][a-z0-9_]{0,63}$/u
const INTERNAL_COLUMNS = new Set(['id', 'password_hash'])

interface ResourceFieldDefinition {
  key: string
  type: string
  secret?: boolean
  maxLength?: number
}
interface ResourceDefinition {
  table: string
  label: string
  list: readonly string[]
  fields: readonly ResourceFieldDefinition[]
  defaultSort: readonly [string, string]
  search?: readonly string[]
  invalidate?: readonly string[]
  readOnly?: boolean
  readOnlyCreate?: boolean
}
interface NormalizedRecordInput {
  values: Record<string, unknown>
  secretOperations: Record<string, { action: string; value?: unknown }>
}

function resourceDefinition(resourceKey: string): ResourceDefinition {
  return getResource(resourceKey) as ResourceDefinition
}

function identifier(value: string): string {
  if (!IDENTIFIER.test(value)) throw new Error('UNSAFE_IDENTIFIER')
  return `"${value}"`
}

function nowAfter(previous?: string | null): string {
  const now = Date.now()
  const prior = previous ? Date.parse(previous) : 0
  return new Date(Math.max(now, Number.isFinite(prior) ? prior + 1 : now)).toISOString()
}

function sqlLike(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

function serializeRecord(resource: ResourceDefinition, row: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  const secrets = new Set(resource.fields.filter(field => field.secret).map(field => field.key))
  for (const [key, value] of Object.entries(row)) {
    if (INTERNAL_COLUMNS.has(key)) continue
    if (secrets.has(key)) {
      output[`${key}_configured`] = typeof value === 'string' ? value.trim().length > 0 : value != null
      continue
    }
    if (key === 'detail_json' && typeof value === 'string') {
      try { output[key] = redactSensitive(JSON.parse(value)) } catch { output[key] = null }
      continue
    }
    output[key] = value
  }
  return output
}

function normalizeFilterValue(value: unknown): SqlValue {
  if (value === 'true') return 1
  if (value === 'false') return 0
  if (typeof value === 'string' && value.length <= 500) return value.normalize('NFC').trim()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new Error('INVALID_FILTER')
}

function auditOperation(principal: AdminPrincipal, action: string, module: string, targetUid: string | null, summary: string, detail: unknown, now: string): SqlOperation {
  return {
    sql: `INSERT INTO operation_logs (uid, actor_uid, actor_name, action, module, target_uid, summary, detail_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', ?, ?)`,
    params: [`log:${crypto.randomUUID()}`, principal.userUid, principal.displayName || principal.username, action, module, targetUid, summary.slice(0, 1000), JSON.stringify(redactSensitive(detail)), now, now],
    expectChanges: 1
  }
}

function invalidationOperations(tags: readonly string[] | undefined, now: string): SqlOperation[] {
  return [...new Set(tags ?? [])].slice(0, 20).map(tag => ({
    sql: `INSERT INTO cache_generations (tag, generation, updated_at) VALUES (?, 1, ?) ON CONFLICT(tag) DO UPDATE SET generation = cache_generations.generation + 1, updated_at = excluded.updated_at`,
    params: [tag, now],
    expectChanges: { min: 1 }
  }))
}

async function tableColumns(db: SqlAdapter, table: string): Promise<Set<string>> {
  const rows = await db.all<{ name: string }>(`PRAGMA table_info(${identifier(table)})`)
  return new Set(rows.map(row => String(row.name)))
}

function enumJsonArray(value: unknown, field: string, allowed: readonly string[]): string {
  let parsed: unknown
  try { parsed = typeof value === 'string' ? JSON.parse(value) : value }
  catch { throw new Error(`INVALID_JSON_ARRAY:${field}`) }
  if (!Array.isArray(parsed) || parsed.length > allowed.length || parsed.some(item => typeof item !== 'string' || !allowed.includes(item))) {
    throw new Error(`INVALID_JSON_ARRAY:${field}`)
  }
  return JSON.stringify([...new Set(parsed)])
}

function assertSecureProviderUrl(value: unknown, field: string): void {
  if (value === null || value === undefined || value === '') return
  const parsed = new URL(String(value))
  if (parsed.protocol === 'https:') return
  if (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) return
  throw new Error(`INVALID_PROVIDER_URL:${field}`)
}

function validateGlobalSettings(values: Record<string, unknown>, existing: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...values }
  if (Object.hasOwn(normalized, 'upload_allowed_extensions')) {
    normalized.upload_allowed_extensions = JSON.stringify(normalizeUploadExtensions(normalized.upload_allowed_extensions))
  }
  const providerFields = [
    ['translation_providers', ['libretranslate', 'deepl', 'google', 'microsoft', 'mymemory']],
    ['publication_metadata_providers', ['crossref', 'openalex', 'semantic-scholar', 'datacite', 'europe-pmc', 'pubmed']],
    ['patent_metadata_providers', ['patentsview', 'epo-ops']],
  ] as const
  for (const [field, allowed] of providerFields) {
    if (Object.hasOwn(normalized, field)) normalized[field] = enumJsonArray(normalized[field], field, allowed)
  }
  const merged = { ...existing, ...normalized }
  const selectedPairs = [
    ['translation_provider', 'translation_providers'],
    ['publication_metadata_provider', 'publication_metadata_providers'],
  ] as const
  for (const [selectedField, listField] of selectedPairs) {
    const selected = merged[selectedField]
    const rawList = merged[listField]
    if (!selected || typeof rawList !== 'string') continue
    let list: unknown
    try { list = JSON.parse(rawList) } catch { throw new Error(`INVALID_JSON_ARRAY:${listField}`) }
    if (Array.isArray(list) && list.length > 0 && !list.includes(selected)) throw new Error(`INVALID_PROVIDER_SELECTION:${selectedField}`)
  }
  assertSecureProviderUrl(merged.libretranslate_url, 'libretranslate_url')
  assertSecureProviderUrl(merged.microsoft_translator_endpoint, 'microsoft_translator_endpoint')
  return normalized
}

function validateNewsValues(values: Record<string, unknown>, existing: Record<string, unknown>, allowRichText: boolean): Record<string, unknown> {
  const normalized = { ...values }
  if (typeof normalized.slug === 'string') {
    const slug = normalized.slug.normalize('NFC').trim().toLowerCase()
    normalized.slug = slug
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) throw new Error('INVALID_NEWS_SLUG:slug')
  }
  const merged = { ...existing, ...normalized }
  if (!allowRichText && (normalized.content_format === 'html' || (merged.content_format === 'html' && Object.hasOwn(normalized, 'content')))) {
    throw new Error('INVALID_HTML_CONTENT_SOURCE:content')
  }
  if (existing.content_format === 'html' && normalized.content_format && normalized.content_format !== 'html' && !Object.hasOwn(normalized, 'content')) {
    throw new Error('REQUIRED_CONTENT_CONVERSION:content')
  }
  if (merged.visibility === 'public' && !merged.published_at) throw new Error('REQUIRED_PUBLISHED_AT:published_at')
  return normalized
}

function validateResourceValues(resourceKey: string, values: Record<string, unknown>, existing: Record<string, unknown> = {}, allowRichText = false): Record<string, unknown> {
  if (resourceKey === 'navigation') {
    validateNavigation({ ...existing, ...values })
    const merged = { ...existing, ...values }
    if (['route', 'button'].includes(String(merged.kind)) && typeof merged.path === 'string') {
      try {
        const path = normalizePublicListHref(merged.path)
        if (path.length > 2000) throw new Error('Too long')
        if (path !== merged.path) values = { ...values, path }
      } catch { throw new Error('INVALID_NAVIGATION_PATH:path') }
    }
  }
  if (resourceKey === 'global-settings') return validateGlobalSettings(values, existing)
  if (resourceKey === 'news') return validateNewsValues(values, existing, allowRichText)
  return values
}

async function validateResourceReferences(db: SqlAdapter, resourceKey: string, values: Record<string, unknown>): Promise<void> {
  if (resourceKey !== 'news') return
  if (Object.hasOwn(values, 'cover_key') && values.cover_key !== null) {
    const media = await db.first<{ status: string; mime_type: string }>(`SELECT status, mime_type FROM media_assets WHERE object_key = ? LIMIT 1`, [String(values.cover_key)])
    if (!media || media.status !== 'active' || !media.mime_type.startsWith('image/')) throw new Error('INVALID_MEDIA_REFERENCE:cover_key')
  }
  const relations = [
    ['related_publication_uid', 'publications'],
    ['related_project_uid', 'projects'],
    ['related_student_uid', 'students'],
  ] as const
  for (const [field, table] of relations) {
    if (!Object.hasOwn(values, field) || values[field] === null) continue
    const row = await db.first<{ uid: string }>(`SELECT uid FROM ${identifier(table)} WHERE uid = ? LIMIT 1`, [String(values[field])])
    if (!row) throw new Error(`INVALID_RELATION_REFERENCE:${field}`)
  }
}

async function assertUniqueConstraints(db: SqlAdapter, resourceKey: string, values: Record<string, unknown>, excludingUid?: string): Promise<void> {
  const resource = resourceDefinition(resourceKey)
  const rules: Array<[string, string]> = []
  if (resourceKey === 'news' && typeof values.slug === 'string') rules.push(['slug', values.slug])
  for (const [field, value] of rules) {
    const params: SqlValue[] = [value]
    let sql = `SELECT uid FROM ${identifier(resource.table)} WHERE lower(${identifier(field)}) = lower(?)`
    if (excludingUid) { sql += ' AND uid <> ?'; params.push(excludingUid) }
    if (await db.first(sql, params)) throw new Error(`DUPLICATE_FIELD:${field}`)
  }
}

export class CompleteAdminResourceService {
  constructor(private readonly event: H3Event, private readonly principal: AdminPrincipal) {}

  private async db(): Promise<SqlAdapter> { return resolveAdminDatabase(this.event) }

  schemas(): unknown {
    return Object.values(RESOURCE_CATALOG).map((resource: any) => ({
      ...resource,
      table: undefined,
      permission: undefined,
      fields: resource.fields.map((field: any) => ({ ...field, secret: Boolean(field.secret), maxLength: field.secret ? undefined : field.maxLength }))
    }))
  }

  async list(resourceKey: string, queryOverride?: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const resource = resourceDefinition(resourceKey)
    const db = await this.db()
    const query: Readonly<Record<string, unknown>> = queryOverride ?? getQuery(this.event) ?? {}
    const page = normalizePage(query.page)
    const pageSize = normalizePageSize(query.pageSize)
    const search = normalizeSearch(query.q)
    const requestedSort = String(query.sort ?? resource.defaultSort[0])
    const allowedSort = new Set([...resource.list, ...resource.fields.map(field => field.key), 'created_at', 'updated_at'])
    if (!allowedSort.has(requestedSort)) throw new Error('INVALID_SORT_FIELD')
    const filterFields = [...new Set(resource.list.filter((field: string) => !INTERNAL_COLUMNS.has(field) && field !== 'uid' && field !== 'created_at'))].slice(0, 12)
    const allowedQuery = new Set(['q', 'page', 'pageSize', 'sort', 'direction', ...filterFields.map((field: string) => `f_${field}`)])
    for (const key of Object.keys(query)) if (!allowedQuery.has(key)) throw new Error(`INVALID_QUERY_FIELD:${key}`)
    const direction = normalizeDirection(query.direction ?? resource.defaultSort[1])
    const where: string[] = []
    const params: SqlValue[] = []
    if (search && resource.search?.length) {
      where.push(`(${resource.search.map((field: string) => `CAST(${identifier(field)} AS TEXT) LIKE ? ESCAPE '\\'`).join(' OR ')})`)
      params.push(...resource.search.map(() => sqlLike(search)))
    }
    for (const field of filterFields) {
      const raw = query[`f_${field}`]
      if (raw === undefined || raw === null || raw === '') continue
      if (resourceKey === 'media' && field === 'category' && raw === '__empty__') {
        where.push(`NULLIF(TRIM(${identifier(field)}), '') IS NULL`)
        continue
      }
      if (resourceKey === 'media' && field === 'mime_type') {
        const rules = String(raw).split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
        if (rules.length < 1 || rules.length > 10 || rules.some(value => !/^[a-z0-9][a-z0-9.+-]{0,63}\/(?:\*|[a-z0-9][a-z0-9.+-]{0,63})$/u.test(value))) {
          throw new Error('INVALID_MEDIA_MIME_FILTER')
        }
        const clauses: string[] = []
        for (const rule of [...new Set(rules)]) {
          if (rule.endsWith('/*')) {
            clauses.push('mime_type LIKE ? ESCAPE \'\\\'')
            params.push(`${rule.slice(0, -1)}%`)
          } else {
            clauses.push('mime_type = ?')
            params.push(rule)
          }
        }
        where.push(`(${clauses.join(' OR ')})`)
        continue
      }
      const fieldSchema = resource.fields.find((item: any) => item.key === field)
      const normalized = normalizeFilterValue(raw)
      if (!fieldSchema || ['text', 'textarea', 'url', 'email', 'slug', 'date', 'datetime'].includes(fieldSchema.type)) {
        where.push(`CAST(${identifier(field)} AS TEXT) LIKE ? ESCAPE '\\'`)
        params.push(sqlLike(String(normalized)))
      } else {
        where.push(`${identifier(field)} = ?`)
        params.push(normalized)
      }
    }
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    const selected = [...new Set([...resource.list, 'uid', 'created_at', 'updated_at'])].filter((field: string) => !INTERNAL_COLUMNS.has(field))
    const offset = (page - 1) * pageSize
    const [rows, countRow] = await Promise.all([
      db.all<Record<string, unknown>>(`SELECT ${selected.map(identifier).join(', ')} FROM ${identifier(resource.table)}${whereSql} ORDER BY ${identifier(requestedSort)} ${direction.toUpperCase()}, id ${direction.toUpperCase()} LIMIT ? OFFSET ?`, [...params, pageSize, offset]),
      db.first<{ total: number }>(`SELECT COUNT(*) AS total FROM ${identifier(resource.table)}${whereSql}`, params)
    ])
    const total = Number(countRow?.total ?? 0)
    return { resource: resourceKey, rows: rows.map(row => serializeRecord(resource, row)), page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)), sort: requestedSort, direction }
  }

  async get(resourceKey: string, uidValue: unknown): Promise<Record<string, unknown> | null> {
    const resource = resourceDefinition(resourceKey)
    const uid = normalizeUid(uidValue)
    const db = await this.db()
    const row = await db.first<Record<string, unknown>>(`SELECT * FROM ${identifier(resource.table)} WHERE uid = ? LIMIT 1`, [uid])
    return row ? serializeRecord(resource, row) : null
  }

  async create(resourceKey: string, body: unknown): Promise<Record<string, unknown>> {
    const resource = resourceDefinition(resourceKey)
    if (resource.readOnly || resource.readOnlyCreate) throw new Error('CREATE_NOT_ALLOWED')
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_RECORD_BODY')
    const source = { ...(body as Record<string, unknown>) }
    const uid = source.uid === undefined
      ? normalizeUid(`${resourceKey.replaceAll('_','-')}:${crypto.randomUUID()}`)
      : normalizeUid(source.uid)
    Reflect.deleteProperty(source, 'uid')
    const parsed = normalizeRecordInput(resourceKey, source, 'create') as NormalizedRecordInput
    const validatedValues = validateResourceValues(resourceKey, parsed.values)
    const db = await this.db()
    await assertUniqueConstraints(db, resourceKey, validatedValues)
    await validateResourceReferences(db, resourceKey, validatedValues)
    const columns = await tableColumns(db, resource.table)
    const now = new Date().toISOString()
    if (await db.first(`SELECT uid FROM ${identifier(resource.table)} WHERE uid = ? LIMIT 1`, [uid])) throw new Error('DUPLICATE_UID')
    const values: Record<string, unknown> = { ...validatedValues }
    for (const [key, operation] of Object.entries(parsed.secretOperations)) {
      if ((operation as any).action === 'replace') values[key] = (operation as any).value
      else if ((operation as any).action === 'clear') values[key] = null
    }
    const insert: Record<string, SqlValue> = { uid }
    for (const [key, value] of Object.entries(values)) if (columns.has(key)) insert[key] = value as SqlValue
    if (columns.has('created_at')) insert.created_at = now
    if (columns.has('updated_at')) insert.updated_at = now
    const keys = Object.keys(insert)
    const operations: SqlOperation[] = []
    if (resourceKey === 'site-settings' && Number(values.is_active) === 1) {
      operations.push({ sql: `UPDATE site_settings SET is_active = 0, updated_at = ? WHERE is_active = 1`, params: [now] })
    }
    operations.push({
      sql: `INSERT INTO ${identifier(resource.table)} (${keys.map(identifier).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
      params: keys.map(key => insert[key] ?? null), expectChanges: 1
    }, auditOperation(this.principal, 'create', resourceKey, uid, `创建${resource.label}`, { fields: Object.keys(values) }, now), ...invalidationOperations(resource.invalidate, now))
    await db.batch(operations)
    const created = await this.get(resourceKey, uid)
    if (!created) throw new Error('CREATE_RESULT_MISSING')
    return created
  }

  async update(resourceKey: string, uidValue: unknown, body: unknown, options: { allowNewsRichText?: boolean } = {}): Promise<Record<string, unknown>> {
    const resource = resourceDefinition(resourceKey)
    if (resource.readOnly) throw new Error('UPDATE_NOT_ALLOWED')
    const uid = normalizeUid(uidValue)
    const source = body as Record<string, unknown>
    const expectedUpdatedAt = String(source?.expectedUpdatedAt ?? '').trim()
    if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) throw new Error('EXPECTED_UPDATED_AT_REQUIRED')
    const parsed = normalizeRecordInput(resourceKey, body, 'update') as NormalizedRecordInput
    const db = await this.db()
    const existing = await db.first<Record<string, unknown>>(`SELECT * FROM ${identifier(resource.table)} WHERE uid = ? LIMIT 1`, [uid])
    if (!existing) throw new Error('RECORD_NOT_FOUND')
    const validatedValues = validateResourceValues(resourceKey, parsed.values, existing, Boolean(options.allowNewsRichText))
    await assertUniqueConstraints(db, resourceKey, validatedValues, uid)
    await validateResourceReferences(db, resourceKey, validatedValues)
    const columns = await tableColumns(db, resource.table)
    const values: Record<string, unknown> = { ...validatedValues }
    for (const [key, operation] of Object.entries(parsed.secretOperations)) {
      const action = (operation as any).action
      if (action === 'replace') values[key] = (operation as any).value
      else if (action === 'clear') values[key] = null
    }
    const allowedEntries = Object.entries(values).filter(([key]) => columns.has(key))
    if (!allowedEntries.length) return serializeRecord(resource, existing)
    const now = nowAfter(String(existing.updated_at ?? expectedUpdatedAt))
    const set = allowedEntries.map(([key]) => `${identifier(key)} = ?`)
    if (columns.has('updated_at')) set.push('updated_at = ?')
    const params: SqlValue[] = allowedEntries.map(([, value]) => value as SqlValue)
    if (columns.has('updated_at')) params.push(now)
    params.push(uid, new Date(expectedUpdatedAt).toISOString())
    const operations: SqlOperation[] = []
    if (resourceKey === 'site-settings' && Number(values.is_active) === 1) {
      operations.push({ sql: `UPDATE site_settings SET is_active = 0, updated_at = ? WHERE uid <> ? AND is_active = 1`, params: [now, uid] })
    }
    operations.push({
      sql: `UPDATE ${identifier(resource.table)} SET ${set.join(', ')} WHERE uid = ? AND updated_at = ?`, params, expectChanges: 1
    }, auditOperation(this.principal, 'update', resourceKey, uid, `更新${resource.label}`, { fields: allowedEntries.map(([key]) => key) }, now), ...invalidationOperations(resource.invalidate, now))
    await db.batch(operations)
    const updated = await this.get(resourceKey, uid)
    if (!updated) throw new Error('UPDATE_RESULT_MISSING')
    return updated
  }

  async updateNewsRichText(uidValue: unknown, body: unknown): Promise<Record<string, unknown>> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_RICH_TEXT_BODY')
    const source = body as Record<string, unknown>
    const references = richTextMediaReferences(source.document)
    const mediaKeys = [...new Set<string>(references.map((item: { objectKey: string }) => item.objectKey))]
    const db = await this.db()
    for (let offset = 0; offset < mediaKeys.length; offset += 50) {
      const keys = mediaKeys.slice(offset, offset + 50)
      const rows = await db.all<{ object_key: string; mime_type: string }>(`SELECT object_key, mime_type FROM media_assets WHERE status = 'active' AND object_key IN (${keys.map(() => '?').join(', ')})`, keys)
      const found = new Set(rows.filter(row => references.filter((ref: { objectKey: string }) => ref.objectKey === row.object_key).every((ref: { kind: string }) => ref.kind === 'pdf' ? row.mime_type === 'application/pdf' : row.mime_type.startsWith('image/'))).map(row => row.object_key))
      const missing = keys.find(key => !found.has(key))
      if (missing) throw new Error('INVALID_RICH_TEXT_MEDIA:document')
    }
    const html = renderRichTextDocument(source.document)
    return this.update('news', uidValue, { content: html, content_format: 'html', expectedUpdatedAt: source.expectedUpdatedAt }, { allowNewsRichText: true })
  }

  async remove(resourceKey: string, uidValue: unknown, expectedUpdatedAt: unknown): Promise<void> {
    const resource = resourceDefinition(resourceKey)
    if (resource.readOnly || resource.readOnlyCreate) throw new Error('DELETE_NOT_ALLOWED')
    const uid = normalizeUid(uidValue)
    const expected = String(expectedUpdatedAt ?? '').trim()
    if (!expected || Number.isNaN(Date.parse(expected))) throw new Error('EXPECTED_UPDATED_AT_REQUIRED')
    const db = await this.db()
    const now = new Date().toISOString()
    await db.batch([
      { sql: `DELETE FROM ${identifier(resource.table)} WHERE uid = ? AND updated_at = ?`, params: [uid, new Date(expected).toISOString()], expectChanges: 1 },
      auditOperation(this.principal, 'delete', resourceKey, uid, `删除${resource.label}`, {}, now),
      ...invalidationOperations(resource.invalidate, now)
    ])
  }

  async batch(resourceKey: string, body: unknown): Promise<{ updated: number }> {
    const resource = resourceDefinition(resourceKey)
    if (resource.readOnly) throw new Error('BATCH_NOT_ALLOWED')
    const request = normalizeBatchRequest(resourceKey, body)
    const db = await this.db()
    if (resourceKey === 'news' && request.field === 'visibility' && request.value === 'public') {
      const rows = await db.all<{ uid: string; published_at: string | null }>(`SELECT uid, published_at FROM news WHERE uid IN (${request.records.map(() => '?').join(', ')})`, request.records.map((record: any) => record.uid))
      if (rows.length !== request.records.length || rows.some(row => !row.published_at)) throw new Error('REQUIRED_PUBLISHED_AT:published_at')
    }
    const now = new Date().toISOString()
    const guardParts = request.records.map(() => '(uid = ? AND updated_at = ?)')
    const guardParams = request.records.flatMap((record: any) => [record.uid, record.expectedUpdatedAt]) as SqlValue[]
    const guardSql = `SELECT CASE WHEN COUNT(*) = ? THEN 1 ELSE json_extract('INVALID_ADMIN_BATCH_GUARD', '$.value') END AS ok FROM ${identifier(resource.table)} WHERE ${guardParts.join(' OR ')}`
    const operations: SqlOperation[] = [{ sql: guardSql, params: [request.records.length, ...guardParams] }]
    for (const [index, record] of request.records.entries()) {
      const value = request.values?.[index] ?? request.value
      operations.push({ sql: `UPDATE ${identifier(resource.table)} SET ${identifier(request.field)} = ?, updated_at = ? WHERE uid = ? AND updated_at = ?`, params: [value as SqlValue, nowAfter(record.expectedUpdatedAt), record.uid, record.expectedUpdatedAt], expectChanges: 1 })
    }
    operations.push(auditOperation(this.principal, 'batch_update', resourceKey, null, `批量更新${resource.label}`, { count: request.records.length, field: request.field, sequence: request.sequence }, now), ...invalidationOperations(resource.invalidate, now))
    await db.batch(operations)
    return { updated: request.records.length }
  }
}
