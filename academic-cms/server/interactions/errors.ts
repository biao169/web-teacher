export type PublicInteractionErrorCode =
  | 'INTERACTION_INPUT'
  | 'INTERACTION_DISABLED'
  | 'INTERACTION_AUTH_REQUIRED'
  | 'INTERACTION_THROTTLED'
  | 'INTERACTION_CONFLICT'
  | 'INTERACTION_ATTACHMENT_UNAVAILABLE'
  | 'INTERACTION_PROTOCOL'

const STATUS: Readonly<Record<PublicInteractionErrorCode, number>> = {
  INTERACTION_INPUT: 400,
  INTERACTION_DISABLED: 403,
  INTERACTION_AUTH_REQUIRED: 401,
  INTERACTION_THROTTLED: 429,
  INTERACTION_CONFLICT: 409,
  INTERACTION_ATTACHMENT_UNAVAILABLE: 400,
  INTERACTION_PROTOCOL: 500,
}

const PUBLIC_MESSAGE: Readonly<Record<PublicInteractionErrorCode, string>> = {
  INTERACTION_INPUT: '提交内容无效。',
  INTERACTION_DISABLED: '当前未开放此功能。',
  INTERACTION_AUTH_REQUIRED: '请先登录。',
  INTERACTION_THROTTLED: '提交过于频繁，请稍后再试。',
  INTERACTION_CONFLICT: '提交与当前状态冲突。',
  INTERACTION_ATTACHMENT_UNAVAILABLE: '留言附件上传暂未开放。',
  INTERACTION_PROTOCOL: '提交服务暂时不可用。',
}

export interface PublicInteractionErrorOptions extends ErrorOptions {
  publicMessage?: string
  retryAfterSeconds?: number
}

export class PublicInteractionError extends Error {
  readonly statusCode: number
  readonly publicMessage: string
  readonly retryAfterSeconds?: number

  constructor(readonly code: PublicInteractionErrorCode, internalMessage: string, options: PublicInteractionErrorOptions = {}) {
    super(internalMessage, options)
    this.name = 'PublicInteractionError'
    this.statusCode = STATUS[code]
    this.publicMessage = options.publicMessage ?? PUBLIC_MESSAGE[code]
    if (options.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds
  }
}
