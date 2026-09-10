import type { AdminListPrimitive, AdminUnifiedColumnKind } from './unified-list'

export interface AdminDateFormatOptions {
  readonly fallback?: string
  readonly locale?: string
  readonly timeZone?: string
  readonly suffix?: string
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function dateValue(value: unknown, dateOnly = false): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const source = dateOnly && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T00:00:00Z` : value
  const date = new Date(source)
  return Number.isFinite(date.getTime()) ? date : null
}

function formatter(locale: string, timeZone: string | undefined, dateOnly: boolean): Intl.DateTimeFormat {
  const key = `${locale}:${timeZone ?? 'UTC'}:${dateOnly ? 'date' : 'datetime'}`
  const cached = formatters.get(key)
  if (cached) return cached
  const created = new Intl.DateTimeFormat(locale, dateOnly
    ? { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: timeZone ?? 'UTC' }
    : { dateStyle: 'medium', timeStyle: 'short', hour12: false, timeZone: timeZone ?? 'UTC' })
  formatters.set(key, created)
  return created
}

export function formatAdminDate(value: unknown, options: AdminDateFormatOptions = {}): string {
  const date = dateValue(value, true)
  if (!date) return options.fallback ?? '—'
  return `${formatter(options.locale ?? 'zh-CN', options.timeZone ?? 'UTC', true).format(date)}${options.suffix ?? ''}`
}

export function formatAdminDateTime(value: unknown, options: AdminDateFormatOptions = {}): string {
  const date = dateValue(value)
  if (!date) return options.fallback ?? '—'
  return `${formatter(options.locale ?? 'zh-CN', options.timeZone ?? 'UTC', false).format(date)}${options.suffix ?? ''}`
}

export function formatAdminBoolean(value: unknown): string {
  if (value === true || value === 1 || value === '1' || value === 'true') return '是'
  if (value === false || value === 0 || value === '0' || value === 'false') return '否'
  return '—'
}

export function formatAdminListValue(value: unknown, kind: AdminUnifiedColumnKind = 'text'): string {
  if (value === null || value === undefined || value === '') return '—'
  if (kind === 'boolean') return formatAdminBoolean(value)
  if (kind === 'date') return formatAdminDate(value)
  if (kind === 'datetime') return formatAdminDateTime(value)
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return '—' }
  }
  return String(value as AdminListPrimitive)
}

export function adminStatusTagType(value: unknown): '' | 'success' | 'warning' | 'danger' | 'info' {
  if (value === true || value === 1 || value === '1' || value === 'public' || value === 'active' || value === 'replied') return 'success'
  if (value === false || value === 0 || value === '0' || value === 'hidden' || value === 'disabled' || value === 'archived') return 'info'
  if (value === 'new' || value === 'authenticated' || value === 'owner' || value === 'pending') return 'warning'
  if (value === 'locked' || value === 'failed' || value === 'error') return 'danger'
  return ''
}
