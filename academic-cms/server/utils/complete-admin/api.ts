import type { H3Event } from 'h3'
import { createError, getHeader, readRawBody, setHeader } from 'h3'

const ERROR_STATUS: Record<string, number> = {
  UNKNOWN_ADMIN_RESOURCE: 404, RECORD_NOT_FOUND: 404, ROLE_NOT_FOUND: 404, CREATE_NOT_ALLOWED: 405, UPDATE_NOT_ALLOWED: 405, DELETE_NOT_ALLOWED: 405, BATCH_NOT_ALLOWED: 405,
  EXPECTED_UPDATED_AT_REQUIRED: 409, EDIT_CONFLICT: 409, SQL_EXPECTED_CHANGES: 409, DUPLICATE_ROLE_PERMISSION: 409,
  DUPLICATE_UID: 409, DUPLICATE_ROLE_NAME: 409, DUPLICATE_USERNAME: 409, ROLE_IN_USE: 409, ROLE_DISABLED: 409, SESSION_STATE_CHANGED: 409,
  SELF_PRIVILEGE_CHANGE_FORBIDDEN: 403, SELF_PASSWORD_RESET_FORBIDDEN: 403, CURRENT_ROLE_PROTECTED: 403,
  SYSTEM_ROLE_PROTECTED: 403, SYSTEM_ADMIN_TARGET_PROTECTED: 403, ROLE_LEVEL_FORBIDDEN: 403, PERMISSION_ESCALATION_FORBIDDEN: 403, LAST_SYSTEM_ADMIN_REQUIRED: 403,
  TRANSLATION_JOB_PAUSED: 409, TRANSLATION_EDIT_CONFLICT: 409, TRANSLATION_SOURCE_CHANGED: 409,
  TRANSLATION_CONFIGURATION_REQUIRED: 422,
  MEDIA_STILL_REFERENCED: 409, MEDIA_OBJECT_MISSING: 409, MEDIA_OBJECT_INCONSISTENT: 409, MEDIA_RETENTION_NOT_EXPIRED: 409,
  UPLOAD_POLICY_SIZE_EXCEEDED: 413, INVALID_UPLOAD_SIZE: 413, LOG_EXPORT_LIMIT: 413, LOG_EXPORT_SIZE_LIMIT: 413, LOG_EXPORT_AUDIT_FAILED: 500,
  BACKUP_SIZE_LIMIT: 413, EXPORT_ROW_LIMIT: 413, ONLINE_IMPORT_ROW_LIMIT: 413, IMPORT_ROW_TOO_LARGE: 413, IMPORT_OPERATION_LIMIT: 413,
  BACKUP_ROW_LIMIT: 413, MEDIA_BACKUP_SIZE_LIMIT: 413,
  IMPORT_DIGEST_MISMATCH: 409, EXPORT_AUDIT_FAILED: 500, MEDIA_BACKUP_ROLLBACK_FAILED: 500, DATABASE_SCHEMA_VERSION_MISSING: 500,
  CSV_SINGLE_TABLE_REQUIRED: 422, IMPORT_TABLE_NOT_ALLOWED: 422, IMPORT_PASSWORD_HASH_REQUIRED: 422,
  IMPORT_INTERNAL_FIELD: 422, IMPORT_FIELD_SHAPE_MISMATCH: 422, IMPORT_CONFIRMATION_REQUIRED: 422,
  BACKUP_SCHEMA_TOO_NEW: 422, BACKUP_DECRYPT_FAILED: 422, UNSUPPORTED_BACKUP: 422,
  INVALID_MEDIA_BACKUP_OBJECTS: 422, INVALID_MEDIA_BACKUP_OBJECT: 422, INVALID_MEDIA_BACKUP_FIELD: 422, INVALID_MEDIA_BACKUP_METADATA: 422,
  INVALID_MEDIA_BACKUP_PAYLOAD: 422, DUPLICATE_MEDIA_BACKUP_OBJECT: 422, MEDIA_BACKUP_CATALOG_REQUIRED: 422, MEDIA_BACKUP_CATALOG_MISMATCH: 422,
  MEDIA_BACKUP_REQUIRES_ENCRYPTED_BACKUP: 422,
  UNSUPPORTED_MEDIA_SIGNATURE: 415, UPLOAD_EXTENSION_NOT_ALLOWED: 415, MEDIA_TYPE_MISMATCH: 415,
  FORBIDDEN_MEDIA_PREVIEW: 403,
  METADATA_NOT_FOUND: 404, METADATA_RATE_LIMITED: 429, METADATA_TEMPORARY_FAILURE: 503, METADATA_PROVIDER_UNAVAILABLE: 503,
  UNKNOWN_DUPLICATE_RESOURCE: 404, UNKNOWN_DUPLICATE_FIELD: 404,
  DB_UNIQUE: 409, DB_CONFLICT: 409, DB_FOREIGN_KEY: 409, DB_NOT_NULL: 422, DB_CHECK: 422,
  DB_BUSY: 503, DB_PROTOCOL: 503, DB_TRANSACTION: 503, DB_UNKNOWN: 503,
  DATABASE_PATH_OUTSIDE_PROJECT: 500, BETTER_SQLITE3_UNAVAILABLE: 503
}

