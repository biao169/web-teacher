export type I18nErrorCode = 'I18N_INPUT' | 'I18N_LIMIT' | 'I18N_PROTOCOL'

export class I18nError extends Error {
  constructor(readonly code: I18nErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'I18nError'
  }
}
