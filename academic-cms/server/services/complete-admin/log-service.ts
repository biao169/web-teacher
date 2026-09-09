import type { H3Event } from 'h3'
import { getQuery } from 'h3'
import { MAX_EXPORT_ROWS, normalizeDirection, normalizePage, normalizePageSize, normalizeSearch, redactSensitive } from '~~/shared/complete-admin/core.mjs'
import type { AdminPrincipal } from '../../utils/complete-admin/auth'
import { serializeSafeCsv } from '../../utils/complete-admin/csv'
import { resolveAdminDatabase, type SqlAdapter, type SqlValue } from '../../utils/complete-admin/db'

const LOG_DETAIL_LIMIT = 200_000
const LOG_EXPORT_DETAIL_ROWS = 5_000
const LOG_EXPORT_BYTES = 24 * 1024 * 1024
const SAFE_REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/u
const SORT_FIELDS = new Set(['created_at', 'actor_name', 'module', 'action', 'target_uid', 'summary', 'status'])
const FILTER_FIELDS = ['f_created_at', 'f_actor_name', 'f_module', 'f_action', 'f_target_uid', 'f_summary', 'f_status'] as const

interface LogFilters {
  q: string
  module: string
  action: string
  status: string
  actorName: string
  targetUid: string
  summary: string
  createdAt: string
  sort: string
  direction: 'asc' | 'desc'
}

function hasControlCharacter(value: string): boolean {
  return [...value].some(character => {
    const code = character.codePointAt(0) ?? 0
    return code <= 31 || code === 127
  })
}

interface LogQuery extends LogFilters {
  page: number
  pageSize: number
}

function scalar(value: unknown, code: string): unknown {
  if (Array.isArray(value)) throw new Error(code)
  return value
}

function boundedText(value: unknown, maxLength: number, code: string): string {
  const text = String(scalar(value, code) ?? '').normalize('NFC').trim()
  if (text.length > maxLength || hasControlCharacter(text)) throw new Error(code)
  return text
}

function normalizeFilters(input: Record<string, unknown>): LogFilters {
  const q = normalizeSearch(scalar(input.q, 'INVALID_LOG_SEARCH'))
  const module = boundedText(input.f_module, 100, 'INVALID_LOG_MODULE')
  const action = boundedText(input.f_action, 100, 'INVALID_LOG_ACTION')
  const status = boundedText(input.f_status, 100, 'INVALID_LOG_STATUS')
  const actorName = boundedText(input.f_actor_name, 320, 'INVALID_LOG_ACTOR')
  const targetUid = boundedText(input.f_target_uid, 128, 'INVALID_LOG_TARGET')
  const summary = boundedText(input.f_summary, 256, 'INVALID_LOG_SUMMARY')
  const createdAt = boundedText(input.f_created_at, 64, 'INVALID_LOG_CREATED_AT')
  const sort = boundedText(input.sort, 32, 'INVALID_LOG_SORT') || 'created_at'
  if (!SORT_FIELDS.has(sort)) throw new Error('INVALID_LOG_SORT')
  const direction = normalizeDirection(scalar(input.direction ?? 'desc', 'INVALID_LOG_DIRECTION')) as 'asc' | 'desc'
  return { q, module, action, status, actorName, targetUid, summary, createdAt, sort, direction }
}

function normalizeListQuery(input: Record<string, unknown>): LogQuery {
  const allowed = new Set(['q', 'page', 'pageSize', 'sort', 'direction', ...FILTER_FIELDS])
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error(`INVALID_LOG_QUERY_FIELD:${key}`)
  return {
    ...normalizeFilters(input),
    page: normalizePage(scalar(input.page, 'INVALID_PAGE')),
    pageSize: normalizePageSize(scalar(input.pageSize, 'INVALID_PAGE_SIZE')),
  }
}

