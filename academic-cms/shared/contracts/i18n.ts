export const SITE_LOCALES = ['zh', 'en'] as const
export type SiteLocale = (typeof SITE_LOCALES)[number]

export interface LocalizedFieldRequest {
  /** Canonical source reference built by buildSourceRefKey(). */
  sourceRefKey: string
  sourceText: string | null
  /** Human-maintained English field from the business table, when present. */
  manualText?: string | null
  sourceLang?: 'zh'
  targetLang?: 'en'
}

export interface LocalizedTextResult {
  text: string | null
  origin: 'manual' | 'cache' | 'source' | 'empty'
}
