import type { Filter, ListQuery, Sort } from '../../../db/query'
import type { AdminContentModuleDefinition } from '../../../shared/admin/content-modules'
import { AdminContentError } from './content-errors'

export const ADMIN_PAGE_SIZES = Object.freeze([10, 20, 50, 100] as const)
export const ADMIN_DEFAULT_PAGE_SIZE = 20
export const ADMIN_FACET_LIMIT = 40

export interface ParsedAdminContentQuery {
  readonly page: number
  readonly pageSize: number
  readonly search: string
  readonly sort: Sort
  readonly filters: readonly Filter[]
  readonly filterValues: Readonly<Record<string, string>>
}

function singleString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (Array.isArray(value)) throw new AdminContentError('ADMIN_CONTENT_INPUT', `${field} cannot be repeated`)
  if (typeof value !== 'string' && typeof value !== 'number') throw new AdminContentError('ADMIN_CONTENT_INPUT', `${field} is invalid`)
  const text = String(value)
  if (new TextEncoder().encode(text).byteLength > 512) throw new AdminContentError('ADMIN_CONTENT_INPUT', `${field} is too long`)
  return text
}

function positiveInteger(value: unknown, fallback: number, field: string): number {
  const text = singleString(value, field)
  if (text === undefined) return fallback
  if (!/^[1-9][0-9]*$/u.test(text)) throw new AdminContentError('ADMIN_CONTENT_INPUT', `${field} must be a positive integer`)
  const parsed = Number(text)
  if (!Number.isSafeInteger(parsed)) throw new AdminContentError('ADMIN_CONTENT_INPUT', `${field} is outside the supported range`)
  return parsed
}

function parseFilterValue(definition: AdminContentModuleDefinition, field: string, raw: string): Filter {
  const column = definition.columns.find(item => item.field === field)
  const configuredFilter = definition.filters.find(item => item.field === field)
  const fieldDefinition = definition.fields.find(item => item.name === field)
  if (!column || !fieldDefinition) throw new AdminContentError('ADMIN_CONTENT_INPUT', `Unknown filter: ${field}`)
  if (column.kind === 'boolean' || fieldDefinition.kind === 'boolean') {
    if (raw !== 'true' && raw !== 'false') throw new AdminContentError('ADMIN_CONTENT_INPUT', `Invalid boolean filter: ${field}`)
    return { field, op: 'eq', value: raw === 'true' }
  }
  if (column.kind === 'integer' || fieldDefinition.kind === 'integer') {
    if (!/^-?(?:0|[1-9][0-9]*)$/u.test(raw)) throw new AdminContentError('ADMIN_CONTENT_INPUT', `Invalid integer filter: ${field}`)
    const value = Number(raw)
    if (!Number.isSafeInteger(value)) throw new AdminContentError('ADMIN_CONTENT_INPUT', `Integer filter is outside the supported range: ${field}`)
    return { field, op: 'eq', value }
  }
  const options = configuredFilter?.options ?? fieldDefinition.options
  if (options && !options.some(option => option.value === raw)) throw new AdminContentError('ADMIN_CONTENT_INPUT', `Unknown filter option: ${field}`)
  if (configuredFilter || options || ['visibility', 'status'].includes(column.kind)) return { field, op: 'eq', value: raw }
  return { field, op: 'contains', value: raw }
}

export function parseAdminContentQuery(definition: AdminContentModuleDefinition, input: Record<string, unknown>): ParsedAdminContentQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Query object is invalid')
  const allowed = new Set(['q', 'page', 'pageSize', 'sort', 'direction', ...definition.columns.filter(item => item.filterable !== false).map(item => `f_${item.field}`)])
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new AdminContentError('ADMIN_CONTENT_INPUT', `Unknown query parameter: ${key}`)

  const page = positiveInteger(input.page, 1, 'page')
  const pageSize = positiveInteger(input.pageSize, ADMIN_DEFAULT_PAGE_SIZE, 'pageSize')
  if (!ADMIN_PAGE_SIZES.includes(pageSize as (typeof ADMIN_PAGE_SIZES)[number])) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Unsupported page size')
  if ((page - 1) * pageSize > 10_000) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Requested page is outside the supported range')

  const search = (singleString(input.q, 'q') ?? '').trim().normalize('NFC')
  if (new TextEncoder().encode(search).byteLength > 256) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Search text is too long')

  const requestedSort = singleString(input.sort, 'sort')
  const selectedSortField = requestedSort ?? definition.defaultSort.field
  if (requestedSort && !definition.columns.some(item => item.field === requestedSort && item.sortable !== false)) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Unknown sort field')
  const requestedDirection = singleString(input.direction, 'direction')
  if (requestedDirection !== undefined && requestedDirection !== 'asc' && requestedDirection !== 'desc') throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Invalid sort direction')
  const sort: Sort = { field: selectedSortField, direction: requestedDirection ?? (selectedSortField === definition.defaultSort.field ? definition.defaultSort.direction : 'asc') }

  const filters: Filter[] = []
  const filterValues: Record<string, string> = Object.create(null) as Record<string, string>
  for (const column of definition.columns) {
    if (column.filterable === false) continue
    const raw = singleString(input[`f_${column.field}`], `f_${column.field}`)
    if (raw === undefined) continue
    filters.push(parseFilterValue(definition, column.field, raw))
    filterValues[column.field] = raw
  }

  return Object.freeze({ page, pageSize, search, sort, filters: Object.freeze(filters), filterValues: Object.freeze(filterValues) })
}

export function toRepositoryListQuery(query: ParsedAdminContentQuery): ListQuery {
  return {
    filters: query.filters,
    sort: [query.sort],
    ...(query.search ? { search: query.search } : {}),
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  }
}
