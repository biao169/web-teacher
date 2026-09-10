import type { LocalizedFieldRequest, LocalizedTextResult, SiteLocale } from '../../../shared/contracts/i18n'
import { canonicalSourceText, translationSourceHash } from '../../i18n/fingerprint'
import { I18nError } from '../../i18n/errors'
import { parseSourceRefKey } from '../../i18n/source-ref'
import type { TranslationStore } from './translation-store'

const MAX_FIELDS = 500
const MAX_BATCH_TEXT_BYTES = 8 * 1024 * 1024
const encoder = new TextEncoder()
interface PreparedField {
  sourceRefKey: string
  sourceText: string | null
  manualText: string | null
}

function optionalText(value: string | null | undefined, name: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new I18nError('I18N_INPUT', `${name} must be a string or null`)
  return canonicalSourceText(value)
}
function prepare(request: LocalizedFieldRequest): PreparedField {
  if (!request || typeof request !== 'object') throw new I18nError('I18N_INPUT', 'Invalid localized field request')
  parseSourceRefKey(request.sourceRefKey)
  if (request.sourceLang !== undefined && request.sourceLang !== 'zh') throw new I18nError('I18N_INPUT', 'Unsupported translation source language')
  if (request.targetLang !== undefined && request.targetLang !== 'en') throw new I18nError('I18N_INPUT', 'Unsupported translation target language')
  return {
    sourceRefKey: request.sourceRefKey,
    sourceText: optionalText(request.sourceText, 'sourceText'),
    manualText: optionalText(request.manualText, 'manualText'),
  }
}

export class TranslationBatchReader {
  constructor(private readonly store: TranslationStore) {}

  async localize(locale: SiteLocale, requests: readonly LocalizedFieldRequest[]): Promise<LocalizedTextResult[]> {
    if (locale !== 'zh' && locale !== 'en') throw new I18nError('I18N_INPUT', 'Unsupported site locale')
    if (!Array.isArray(requests) || requests.length > MAX_FIELDS) throw new I18nError('I18N_LIMIT', 'Too many localized fields')
    const prepared: PreparedField[] = []
    let batchTextBytes = 0
    for (const request of requests) {
      const item = prepare(request)
      batchTextBytes += item.sourceText === null ? 0 : encoder.encode(item.sourceText).byteLength
      batchTextBytes += item.manualText === null ? 0 : encoder.encode(item.manualText).byteLength
      if (!Number.isSafeInteger(batchTextBytes) || batchTextBytes > MAX_BATCH_TEXT_BYTES) {
        throw new I18nError('I18N_LIMIT', 'Localized field text budget exceeded')
      }
      prepared.push(item)
    }

    const definitions = new Map<string, Pick<PreparedField, 'sourceText' | 'manualText'>>()
    for (const item of prepared) {
      const previous = definitions.get(item.sourceRefKey)
      if (previous && (previous.sourceText !== item.sourceText || previous.manualText !== item.manualText)) {
        throw new I18nError('I18N_INPUT', 'One source reference was requested with conflicting text')
      }
      definitions.set(item.sourceRefKey, { sourceText: item.sourceText, manualText: item.manualText })
    }

    if (locale === 'zh') {
      return prepared.map(item => item.sourceText === null
        ? { text: null, origin: 'empty' }
        : { text: item.sourceText, origin: 'source' })
    }

    const candidates = prepared.filter(item => item.sourceText !== null && !(item.manualText?.trim()))
    const records = await this.store.currentBySourceRefs(candidates.map(item => item.sourceRefKey), 'en')
    const hashes = new Map<string, Promise<string>>()
    const hash = (text: string): Promise<string> => {
      let promise = hashes.get(text)
      if (!promise) { promise = translationSourceHash(text); hashes.set(text, promise) }
      return promise
    }

    return Promise.all(prepared.map(async (item): Promise<LocalizedTextResult> => {
      if (item.manualText?.trim()) return { text: item.manualText, origin: 'manual' }
      if (item.sourceText === null) return { text: null, origin: 'empty' }
      const record = records.get(item.sourceRefKey)
      if (record
        && record.sourceHash === await hash(item.sourceText)
        && record.sourceText === item.sourceText
        && record.sourceLang === 'zh'
        && record.targetLang === 'en') {
        return { text: record.translatedText, origin: record.isManual ? 'manual' : 'cache' }
      }
      return { text: item.sourceText, origin: 'source' }
    }))
  }
}
