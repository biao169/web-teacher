import { hasUnpairedSurrogate } from '../../shared/utils/unicode'
import { sha256Hex } from '../view-model/serializer'
import { I18nError } from './errors'

const encoder = new TextEncoder()
const MAX_SOURCE_BYTES = 1_000_000

export function canonicalSourceText(value: string): string {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) throw new I18nError('I18N_INPUT', 'Translation source text must be a string')
  const canonical = value.normalize('NFC').replace(/\r\n?/gu, '\n')
  if (encoder.encode(canonical).byteLength > MAX_SOURCE_BYTES) throw new I18nError('I18N_LIMIT', 'Translation source text is too large')
  return canonical
}

export async function translationSourceHash(sourceText: string, sourceLang: 'zh' = 'zh'): Promise<string> {
  if (sourceLang !== 'zh') throw new I18nError('I18N_INPUT', 'Unsupported translation source language')
  return sha256Hex(`translation-source-v1\u0000${sourceLang}\u0000${canonicalSourceText(sourceText)}`)
}
