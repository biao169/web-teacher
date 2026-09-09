import type { DatabaseAdapter, RawRow, SqlCommand } from '../../../db/contracts'
import { DATABASE_LIMITS } from '../../../db/contracts'
import { read } from '../../../db/query'
import { I18nError } from '../../i18n/errors'
import { canonicalSourceText } from '../../i18n/fingerprint'
import { parseSourceRefKey } from '../../i18n/source-ref'

const MAX_BATCH_RESULT_TEXT_BYTES = 8 * 1024 * 1024
const encoder = new TextEncoder()

export interface CurrentTranslationRecord {
  sourceRefKey: string
  sourceHash: string
  sourceText: string
  sourceLang: 'zh'
  targetLang: 'en'
  translatedText: string
  isManual: boolean
  updatedAt: string
}

function required(row: RawRow, name: string): string | number | null {
  if (!Object.hasOwn(row, name)) throw new I18nError('I18N_PROTOCOL', `Translation row is missing ${name}`)
  return row[name]!
}
function text(row: RawRow, name: string): string {
  const value = required(row, name)
  if (typeof value !== 'string') throw new I18nError('I18N_PROTOCOL', `Translation field ${name} is invalid`)
  return value
}
function boolean(row: RawRow, name: string): boolean {
  const value = required(row, name)
  if (value !== 0 && value !== 1) throw new I18nError('I18N_PROTOCOL', `Translation field ${name} is invalid`)
  return value === 1
}
function isoTimestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || new Date(value).toISOString() !== value) {
    throw new I18nError('I18N_PROTOCOL', 'Stored translation timestamp is invalid')
  }
  return value
}
function parseRecord(row: RawRow): CurrentTranslationRecord {
  const sourceRefKey = text(row, 'source_ref_key')
  parseSourceRefKey(sourceRefKey)
  const sourceHash = text(row, 'source_hash')
  if (!/^[a-f0-9]{64}$/u.test(sourceHash)) throw new I18nError('I18N_PROTOCOL', 'Stored translation source hash is invalid')
  const sourceLang = text(row, 'source_lang')
  const targetLang = text(row, 'target_lang')
  if (sourceLang !== 'zh' || targetLang !== 'en') throw new I18nError('I18N_PROTOCOL', 'Stored translation language pair is invalid')
  const translatedText = canonicalSourceText(text(row, 'translated_text'))
  if (!translatedText.trim()) throw new I18nError('I18N_PROTOCOL', 'Current translation text is empty')
  return {
    sourceRefKey,
    sourceHash,
    sourceText: canonicalSourceText(text(row, 'source_text')),
    sourceLang,
    targetLang,
    translatedText,
    isManual: boolean(row, 'is_manual'),
    updatedAt: isoTimestamp(text(row, 'updated_at')),
  }
}

export class TranslationStore {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async currentBySourceRefs(sourceRefKeys: readonly string[], targetLang: 'en' = 'en'): Promise<ReadonlyMap<string, CurrentTranslationRecord>> {
    if (targetLang !== 'en') throw new I18nError('I18N_INPUT', 'Unsupported translation target language')
    if (!Array.isArray(sourceRefKeys) || sourceRefKeys.length > 500) throw new I18nError('I18N_LIMIT', 'Too many translation references')
    const keys = [...new Set(sourceRefKeys)]
    for (const key of keys) parseSourceRefKey(key)
    if (keys.length === 0) return new Map()

    const commands: SqlCommand[] = []
    const chunkSize = Math.min(DATABASE_LIMITS.keyChunk, DATABASE_LIMITS.parameters - 1)
    for (let start = 0; start < keys.length; start += chunkSize) {
      const chunk = keys.slice(start, start + chunkSize)
      commands.push(read(`SELECT source_ref_key, source_hash, source_text, source_lang, target_lang,
          translated_text, is_manual, updated_at
        FROM translation_cache
        WHERE source_ref_key IN (${chunk.map(() => '?').join(', ')})
          AND target_lang = ? AND is_current = 1 AND status = 'success'
          AND translated_text IS NOT NULL
        ORDER BY source_ref_key ASC`, [...chunk, targetLang]))
    }
    const results = await this.adapter.batch(commands)
    if (results.length !== commands.length) throw new I18nError('I18N_PROTOCOL', 'Translation batch result is incomplete')
    const requested = new Set(keys)
    const records = new Map<string, CurrentTranslationRecord>()
    let resultTextBytes = 0
    for (const row of results.flatMap(result => result.rows)) {
      const record = parseRecord(row)
      resultTextBytes += encoder.encode(record.sourceText).byteLength + encoder.encode(record.translatedText).byteLength
      if (!Number.isSafeInteger(resultTextBytes) || resultTextBytes > MAX_BATCH_RESULT_TEXT_BYTES) {
        throw new I18nError('I18N_LIMIT', 'Translation result text budget exceeded')
      }
      if (!requested.has(record.sourceRefKey)) throw new I18nError('I18N_PROTOCOL', 'Translation query returned an unexpected reference')
      if (records.has(record.sourceRefKey)) throw new I18nError('I18N_PROTOCOL', 'Multiple current translations exist for one source reference')
      records.set(record.sourceRefKey, record)
    }
    return records
  }
}
