export type CacheErrorCode = 'CACHE_INPUT' | 'CACHE_LIMIT' | 'CACHE_PROTOCOL'

export class CacheError extends Error {
  constructor(readonly code: CacheErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CacheError'
  }
}
