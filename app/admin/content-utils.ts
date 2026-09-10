import type {
  AdminContentModuleDefinition,
  AdminContentValue,
  AdminFieldDefinition,
  AdminListColumn,
} from '~~/shared/admin/content-modules'
import { adminStatusTagType, formatAdminDate, formatAdminDateTime } from '~/admin/formatters'

export const ADMIN_CONTENT_PAGE_SIZES = Object.freeze([10, 20, 50, 100] as const)

export function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

export function contentListApiQuery(
  definition: AdminContentModuleDefinition,
  query: Readonly<Record<string, unknown>>,
): Record<string, string | number> {
  const result: Record<string, string | number> = Object.create(null) as Record<string, string | number>
  const q = firstQueryValue(query.q)?.trim()
  const page = Number(firstQueryValue(query.page) ?? '1')
  const pageSize = Number(firstQueryValue(query.pageSize) ?? '20')
  const sort = firstQueryValue(query.sort)
  const direction = firstQueryValue(query.direction)
  if (q) result.q = q
  result.page = Number.isSafeInteger(page) && page > 0 ? page : 1
  result.pageSize = ADMIN_CONTENT_PAGE_SIZES.includes(pageSize as (typeof ADMIN_CONTENT_PAGE_SIZES)[number]) ? pageSize : 20
  if (sort && definition.columns.some(item => item.field === sort && item.sortable !== false)) result.sort = sort
  if ((direction === 'asc' || direction === 'desc') && result.sort) result.direction = direction
  for (const column of definition.columns) {
    if (column.filterable === false) continue
    const value = firstQueryValue(query[`f_${column.field}`])
    if (value !== undefined && value !== '') result[`f_${column.field}`] = value
  }
  return result
}

export function contentListRouteQuery(
  definition: AdminContentModuleDefinition,
  values: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const normalized = contentListApiQuery(definition, values)
  const result: Record<string, string> = Object.create(null) as Record<string, string>
  for (const [key, value] of Object.entries(normalized)) {
    if (key === 'page' && value === 1) continue
    if (key === 'pageSize' && value === 20) continue
    result[key] = String(value)
  }
  return result
}

export function contentRecordPath(definition: AdminContentModuleDefinition, uid: string): string {
  return `${definition.path}/${encodeURIComponent(uid)}`
}

export function contentCreatePath(definition: AdminContentModuleDefinition): string {
  return `${definition.path}/new`
}

export function defaultFieldValue(field: AdminFieldDefinition): AdminContentValue {
  if (field.defaultValue !== undefined) return field.defaultValue
  if (field.nullable) return null
  if (field.kind === 'boolean') return false
  if (field.kind === 'integer') return 0
  return ''
}

export function writableFieldValues(
  definition: AdminContentModuleDefinition,
  source: Readonly<Record<string, unknown>>,
): Record<string, AdminContentValue> {
  const values: Record<string, AdminContentValue> = Object.create(null) as Record<string, AdminContentValue>
  for (const field of definition.fields) {
    if (field.readOnly) continue
    const value = source[field.name]
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') values[field.name] = value
    else values[field.name] = defaultFieldValue(field)
  }
  return values
}

function sameAdminContentValue(left: AdminContentValue | undefined, right: AdminContentValue | undefined): boolean {
  return Object.is(left ?? null, right ?? null)
}

/**
 * Builds a PATCH payload from the fields that changed since the last server
 * version. Sending only changed fields reduces request size, audit noise and
 * the chance of accidentally rewriting unrelated nullable values.
 */
export function changedWritableFieldValues(
  definition: AdminContentModuleDefinition,
  source: Readonly<Record<string, unknown>>,
  baseline: Readonly<Record<string, AdminContentValue>>,
): Record<string, AdminContentValue> {
  const current = writableFieldValues(definition, source)
  const changed: Record<string, AdminContentValue> = Object.create(null) as Record<string, AdminContentValue>
  for (const [field, value] of Object.entries(current)) {
    if (!sameAdminContentValue(value, baseline[field])) changed[field] = value
  }
  return changed
}

export function formatAdminContentValue(value: AdminContentValue | undefined, column: AdminListColumn): string {
  if (column.kind === 'image') return '—'
  if (value === null || value === undefined || value === '') return '—'
  if (column.kind === 'boolean') return value === true ? '是' : value === false ? '否' : String(value)
  if (column.kind === 'date') return formatAdminDate(value)
  if (column.kind === 'datetime') return formatAdminDateTime(value)
  const text = String(value)
  return column.kind === 'long-text' && text.length > 90 ? `${text.slice(0, 90)}…` : text
}

export function contentTagType(value: AdminContentValue | undefined): '' | 'success' | 'warning' | 'danger' | 'info' {
  return adminStatusTagType(value)
}