function sqlLike(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

function whereClause(filters: LogFilters): { sql: string; params: SqlValue[] } {
  const where: string[] = []
  const params: SqlValue[] = []
  if (filters.q) {
    const fields = ['actor_name', 'actor_uid', 'action', 'module', 'target_uid', 'summary']
    where.push(`(${fields.map(field => `CAST(${field} AS TEXT) LIKE ? ESCAPE '\\'`).join(' OR ')})`)
    params.push(...fields.map(() => sqlLike(filters.q)))
  }
  for (const [field, value] of [['module', filters.module], ['action', filters.action], ['status', filters.status]] as const) {
    if (!value) continue
    where.push(`${field} = ?`)
    params.push(value)
  }
  if (filters.actorName) {
    where.push('(CAST(actor_uid AS TEXT) LIKE ? ESCAPE \'\\\' OR CAST(actor_name AS TEXT) LIKE ? ESCAPE \'\\\')')
    params.push(sqlLike(filters.actorName), sqlLike(filters.actorName))
  }
  if (filters.targetUid) {
    where.push('CAST(target_uid AS TEXT) LIKE ? ESCAPE \'\\\'')
    params.push(sqlLike(filters.targetUid))
  }
  if (filters.summary) {
    where.push('CAST(summary AS TEXT) LIKE ? ESCAPE \'\\\'')
    params.push(sqlLike(filters.summary))
  }
  if (filters.createdAt) {
    where.push('CAST(created_at AS TEXT) LIKE ? ESCAPE \'\\\'')
    params.push(sqlLike(filters.createdAt))
  }
  return { sql: where.length ? ` WHERE ${where.join(' AND ')}` : '', params }
}

function safeDetail(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || raw.length > LOG_DETAIL_LIMIT) return { unavailable: true }
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { unavailable: true }
    return redactSensitive(value) as Record<string, unknown>
  } catch {
    return { unavailable: true }
  }
}

function requestIdFrom(detail: Record<string, unknown>): string | null {
  const value = String(detail.requestId ?? detail.request_id ?? '').trim()
  return SAFE_REQUEST_ID_RE.test(value) ? value : null
}

function publicFilters(filters: LogFilters): Record<string, string> {
  return Object.fromEntries(Object.entries(filters).filter(([key, value]) => !['sort', 'direction'].includes(key) && Boolean(value)))
}

export class CompleteAdminLogService {
  constructor(private readonly event: H3Event, private readonly principal: AdminPrincipal) {}

  private async db(): Promise<SqlAdapter> { return resolveAdminDatabase(this.event) }

