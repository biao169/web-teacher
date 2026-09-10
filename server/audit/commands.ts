import type { SqlCommand, SqlValue } from '../../db/contracts'
import { write } from '../../db/query'
import { SecurityError } from '../security/errors'
import { assertSafeAuditEvent, oneLine, sanitizeAuditDetail } from './sanitize'

export interface AuditActor {
  uid: string | null
  name: string | null
}

export interface AuditCondition {
  /** Trusted, static SQL predicate supplied only by server code. */
  sql: string
  params?: readonly SqlValue[]
}

export interface AuditEvent {
  uid: string
  at: string
  actor?: AuditActor
  action: string
  module: string
  targetUid?: string | null
  summary?: string | null
  detail?: unknown
  status?: string | null
  condition?: AuditCondition
}

export function buildAuditCommand(event: AuditEvent): SqlCommand {
  const uid = oneLine(event.uid, 128)
  const at = oneLine(event.at, 24)
  const action = oneLine(event.action, 128)
  const module = oneLine(event.module, 128)
  if (!uid || !at || !action || !module) throw new SecurityError('AUTH_INPUT', 'Audit event is incomplete')
  const actor = event.actor ?? { uid: null, name: null }
  const detail = sanitizeAuditDetail(event.detail ?? {})
  assertSafeAuditEvent(detail)
  const fields = ['uid', 'created_at', 'updated_at', 'actor_uid', 'actor_name', 'action', 'module', 'target_uid', 'summary', 'detail_json', 'status']
  const values: SqlValue[] = [
    uid,
    at,
    at,
    oneLine(actor.uid, 128),
    oneLine(actor.name, 256),
    action,
    module,
    oneLine(event.targetUid, 128),
    oneLine(event.summary, 500),
    JSON.stringify(detail),
    oneLine(event.status, 64),
  ]
  const fieldSql = fields.map(field => `"${field}"`).join(', ')
  const valueSql = fields.map(() => '?').join(', ')
  if (!event.condition) return write(`INSERT INTO operation_logs (${fieldSql}) VALUES (${valueSql})`, values)
  const predicate = event.condition.sql.trim()
  if (!predicate || predicate.length > 2000 || /;|--|\/\*/u.test(predicate)) {
    throw new SecurityError('AUTH_INPUT', 'Audit condition is invalid')
  }
  return write(
    `INSERT INTO operation_logs (${fieldSql}) SELECT ${valueSql} WHERE ${predicate}`,
    [...values, ...(event.condition.params ?? [])],
  )
}
