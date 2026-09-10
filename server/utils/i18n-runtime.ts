import type { H3Event } from 'h3'
import { TranslationBatchReader } from '../services/i18n/translation-reader'
import { TranslationStore } from '../services/i18n/translation-store'
import { useDatabase } from './database'

export function useTranslationReader(event: H3Event): TranslationBatchReader {
  event.context.translationReader ??= new TranslationBatchReader(new TranslationStore(useDatabase(event).adapter))
  return event.context.translationReader
}
