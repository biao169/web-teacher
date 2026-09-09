import type { SiteLocale } from '../../../shared/contracts/i18n'
import type { MediaViewModel } from '../../../shared/contracts/media'
import type { PublicMedia } from '../../../shared/contracts/public-site'
import { hasUnpairedSurrogate } from '../../../shared/utils/unicode'
import { PublicSiteError } from './errors'

const encoder = new TextEncoder()
const CONTROL = /[\u0000-\u001f\u007f]/u

export function publicNow(clock: () => Date): Date {
  const value = clock()
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Public site clock is invalid')
  return value
}

export function normalizedConfiguredText(value: string, label: string, maxBytes = 1_024): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value !== value.normalize('NFC')
    || hasUnpairedSurrogate(value) || CONTROL.test(value) || encoder.encode(value).byteLength > maxBytes) {
    throw new PublicSiteError('PUBLIC_INPUT', `Invalid ${label}`)
  }
  return value
}

export function plainText(value: string | null, maxBytes = 64_000): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || hasUnpairedSurrogate(value) || encoder.encode(value).byteLength > maxBytes) {
    throw new PublicSiteError('PUBLIC_PROTOCOL', 'Public text exceeds its safety budget')
  }
  const text = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&(?:nbsp|ensp|emsp);/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/[ \t\f\v]+/gu, ' ')
    .replace(/ *\n+ */gu, '\n')
    .trim()
  return text || null
}

export function excerpt(value: string | null, maximumCodePoints = 220, maxBytes = 64_000): string | null {
  const text = plainText(value, maxBytes)
  if (!text) return null
  const points = Array.from(text.replace(/\s+/gu, ' '))
  return points.length <= maximumCodePoints ? points.join('') : `${points.slice(0, maximumCodePoints).join('').trimEnd()}…`
}

export function boundedList(value: string | null, maximum = 12, itemBytes = 192): string[] {
  if (!value) return []
  const output: string[] = []
  const seen = new Set<string>()
  for (const raw of value.split(/[,;|\n，；、]/u)) {
    const item = raw.trim().normalize('NFC')
    if (!item || hasUnpairedSurrogate(item) || CONTROL.test(item) || encoder.encode(item).byteLength > itemBytes || seen.has(item)) continue
    seen.add(item)
    output.push(item)
    if (output.length >= maximum) break
  }
  return output
}

export function safeExternalUrl(value: string | null): string | null {
  if (!value || value !== value.trim() || value !== value.normalize('NFC') || hasUnpairedSurrogate(value)
    || /[\\\u0000-\u001f\u007f]/u.test(value) || encoder.encode(value).byteLength > 2_048) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.toString()
  }
  catch { return null }
}

export function safeMailAddress(value: string | null): string | null {
  if (!value || value !== value.trim() || encoder.encode(value).byteLength > 320 || CONTROL.test(value)) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value) ? value : null
}

export function safeDoi(value: string | null): string | null {
  if (!value) return null
  const normalized = value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '')
  if (!/^10\.\d{4,9}\/[!-~]{1,512}$/u.test(normalized) || /[<>"\\]/u.test(normalized)) return null
  return normalized
}

export function publicMedia(value: MediaViewModel): PublicMedia {
  if (!value.available) return { available: false, fallback: value.fallback, alt: value.alt, kind: value.kind }
  return {
    available: true,
    url: value.url,
    alt: value.alt,
    title: value.title,
    kind: value.kind,
    mimeType: value.mimeType,
    size: value.size,
    width: value.width,
    height: value.height,
    disposition: value.disposition,
    downloadAllowed: value.downloadAllowed,
    cacheScope: value.cacheScope,
    purpose: value.purpose,
  }
}

export function missingPublicMedia(kind: 'image' | 'video' | 'pdf' | 'file', alt = '', fallback: 'initials' | 'placeholder' | 'none' = 'none'): PublicMedia {
  return { available: false, fallback, alt, kind }
}

export function localizedPublicMedia(value: MediaViewModel | undefined, alt: string, kind: 'image' | 'video' | 'pdf' | 'file', fallback: 'initials' | 'placeholder' | 'none'): PublicMedia {
  if (!value) return missingPublicMedia(kind, alt, fallback)
  return { ...publicMedia(value), alt }
}

export function localizedDate(value: string | null, locale: SiteLocale): string | null {
  if (!value) return null
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  if (!Number.isFinite(date.getTime())) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Invalid public date')
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric', month: locale === 'zh' ? 'numeric' : 'short', day: 'numeric', timeZone: 'UTC',
  }).format(date)
}

export function periodLabel(start: string | null, end: string | null, locale: SiteLocale): string | null {
  if (!start && !end) return null
  const startLabel = localizedDate(start, locale)
  const endLabel = localizedDate(end, locale)
  if (startLabel && endLabel) return `${startLabel} – ${endLabel}`
  if (startLabel) return locale === 'zh' ? `${startLabel}起` : `Since ${startLabel}`
  return locale === 'zh' ? `截至${endLabel}` : `Until ${endLabel}`
}

export function safeRecordIdentifier(value: string): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value !== value.normalize('NFC')
    || hasUnpairedSurrogate(value) || CONTROL.test(value) || /[%\\/?#]/u.test(value)
    || encoder.encode(value).byteLength > 256 || value === '.' || value === '..') {
    throw new PublicSiteError('PUBLIC_INPUT', 'Invalid public record identifier')
  }
  return value
}