export async function readBoundedJson(event: H3Event, maxBytes = 1024 * 1024): Promise<unknown> {
  const declared = Number(getHeader(event, 'content-length') ?? 0)
  if (Number.isFinite(declared) && declared > maxBytes) throw adminError(413, 'REQUEST_BODY_TOO_LARGE', '请求内容过大')
  const raw = await readRawBody(event, false)
  if (raw === undefined || raw === null) return {}
  const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : Uint8Array.from(raw)
  if (bytes.byteLength > maxBytes) throw adminError(413, 'REQUEST_BODY_TOO_LARGE', '请求内容过大')
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw adminError(400, 'INVALID_UTF8', '请求文本编码无效') }
  try { return JSON.parse(text) } catch { throw adminError(400, 'INVALID_JSON', '请求 JSON 无效') }
}

export function adminError(statusCode: number, code: string, message: string): ReturnType<typeof createError> {
  return createError({ statusCode, message, data: { error: { code, message } } })
}

export function mapAdminError(event: H3Event, error: unknown): never {
  if (error && typeof error === 'object' && 'statusCode' in error) throw error
  const message = error instanceof Error ? error.message : 'UNKNOWN_ADMIN_ERROR'
  const explicitCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : ''
  const base = explicitCode.startsWith('DB_') ? explicitCode : (message.split(':')[0] ?? message)
  let statusCode = ERROR_STATUS[base] ?? 400
  if (/^(DUPLICATE_|UNIQUE|SQL_EXPECTED_CHANGES)/u.test(base)) statusCode = 409
  if (/^(REQUIRED_|INVALID_|FORBIDDEN_|UNKNOWN_FIELD|READ_ONLY_FIELD|IMMUTABLE_FIELD|TEXT_TOO_LONG|SECRET_)/u.test(base)) statusCode = 422
  if (/^(DATABASE_|D1_|BETTER_)/u.test(base)) statusCode = 503
  const requestId = getHeader(event, 'x-request-id') ?? crypto.randomUUID()
  setHeader(event, 'x-request-id', requestId)
  setHeader(event, 'x-admin-error-code', base)
  const publicMessage = base === 'METADATA_NOT_FOUND' ? '未找到匹配的公开元数据'
    : base === 'METADATA_RATE_LIMITED' ? '元数据来源当前受限，请稍后重试或切换来源'
      : base === 'METADATA_PROVIDER_UNAVAILABLE' || base === 'METADATA_TEMPORARY_FAILURE' ? '元数据来源暂时不可用，请切换来源重试'
        : statusCode >= 500 ? '后台服务暂时不可用'
    : base.startsWith('LOG_EXPORT_') ? '导出结果超过在线处理上限，请缩小筛选范围'
      : ['BACKUP_SIZE_LIMIT','EXPORT_ROW_LIMIT','ONLINE_IMPORT_ROW_LIMIT','IMPORT_ROW_TOO_LARGE','IMPORT_OPERATION_LIMIT','MEDIA_BACKUP_SIZE_LIMIT'].includes(base) ? '导入或导出数据超过在线处理上限'
      : statusCode === 413 ? '文件超过当前上传限制'
        : statusCode === 415 ? '文件类型或内容格式不受支持'
          : statusCode === 409 ? '数据已发生变化、仍被引用或存储状态不一致'
            : statusCode === 404 ? '记录不存在'
              : statusCode === 403 ? '没有执行此操作的权限'
                : '提交的数据不符合要求'
  const rawField = message.includes(':') ? message.slice(message.indexOf(':') + 1) : ''
  const fieldErrors = /^[a-z][a-z0-9_]{0,63}$/u.test(rawField) ? { [rawField]: [publicMessage] } : undefined
  throw createError({ statusCode, message: publicMessage, data: { error: { code: base, message: publicMessage, requestId, ...(fieldErrors ? { fieldErrors } : {}) } } })
}
