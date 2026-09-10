import type { H3Event } from 'h3'
import { setHeader, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import type { AdminApiErrorBody } from '../../shared/contracts/admin'
import { DatabaseError } from '../../db/errors'
import { SecurityError } from '../security/errors'
import { AdminContentError } from '../services/admin/content-errors'

interface FailureDescriptor {
  status: number
  code: string
  message: string
  retryAfterSeconds?: number
  fieldErrors?: Readonly<Record<string, string>>
  expected: boolean
}

const INTERNAL_SECURITY_CODES = new Set(['AUTH_CONFIG', 'AUTH_PROTOCOL'])

function describeFailure(error: unknown): FailureDescriptor {
  if (error instanceof AdminContentError) {
    return {
      status: error.statusCode,
      code: error.code,
      message: error.publicMessage,
      expected: error.code !== 'ADMIN_CONTENT_PROTOCOL',
      ...(error.fieldErrors === undefined ? {} : { fieldErrors: error.fieldErrors }),
    }
  }
  if (error instanceof ZodError) return { status: 422, code: 'ADMIN_VALIDATION', message: '提交的数据未通过校验。', expected: true }
  if (error instanceof SecurityError) return { status: error.statusCode, code: error.code, message: error.publicMessage, ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }), expected: !INTERNAL_SECURITY_CODES.has(error.code) }
  if (error instanceof DatabaseError) {
    if (error.code === 'DB_BUSY') return { status: 503, code: 'ADMIN_DATABASE_BUSY', message: '数据库暂时繁忙，请稍后重试。', retryAfterSeconds: 2, expected: true }
    if (error.code === 'DB_CONFLICT' || error.code === 'DB_UNIQUE') return { status: 409, code: 'ADMIN_CONFLICT', message: '数据已发生变化，请刷新后重试。', expected: true }
    if (error.code === 'DB_NOT_FOUND') return { status: 404, code: 'ADMIN_NOT_FOUND', message: '记录不存在或已被删除。', expected: true }
    if (error.code === 'DB_FOREIGN_KEY' || error.code === 'DB_CHECK' || error.code === 'DB_NOT_NULL') return { status: 422, code: 'ADMIN_VALIDATION', message: '数据不符合业务约束，请检查关联记录和必填字段。', expected: true }
    if (error.code === 'DB_INPUT' || error.code === 'DB_LIMIT') return { status: 400, code: 'ADMIN_INPUT', message: '后台请求参数无效。', expected: true }
    return { status: 503, code: 'ADMIN_UNAVAILABLE', message: '后台数据服务暂不可用。', expected: false }
  }
  return { status: 503, code: 'ADMIN_UNAVAILABLE', message: '后台服务暂不可用。', expected: false }
}

export function applyAdminNoStore(event: H3Event): void {
  setHeader(event, 'cache-control', 'private, no-store, max-age=0')
  setHeader(event, 'pragma', 'no-cache')
  setHeader(event, 'x-content-type-options', 'nosniff')
  setHeader(event, 'x-robots-tag', 'noindex, nofollow')
}

export function adminFailure(event: H3Event, error: unknown): AdminApiErrorBody {
  const failure = describeFailure(error)
  const requestId = event.context.requestId || 'unavailable'
  setResponseStatus(event, failure.status)
  applyAdminNoStore(event)
  if (failure.retryAfterSeconds !== undefined) setHeader(event, 'retry-after', failure.retryAfterSeconds)
  if (!failure.expected) console.error('Administration request failed unexpectedly', { requestId, errorType: error instanceof Error ? error.name : typeof error, code: failure.code })
  return { error: { code: failure.code, message: failure.message, requestId, ...(failure.fieldErrors === undefined ? {} : { fieldErrors: failure.fieldErrors }) } }
}
