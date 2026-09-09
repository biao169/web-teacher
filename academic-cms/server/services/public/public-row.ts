import type { QueryResult, RawRow } from '../../../db/contracts'
import { isVisibilityScope, type VisibilityScope } from '../../../shared/enums/auth'
import { hasUnpairedSurrogate } from '../../../shared/utils/unicode'
import { PublicSiteError } from './errors'

const encoder = new TextEncoder()
const FORBIDDEN_TEXT_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u

export function rowOwn(row: RawRow, field: string): string | number | null {
  if (!Object.hasOwn(row, field)) throw new PublicSiteError('PUBLIC_PROTOCOL', `Public row is missing ${field}`)
  return row[field]!
}

export function rowText(row: RawRow, field: string, maxBytes: number, nullable = false): string | null {
  const value = rowOwn(row, field)
  if (value === null && nullable) return null
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) throw new PublicSiteError('PUBLIC_PROTOCOL', `Public field ${field} is invalid`)
  const normalized = value.normalize('NFC').replace(/\r\n?/gu, '\n')
  if (FORBIDDEN_TEXT_CONTROL.test(normalized)) throw new PublicSiteError('PUBLIC_PROTOCOL', `Public field ${field} contains forbidden control characters`)
  if (encoder.encode(normalized).byteLength > maxBytes) throw new PublicSiteError('PUBLIC_LIMIT', `Public field ${field} exceeds its budget`)
  return normalized
}

export function rowRequiredText(row: RawRow, field: string, maxBytes: number): string {
  const value = rowText(row, field, maxBytes)
  if (!value?.trim()) throw new PublicSiteError('PUBLIC_PROTOCOL', `Public field ${field} is empty`)
  return value
}

export function rowOptionalText(row: RawRow, field: string, maxBytes: number): string | null {
  return rowText(row, field, maxBytes, true)
}


export function rowVisibilityScope(row: RawRow, field: string): VisibilityScope {
  const value = rowRequiredText(row, field, 32)
  if (!isVisibilityScope(value)) throw new PublicSiteError('PUBLIC_PROTOCOL', `Public field ${field} has an invalid visibility scope`)
  return value
}

export function rowInteger(row: RawRow, field: string, minimum: number, maximum: number, nullable = false): number | null {
  const value = rowOwn(row, field)
  if (value === null && nullable) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new PublicSiteError('PUBLIC_PROTOCOL', `Public field ${field} is invalid`)
  }
  return value
}

export function rowBoolean(row: RawRow, field: string): boolean {
  const value = rowInteger(row, field, 0, 1)
  return value === 1
}

export function rowTimestamp(row: RawRow, field: string, nullable = false): string | null {
  const value = rowText(row, field, 24, nullable)
  if (value === null) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || new Date(value).toISOString() !== value) {
    throw new PublicSiteError('PUBLIC_PROTOCOL', `Public field ${field} is not a canonical timestamp`)
  }
  return value
}

export function rowDate(row: RawRow, field: string): string | null {
  const value = rowOptionalText(row, field, 10)
  if (value === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new PublicSiteError('PUBLIC_PROTOCOL', `Public field ${field} is not a canonical date`)
  }
  return value
}

export function rowCount(result: QueryResult, label: string): number {
  if (result.rows.length !== 1) throw new PublicSiteError('PUBLIC_PROTOCOL', `${label} count query returned an unexpected shape`)
  return rowInteger(result.rows[0]!, 'total', 0, 10_000_000)!
}

export function oneRow<T>(result: QueryResult, parse: (row: RawRow) => T, label: string): T | null {
  if (result.rows.length > 1) throw new PublicSiteError('PUBLIC_PROTOCOL', `${label} query returned more than one row`)
  return result.rows[0] ? parse(result.rows[0]) : null
}

export function manyRows<T extends { uid: string }>(result: QueryResult, maximum: number, parse: (row: RawRow) => T, label: string): T[] {
  if (result.rows.length > maximum) throw new PublicSiteError('PUBLIC_LIMIT', `${label} query exceeded its row limit`)
  const values = result.rows.map(parse)
  const ids = new Set<string>()
  for (const item of values) {
    if (ids.has(item.uid)) throw new PublicSiteError('PUBLIC_PROTOCOL', `${label} query returned a duplicate UID`)
    ids.add(item.uid)
  }
  return values
}
