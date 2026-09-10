export type PublicSiteErrorCode = 'PUBLIC_INPUT' | 'PUBLIC_LIMIT' | 'PUBLIC_PROTOCOL' | 'PUBLIC_UNAVAILABLE' | 'PUBLIC_NOT_FOUND'

export class PublicSiteError extends Error {
  constructor(readonly code: PublicSiteErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PublicSiteError'
  }
}
