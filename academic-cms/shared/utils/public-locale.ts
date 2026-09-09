import type { SupportedLocale } from './locale-path'

export const PUBLIC_LOCALE_COOKIE = 'academic-cms-locale'
export const PUBLIC_LOCALE_COOKIE_OPTIONS = { path: '/', sameSite: 'lax' as const, maxAge: 365 * 24 * 60 * 60 }
export const PUBLIC_LOCALE_DEFAULTS = {
  chineseRegions: 'CN,HK,MO,TW', fallback: 'en' as SupportedLocale,
  geoIpUrl: 'https://api.country.is', geoIpTimeoutMs: 1000,
}

export function savedPublicLocale(value: unknown): SupportedLocale | null {
  return value === 'zh' || value === 'en' ? value : null
}

export function publicCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/u.test(code) && !['XX', 'ZZ'].includes(code) ? code : null
}

/** A browser preference is only a fallback when IP country is unavailable. */
export function browserPublicLocale(header: unknown): SupportedLocale | null {
  if (typeof header !== 'string' || header.length > 2048) return null
  const options = header.split(',').slice(0, 32).map((item, index) => {
    const match = /^\s*(zh|en)(?:-[a-z0-9]+)*\s*(?:;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/iu.exec(item)
    return match ? { locale: match[1]!.toLowerCase() as SupportedLocale, quality: Number(match[2] ?? 1), index } : null
  }).filter((item): item is NonNullable<typeof item> => item !== null).filter(item => item.quality > 0)
  return options.sort((a, b) => b.quality - a.quality || a.index - b.index)[0]?.locale ?? null
}

export function defaultPublicLocale(input: { preference?: unknown; country?: unknown; acceptLanguage?: unknown; chineseRegions?: unknown; fallback?: unknown }): SupportedLocale {
  const preference = savedPublicLocale(input.preference)
  if (preference) return preference
  const country = publicCountryCode(input.country)
  const configured = typeof input.chineseRegions === 'string' ? input.chineseRegions.split(/[,;\s]+/u).map(publicCountryCode).filter(Boolean) : []
  const regions = configured.length ? configured : PUBLIC_LOCALE_DEFAULTS.chineseRegions.split(',')
  if (country) return regions.includes(country) ? 'zh' : 'en'
  return browserPublicLocale(input.acceptLanguage) ?? savedPublicLocale(input.fallback) ?? PUBLIC_LOCALE_DEFAULTS.fallback
}
