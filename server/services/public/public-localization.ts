import type { LocalizedFieldRequest, LocalizedTextResult, SiteLocale } from '../../../shared/contracts/i18n'
import { buildSourceRefKey } from '../../i18n/source-ref'
import type { TranslationBatchReader } from '../i18n/translation-reader'
import { PublicSiteError } from './errors'

export type PublicTranslationSlot = number

export class PublicTranslationPlan {
  readonly requests: LocalizedFieldRequest[] = []

  add(entity: string, uid: string, field: string, sourceText: string | null, manualText?: string | null): PublicTranslationSlot {
    this.requests.push({
      sourceRefKey: buildSourceRefKey({ entity, uid, field }),
      sourceText,
      ...(manualText === undefined ? {} : { manualText }),
    })
    return this.requests.length - 1
  }

  async resolve(reader: TranslationBatchReader, locale: SiteLocale, batchSize = this.requests.length || 1): Promise<PublicTranslations> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Invalid translation batch size')
    const values: LocalizedTextResult[] = []
    for (let offset = 0; offset < this.requests.length; offset += batchSize) {
      const requests = this.requests.slice(offset, offset + batchSize)
      const batch = await reader.localize(locale, requests)
      if (batch.length !== requests.length) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Translation result is incomplete')
      values.push(...batch)
    }
    return new PublicTranslations(values)
  }
}

export class PublicTranslations {
  constructor(private readonly values: readonly LocalizedTextResult[]) {}

  text(slot: PublicTranslationSlot, fallback: string | null = null): string | null {
    const value = this.values[slot]
    if (!value) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Translation result is incomplete')
    return value.text ?? fallback
  }

  required(slot: PublicTranslationSlot, fallback: string): string {
    return this.text(slot, fallback)?.trim() || fallback
  }
}