  async list(): Promise<Record<string, unknown>> {
    const query = normalizeListQuery(getQuery(this.event) as Record<string, unknown>)
    const { sql, params } = whereClause(query)
    const offset = (query.page - 1) * query.pageSize
    const db = await this.db()
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const [rows, counts, modules, actions, statuses, actors] = await Promise.all([
      db.all<Record<string, unknown>>(
        `SELECT uid,actor_uid,actor_name,action,module,target_uid,summary,status,created_at FROM operation_logs${sql} ORDER BY ${query.sort} ${query.direction.toUpperCase()}, id ${query.direction.toUpperCase()} LIMIT ? OFFSET ?`,
        [...params, query.pageSize, offset],
      ),
      db.first<Record<string, unknown>>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END),0) AS successes, COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END),0) AS failures, COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END),0) AS today FROM operation_logs${sql}`,
        [today.toISOString(), ...params],
      ),
      db.all<Record<string, unknown>>('SELECT module AS value, COUNT(*) AS count FROM operation_logs GROUP BY module ORDER BY count DESC,module LIMIT 100'),
      db.all<Record<string, unknown>>('SELECT action AS value, COUNT(*) AS count FROM operation_logs GROUP BY action ORDER BY count DESC,action LIMIT 100'),
      db.all<Record<string, unknown>>("SELECT COALESCE(status,'') AS value, COUNT(*) AS count FROM operation_logs GROUP BY status ORDER BY count DESC,status LIMIT 50"),
      db.all<Record<string, unknown>>("SELECT COALESCE(actor_uid,actor_name,'') AS value, MAX(COALESCE(actor_name,actor_uid,'系统')) AS label, COUNT(*) AS count FROM operation_logs GROUP BY actor_uid,actor_name ORDER BY count DESC,label LIMIT 100"),
    ])
    const total = Number(counts?.total ?? 0)
    return {
      rows,
      page: query.page,
      pageSize: query.pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / query.pageSize)),
      sort: query.sort,
      direction: query.direction,
      stats: {
        total,
        successes: Number(counts?.successes ?? 0),
        failures: Number(counts?.failures ?? 0),
        today: Number(counts?.today ?? 0),
      },
      facets: { modules, actions, statuses, actors: actors.filter(row => Boolean(row.value)) },
    }
  }

  async get(uid: string): Promise<Record<string, unknown> | null> {
    const value = boundedText(uid, 128, 'INVALID_UID')
    if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u.test(value)) throw new Error('INVALID_UID')
    const db = await this.db()
    const row = await db.first<Record<string, unknown>>('SELECT uid,actor_uid,actor_name,action,module,target_uid,summary,detail_json,status,created_at FROM operation_logs WHERE uid = ? LIMIT 1', [value])
    if (!row) return null
    const detail = safeDetail(row.detail_json)
    const { detail_json: _raw, ...record } = row
    return { ...record, detail, requestId: requestIdFrom(detail) }
  }

  async export(input: unknown): Promise<Record<string, unknown>> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_LOG_EXPORT')
    const body = input as Record<string, unknown>
    const allowed = new Set(['q', 'sort', 'direction', 'format', 'includeDetails', ...FILTER_FIELDS])
    for (const key of Object.keys(body)) if (!allowed.has(key)) throw new Error(`INVALID_LOG_EXPORT_FIELD:${key}`)
    const format = boundedText(body.format, 16, 'INVALID_LOG_EXPORT_FORMAT') || 'csv'
    if (!['csv', 'json'].includes(format)) throw new Error('INVALID_LOG_EXPORT_FORMAT')
    if (![undefined, true, false].includes(body.includeDetails as never)) throw new Error('INVALID_LOG_EXPORT_DETAILS')
    const includeDetails = body.includeDetails === true
    const filters = normalizeFilters(body)
    const { sql, params } = whereClause(filters)
    const db = await this.db()
    const count = await db.first<{ total: number }>(`SELECT COUNT(*) AS total FROM operation_logs${sql}`, params)
    const total = Number(count?.total ?? 0)
    const limit = includeDetails ? LOG_EXPORT_DETAIL_ROWS : MAX_EXPORT_ROWS
    if (total > limit) throw new Error('LOG_EXPORT_LIMIT')
    const columns = `uid,actor_uid,actor_name,action,module,target_uid,summary,status,created_at${includeDetails ? ',detail_json' : ''}`
    const sourceRows = await db.all<Record<string, unknown>>(`SELECT ${columns} FROM operation_logs${sql} ORDER BY ${filters.sort} ${filters.direction.toUpperCase()}, id ${filters.direction.toUpperCase()} LIMIT ?`, [...params, limit])
    const rows = sourceRows.map(row => {
      if (!includeDetails) return row
      const { detail_json: raw, ...safe } = row
      return { ...safe, detail: safeDetail(raw) }
    })
    const exportedAt = new Date().toISOString()
    let content: string
    let mime: string
    if (format === 'json') {
      mime = 'application/json;charset=utf-8'
      content = JSON.stringify({ format: 'academic-cms-operation-logs', version: 1, exportedAt, filters: publicFilters(filters), total, rows }, null, 2)
    } else {
      mime = 'text/csv;charset=utf-8'
      const keys = ['uid', 'actor_uid', 'actor_name', 'action', 'module', 'target_uid', 'summary', 'status', 'created_at', ...(includeDetails ? ['detail'] : [])]
      content = serializeSafeCsv(rows, keys)
    }
    if (new TextEncoder().encode(content).byteLength > LOG_EXPORT_BYTES) throw new Error('LOG_EXPORT_SIZE_LIMIT')
    const stamp = exportedAt.replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z')
    const auditDetail = redactSensitive({ filters: publicFilters(filters), format, includeDetails, rows: total })
    const result = await db.run(
      "INSERT INTO operation_logs (uid,actor_uid,actor_name,action,module,target_uid,summary,detail_json,status,created_at,updated_at) VALUES (?,?,?,?, 'operation_logs',NULL,?,?, 'success',?,?)",
      [`log:${crypto.randomUUID()}`, this.principal.userUid, this.principal.displayName || this.principal.username, 'export', `导出操作日志 ${total} 条`, JSON.stringify(auditDetail), exportedAt, exportedAt],
    )
    if (result.changes !== 1) throw new Error('LOG_EXPORT_AUDIT_FAILED')
    return { filename: `academic-cms-operation-logs-${stamp}.${format}`, mime, encoding: 'utf8', content, rows: total }
  }
}
