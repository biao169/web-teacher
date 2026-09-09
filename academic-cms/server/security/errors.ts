export type SecurityErrorCode =
  | 'AUTH_CONFIG'
  | 'AUTH_INPUT'
  | 'AUTH_UNSUPPORTED_MEDIA_TYPE'
  | 'AUTH_PAYLOAD_TOO_LARGE'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_REQUIRED'
  | 'AUTH_SESSION_INVALID'
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_PASSWORD_CHANGE_REQUIRED'
  | 'AUTH_CSRF'
  | 'AUTH_ORIGIN'
  | 'AUTH_THROTTLED'
  | 'AUTH_PASSWORD_POLICY'
  | 'AUTH_BOOTSTRAP_UNAVAILABLE'
  | 'AUTH_CONFLICT'
  | 'AUTH_PROTOCOL'

const HTTP_STATUS: Readonly<Record<SecurityErrorCode, number>> = {
  AUTH_CONFIG: 500,
  AUTH_INPUT: 400,
  AUTH_UNSUPPORTED_MEDIA_TYPE: 415,
  AUTH_PAYLOAD_TOO_LARGE: 413,
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_REQUIRED: 401,
  AUTH_SESSION_INVALID: 401,
  AUTH_SESSION_EXPIRED: 401,
  AUTH_FORBIDDEN: 403,
  AUTH_PASSWORD_CHANGE_REQUIRED: 403,
  AUTH_CSRF: 403,
  AUTH_ORIGIN: 403,
  AUTH_THROTTLED: 429,
  AUTH_PASSWORD_POLICY: 400,
  AUTH_BOOTSTRAP_UNAVAILABLE: 404,
  AUTH_CONFLICT: 409,
  AUTH_PROTOCOL: 500,
}

const PUBLIC_MESSAGES: Readonly<Record<SecurityErrorCode, string>> = {
  AUTH_CONFIG: '服务器安全配置无效。',
  AUTH_INPUT: '请求参数无效。',
  AUTH_UNSUPPORTED_MEDIA_TYPE: '请求必须使用支持的内容类型。',
  AUTH_PAYLOAD_TOO_LARGE: '请求内容过大。',
  AUTH_INVALID_CREDENTIALS: '用户名或密码错误。',
  AUTH_REQUIRED: '需要登录。',
  AUTH_SESSION_INVALID: '登录状态无效，请重新登录。',
  AUTH_SESSION_EXPIRED: '登录状态已过期，请重新登录。',
  AUTH_FORBIDDEN: '没有执行此操作的权限。',
  AUTH_PASSWORD_CHANGE_REQUIRED: '请先修改密码。',
  AUTH_CSRF: '请求安全校验失败。',
  AUTH_ORIGIN: '请求来源校验失败。',
  AUTH_THROTTLED: '登录尝试过多，请稍后再试。',
  AUTH_PASSWORD_POLICY: '密码不符合安全要求。',
  AUTH_BOOTSTRAP_UNAVAILABLE: '初始化入口不可用。',
  AUTH_CONFLICT: '操作与当前状态冲突。',
  AUTH_PROTOCOL: '认证服务发生内部错误。',
}

export interface SecurityErrorOptions extends ErrorOptions {
  publicMessage?: string
  retryAfterSeconds?: number
}

export class SecurityError extends Error {
  readonly statusCode: number
  readonly publicMessage: string
  readonly retryAfterSeconds?: number

  constructor(readonly code: SecurityErrorCode, internalMessage = PUBLIC_MESSAGES[code], options: SecurityErrorOptions = {}) {
    super(internalMessage, options)
    this.name = 'SecurityError'
    this.statusCode = HTTP_STATUS[code]
    this.publicMessage = options.publicMessage ?? PUBLIC_MESSAGES[code]
    if (options.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds
  }
}

export function isSecurityError(error: unknown): error is SecurityError {
  return error instanceof SecurityError
}

export function securityError(error: unknown, fallback = 'Authentication subsystem failure'): SecurityError {
  return error instanceof SecurityError ? error : new SecurityError('AUTH_PROTOCOL', fallback, { cause: error })
}
