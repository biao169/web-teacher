import type { PublicCitationStyle } from '../../../shared/contracts/public-citation'
import type { PublicPageSize, PublicNavigationScope } from '../../../shared/contracts/public-content'
import { PUBLIC_PAGE_SIZES } from '../../../shared/contracts/public-content'
import type { SiteLocale } from '../../../shared/contracts/i18n'
import { hasUnpairedSurrogate } from '../../../shared/utils/unicode'
import { encodePublicListQuery, unpackPublicListQuery } from '../../../shared/utils/public-list-link'
import { PublicSiteError } from './errors'

const encoder = new TextEncoder()
const PAGE_SIZE_SET = new Set<number>(PUBLIC_PAGE_SIZES)
const CONTROL = /[\u0000-\u001f\u007f]/u

export type PublicListRequest = {
  locale: SiteLocale
  page: number
  pageSize: PublicPageSize
  search: string | null
  filters: Readonly<Record<string, string>>
  scope?: PublicNavigationScope
  /** Internal exact membership selection; never accepted by the normal list query parser. */
  selectedUids?: readonly string[]
  /** Only the bounded publication selection endpoint accepts this control. */
  citationStyle?: PublicCitationStyle
}

function single(value: unknown, key: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (Array.isArray(value)) throw new PublicSiteError('PUBLIC_INPUT', `${key} must be supplied once`)
  if (typeof value !== 'string' && typeof value !== 'number') throw new PublicSiteError('PUBLIC_INPUT', `${key} is invalid`)
  return String(value)
}

function positiveInteger(value: unknown, key: string, fallback: number, maximum: number): number {
  const raw = single(value, key)
  if (raw === undefined) return fallback
  if (!/^[1-9]\d*$/u.test(raw)) throw new PublicSiteError('PUBLIC_INPUT', `${key} must be a positive integer`)
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed > maximum) throw new PublicSiteError('PUBLIC_LIMIT', `${key} is outside the supported range`)
  return parsed
}

function bounded(value: unknown, key: string, maxBytes: number): string | null {
  const raw = single(value, key)
  if (raw === undefined) return null
  const selected = raw.trim().normalize('NFC')
  if (!selected) return null
  if (hasUnpairedSurrogate(selected) || CONTROL.test(selected) || encoder.encode(selected).byteLength > maxBytes) {
    throw new PublicSiteError('PUBLIC_LIMIT', `${key} exceeds its supported length`)
  }
  return selected
}

export function parsePublicLocale(value: unknown): SiteLocale {
  const locale = single(value, 'locale')
  if (locale !== 'zh' && locale !== 'en') throw new PublicSiteError('PUBLIC_INPUT', 'locale must be zh or en')
  return locale
}

export function parsePublicListRequest(
  query: Readonly<Record<string, unknown>>,
  allowedFilters: readonly string[],
  options: { fixedFilters?: Readonly<Record<string, string>> } = {},
): PublicListRequest {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw new PublicSiteError('PUBLIC_INPUT', 'Invalid public list query')
  try { query = unpackPublicListQuery(query) }
  catch { throw new PublicSiteError('PUBLIC_INPUT', 'Invalid or ambiguous filter envelope') }
  const allowed = new Set(['locale', 'page', 'pageSize', 'q', ...allowedFilters])
  for (const key of Object.keys(query)) if (!allowed.has(key)) throw new PublicSiteError('PUBLIC_INPUT', `Unsupported public query parameter: ${key}`)
  const locale = parsePublicLocale(query.locale)
  const page = positiveInteger(query.page, 'page', 1, 100_000)
  const pageSizeNumber = positiveInteger(query.pageSize, 'pageSize', 12, 36)
  if (!PAGE_SIZE_SET.has(pageSizeNumber)) throw new PublicSiteError('PUBLIC_INPUT', 'pageSize must be 12, 24 or 36')
  const filters: Record<string, string> = {}
  for (const key of allowedFilters) {
    const value = bounded(query[key], key, 192)
    if (value !== null) filters[key] = value
  }
  for (const [key, value] of Object.entries(options.fixedFilters ?? {})) {
    if (!allowedFilters.includes(key) || typeof value !== 'string' || !value) throw new PublicSiteError('PUBLIC_INPUT', 'Invalid fixed public filter')
    if (filters[key] !== undefined && filters[key] !== value) throw new PublicSiteError('PUBLIC_INPUT', `${key} is fixed for this route`)
    filters[key] = value
  }
  const offset = (page - 1) * pageSizeNumber
  if (!Number.isSafeInteger(offset) || offset > 10_000) throw new PublicSiteError('PUBLIC_LIMIT', 'Requested page is outside the supported range')
  return {
    locale,
    page,
    pageSize: pageSizeNumber as PublicPageSize,
    search: bounded(query.q, 'q', 256),
    filters: Object.freeze(filters),
  }
}

export function canonicalListResource(module: string, request: PublicListRequest): string {
  const parameters = new URLSearchParams()
  parameters.set('page', String(request.page))
  parameters.set('pageSize', String(request.pageSize))
  if (request.search) parameters.set('q', request.search)
  for (const key of Object.keys(request.filters).sort()) parameters.set(key, request.filters[key]!)
  return `${module}?${parameters.toString()}`
}

export function publicListPath(module: string, request: PublicListRequest, locale = request.locale): string {
  const filters = { ...request.filters }
  if (module === 'publications/featured') delete filters.featured
  const query = encodePublicListQuery({ page: request.page, pageSize: request.pageSize, q: request.search, ...filters, nav: request.scope?.uid })
  return `/${locale}/${module}${query ? `?${query}` : ''}`
}

export function sqlSearchPattern(search: string | null): string | null {
  if (!search) return null
  return `%${search.replace(/[\\%_]/gu, value => `\\${value}`)}%`
}

export function parsePublicLocaleQuery(query: Readonly<Record<string, unknown>>): SiteLocale {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw new PublicSiteError('PUBLIC_INPUT', 'Invalid public locale query')
  for (const key of Object.keys(query)) if (key !== 'locale') throw new PublicSiteError('PUBLIC_INPUT', `Unsupported public query parameter: ${key}`)
  return parsePublicLocale(query.locale)
}
