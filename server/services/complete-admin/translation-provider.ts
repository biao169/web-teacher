import { buildTranslationProviderRequest } from '~~/shared/complete-admin/core.mjs'
import { buildTranslationEnvelope, parseTranslationEnvelope, splitTranslationText, MYMEMORY_MAX_BYTES, resolveTranslationConfig, type TranslationProvider } from '../../../shared/admin/translation'
import { canonicalSourceText } from '../../i18n/fingerprint'

export class TranslationProviderError extends Error {
  constructor(readonly code: string, readonly retryAfterSeconds = 60) { super(code); this.name = 'TranslationProviderError' }
}
export function providerFailure(error: unknown): TranslationProviderError {
  if (error instanceof TranslationProviderError) return error
  if (error instanceof Error && error.message === 'TRANSLATION_ENVELOPE_MISMATCH') return new TranslationProviderError(error.message)
  return new TranslationProviderError('PROVIDER_FAILURE')
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function providerConfig(provider: TranslationProvider, settings: Record<string, unknown>): Record<string, unknown> {
  if (provider === 'libretranslate') return { url: settings.libretranslate_url, apiKey: settings.libretranslate_api_key }
  if (provider === 'deepl') return { apiKey: settings.deepl_api_key }
  if (provider === 'google') return { apiKey: settings.google_translate_api_key }
  if (provider === 'microsoft') return { apiKey: settings.microsoft_translator_key, region: settings.microsoft_translator_region, endpoint: settings.microsoft_translator_endpoint }
  return { email: settings.mymemory_email }
}
function responseError(status: number, retryAfter = 60): TranslationProviderError {
  const code = status === 429 ? 'PROVIDER_RATE_LIMITED' : status === 456 ? 'PROVIDER_QUOTA_EXCEEDED'
    : status === 401 || status === 403 ? 'PROVIDER_AUTH_FAILED' : status === 413 || status === 414 ? 'PROVIDER_TEXT_TOO_LARGE'
      : status >= 500 ? 'PROVIDER_TEMPORARY_FAILURE' : 'PROVIDER_REQUEST_REJECTED'
  return new TranslationProviderError(code, status === 456 ? 86400 : retryAfter)
}
export function parseProviderResponse(provider: TranslationProvider, payload: unknown, expected: number): string[] {
  const root = object(payload)
  let values: unknown
  if (provider === 'libretranslate') values = Array.isArray(root?.translatedText) ? root.translatedText : [root?.translatedText]
  else if (provider === 'deepl') values = Array.isArray(root?.translations) ? root.translations.map(item => object(item)?.text) : undefined
  else if (provider === 'google') {
    const translations = object(root?.data)?.translations
    values = Array.isArray(translations) ? translations.map(item => object(item)?.translatedText) : undefined
  } else if (provider === 'microsoft') {
    values = Array.isArray(payload) ? payload.map(item => {
      const translations = object(item)?.translations
      return Array.isArray(translations) ? object(translations[0])?.text : undefined
    }) : undefined
  } else {
    if (root?.quotaFinished === true) throw new TranslationProviderError('PROVIDER_QUOTA_EXCEEDED', 86400)
    const status = Number(root?.responseStatus)
    if (status !== 200) throw Number.isFinite(status) && status >= 400 ? responseError(status) : new TranslationProviderError('INVALID_PROVIDER_RESPONSE')
    values = [object(root?.responseData)?.translatedText]
  }
  if (!Array.isArray(values) || values.length !== expected || values.some(value => typeof value !== 'string' || !value.trim() || value.length > 100_000)) throw new TranslationProviderError('INVALID_PROVIDER_RESPONSE')
  return values.map(value => canonicalSourceText(String(value)).trim())
}

export type TranslationOutcome = { translated: string; provider: TranslationProvider; error?: never } | { error: TranslationProviderError; provider: TranslationProvider | null; translated?: never }
const SPLITTABLE = new Set(['TRANSLATION_ENVELOPE_MISMATCH', 'INVALID_PROVIDER_RESPONSE', 'PROVIDER_TEXT_TOO_LARGE'])
const UNAVAILABLE = new Set(['PROVIDER_RATE_LIMITED', 'PROVIDER_QUOTA_EXCEEDED', 'PROVIDER_AUTH_FAILED', 'PROVIDER_NETWORK_FAILURE', 'PROVIDER_TIMEOUT', 'PROVIDER_TEMPORARY_FAILURE'])

/** Reused for one task request, including configuration diagnostics. No hidden background worker. */
export function createTranslationClient(settings: Record<string, unknown>, config = resolveTranslationConfig(settings)) {
  const blocked = new Map<TranslationProvider, TranslationProviderError>()
  const deadline = Date.now() + 90_000 // Leave time to persist rows before their two-minute leases expire.
  let requests = 0
  async function fetchTexts(provider: TranslationProvider, texts: string[]): Promise<string[]> {
    if (blocked.has(provider)) throw blocked.get(provider)!
    const remaining = deadline - Date.now()
    if (requests >= 128 || remaining <= 0) throw new TranslationProviderError('TRANSLATION_RUN_BUDGET_EXCEEDED')
    const request = buildTranslationProviderRequest(provider, providerConfig(provider, settings), texts, 'zh', 'en')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.min(remaining, config.timeoutSeconds * 1000))
    requests++
    try {
      let response: Response
      try {
        response = await fetch(String(request.url), {
          method: String(request.method),
          ...(request.headers === undefined ? {} : { headers: request.headers as HeadersInit }),
          ...(request.body === undefined ? {} : { body: request.body as BodyInit }),
          signal: controller.signal, redirect: 'error',
        })
      } catch { throw new TranslationProviderError(controller.signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_FAILURE') }
      const retryHeader = response.headers.get('retry-after')
      const retry = retryHeader ? (/^\d+$/u.test(retryHeader) ? Number(retryHeader) : Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000)) : 60
      if (!response.ok) throw responseError(response.status, Number.isFinite(retry) ? Math.max(1, Math.min(86400, retry)) : 60)
      let payload: unknown
      try { payload = await response.json() } catch { throw new TranslationProviderError(controller.signal.aborted ? 'PROVIDER_TIMEOUT' : 'INVALID_PROVIDER_RESPONSE') }
      return parseProviderResponse(provider, payload, texts.length)
    } catch (failure) {
      const error = providerFailure(failure)
      if (UNAVAILABLE.has(error.code)) blocked.set(provider, error)
      throw error
    } finally { clearTimeout(timer) }
  }
  async function myMemory(texts: string[]): Promise<string[]> {
    if (texts.length > 1) {
      const envelope = buildTranslationEnvelope(texts, crypto.randomUUID().replaceAll('-', ''))
      if (new TextEncoder().encode(envelope.text).byteLength > MYMEMORY_MAX_BYTES) throw new TranslationProviderError('PROVIDER_TEXT_TOO_LARGE')
      const [value] = await fetchTexts('mymemory', [envelope.text])
      return parseTranslationEnvelope(value!, envelope.markers)
    }
    const chunks = splitTranslationText(texts[0]!)
    const translated: string[] = []
    for (const chunk of chunks) {
      if (!chunk.trim()) { translated.push(chunk); continue }
      const [value] = await fetchTexts('mymemory', [chunk])
      // Preserve explicit paragraph breaks. Space joins avoid glued English words after CJK splits.
      const suffix = /\s+$/u.exec(chunk)?.[0] ?? ' '
      translated.push(value! + suffix)
    }
    return [translated.join('').trim()]
  }
  async function translate(texts: string[]): Promise<TranslationOutcome[]> {
    const results: TranslationOutcome[] = texts.map(() => ({ error: new TranslationProviderError('TRANSLATION_CONFIGURATION_REQUIRED'), provider: null }))
    for (const provider of config.readyProviders) {
      const pending = texts.map((_, index) => index).filter(index => results[index]!.error)
      if (!pending.length) break
      const process = async (indexes: number[]): Promise<void> => {
        try {
          const source = indexes.map(index => texts[index]!)
          const values = provider === 'mymemory' ? await myMemory(source) : await fetchTexts(provider, source)
          indexes.forEach((index, offset) => { results[index] = { translated: values[offset]!, provider } })
        } catch (failure) {
          const error = providerFailure(failure)
          if (indexes.length > 1 && SPLITTABLE.has(error.code)) {
            const middle = Math.ceil(indexes.length / 2)
            await process(indexes.slice(0, middle)); await process(indexes.slice(middle))
          } else indexes.forEach(index => { results[index] = { error, provider } })
        }
      }
      await process(pending)
    }
    return results
  }
  return { translate, get requestCount() { return requests } }
}
