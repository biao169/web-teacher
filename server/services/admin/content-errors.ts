export type AdminContentErrorCode =
  | 'ADMIN_CONTENT_INPUT'
  | 'ADMIN_CONTENT_VALIDATION'
  | 'ADMIN_CONTENT_NOT_FOUND'
  | 'ADMIN_CONTENT_CONFLICT'
  | 'ADMIN_CONTENT_FORBIDDEN'
  | 'ADMIN_CONTENT_PROTOCOL'

const STATUS: Readonly<Record<AdminContentErrorCode, number>> = Object.freeze({
  ADMIN_CONTENT_INPUT: 400,
  ADMIN_CONTENT_VALIDATION: 422,
  ADMIN_CONTENT_NOT_FOUND: 404,
  ADMIN_CONTENT_CONFLICT: 409,
  ADMIN_CONTENT_FORBIDDEN: 403,
  ADMIN_CONTENT_PROTOCOL: 500,
})

const PUBLIC_MESSAGE: Readonly<Record<AdminContentErrorCode, string>> = Object.freeze({
  ADMIN_CONTENT_INPUT: '后台请求参数无效。',
  ADMIN_CONTENT_VALIDATION: '提交的数据未通过校验。',
  ADMIN_CONTENT_NOT_FOUND: '记录不存在或已被删除。',
  ADMIN_CONTENT_CONFLICT: '记录已被其他操作修改，请刷新后重试。',
  ADMIN_CONTENT_FORBIDDEN: '当前模块不允许执行此操作。',
  ADMIN_CONTENT_PROTOCOL: '后台内容服务发生内部错误。',
})

export class AdminContentError extends Error {
  readonly statusCode: number
  readonly publicMessage: string
  readonly fieldErrors: Readonly<Record<string, string>>
  readonly expected: boolean

  constructor(
    readonly code: AdminContentErrorCode,
    internalMessage = PUBLIC_MESSAGE[code],
    options: ErrorOptions & { publicMessage?: string; fieldErrors?: Readonly<Record<string, string>> } = {},
  ) {
    super(internalMessage, options)
    this.name = 'AdminContentError'
    this.statusCode = STATUS[code]
    this.publicMessage = options.publicMessage ?? PUBLIC_MESSAGE[code]
    this.fieldErrors = Object.freeze({ ...(options.fieldErrors ?? {}) })
    this.expected = code !== 'ADMIN_CONTENT_PROTOCOL'
  }
}
