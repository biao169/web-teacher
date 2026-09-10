import type {
  PublicBreadcrumb,
  PublicFilterGroup,
  PublicFilterOption,
  PublicListQueryView,
  PublicPageMeta,
  PublicPagination,
} from '../../../shared/contracts/public-content'
import type { PublicMedia } from '../../../shared/contracts/public-site'
import type { SiteLocale } from '../../../shared/contracts/i18n'
import type { QueryResult, RawRow } from '../../../db/contracts'
import { rowInteger, rowRequiredText } from './public-row'
import { PublicSiteError } from './errors'
import type { PublicListRequest } from './public-query'

export function pagination(request: PublicListRequest, totalItems: number): PublicPagination {
  if (!Number.isSafeInteger(totalItems) || totalItems < 0 || totalItems > 10_000_000) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Invalid public pagination total')
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / request.pageSize)
  if (request.page > Math.max(1, totalPages)) throw new PublicSiteError('PUBLIC_NOT_FOUND', 'Public result page was not found')
  const from = totalItems === 0 ? 0 : (request.page - 1) * request.pageSize + 1
  const to = from === 0 ? 0 : Math.min(totalItems, from + request.pageSize - 1)
  return {
    page: request.page,
    pageSize: request.pageSize,
    totalItems,
    totalPages,
    from,
    to,
    previousPage: request.page > 1 && totalPages > 0 ? request.page - 1 : null,
    nextPage: request.page < totalPages ? request.page + 1 : null,
  }
}

export function queryView(request: PublicListRequest): PublicListQueryView {
  return { search: request.search, filters: { ...request.filters }, ...(request.scope ? { scope: request.scope } : {}) }
}

export function pageMeta(input: {
  locale: SiteLocale
  title: string
  description: string
  path: string
  alternatePath: string
  sectionLabel?: string
  sectionPath?: string
  image?: PublicMedia | null
  type?: PublicPageMeta['type']
}): PublicPageMeta {
  const home = input.locale === 'zh' ? { label: '首页', href: '/zh' } : { label: 'Home', href: '/en' }
  const breadcrumbs: PublicBreadcrumb[] = [home]
  if (input.sectionLabel && input.sectionPath && input.sectionPath !== input.path) breadcrumbs.push({ label: input.sectionLabel, href: input.sectionPath })
  breadcrumbs.push({ label: input.title, href: input.path })
  return {
    title: input.title,
    description: input.description,
    path: input.path,
    alternatePath: input.alternatePath,
    breadcrumbs,
    image: input.image ?? null,
    type: input.type ?? 'website',
  }
}

export type RawFacet = { key: string; value: string; count: number }

export function parseFacetRows(result: QueryResult, allowed: readonly string[], maximumPerGroup = 40): RawFacet[] {
  if (result.rows.length > allowed.length * maximumPerGroup) throw new PublicSiteError('PUBLIC_LIMIT', 'Public filter query exceeded its row budget')
  const output: RawFacet[] = []
  const seen = new Set<string>()
  for (const row of result.rows) {
    const key = rowRequiredText(row, 'filter_key', 64)
    const value = rowRequiredText(row, 'value', 192)
    const count = rowInteger(row, 'total', 1, 10_000_000)!
    if (!allowed.includes(key)) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Public filter query returned an unknown key')
    const identity = `${key}\u0000${value}`
    if (seen.has(identity)) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Public filter query returned a duplicate option')
    seen.add(identity)
    output.push({ key, value, count })
  }
  return output
}

export function filterGroups(
  raw: readonly RawFacet[],
  request: PublicListRequest,
  labels: Readonly<Record<string, string>>,
  localizeValue: (key: string, value: string) => string = (_key, value) => value,
): PublicFilterGroup[] {
  return Object.entries(labels).filter(([key]) => !Object.hasOwn(request.scope?.filters ?? {}, key)).map(([key, label]) => {
    const options: PublicFilterOption[] = raw
      .filter(item => item.key === key)
      .map(item => ({
        value: item.value,
        label: localizeValue(key, item.value),
        count: item.count,
        selected: request.filters[key] === item.value,
      }))
    const selected = request.filters[key]
    if (selected && !options.some(item => item.value === selected)) {
      options.unshift({ value: selected, label: localizeValue(key, selected), count: 0, selected: true })
    }
    return { key, label, options }
  }).filter(group => group.options.length > 0)
}

export function facetRow(row: RawRow): RawFacet {
  return {
    key: rowRequiredText(row, 'filter_key', 64),
    value: rowRequiredText(row, 'value', 192),
    count: rowInteger(row, 'total', 1, 10_000_000)!,
  }
}
