import { columnSpec } from '../../../db/codec'
import type { AdminFieldDefinition, AdminContentModuleDefinition, AdminContentValue } from '../../../shared/admin/content-modules'
import { normalizeManagedObjectKey } from '../../media/object-key'
import { AdminContentError } from './content-errors'

const encoder = new TextEncoder()
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const SAFE_CATEGORY_KEY = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u
const EMAIL = /^[^\s@]{1,128}@[^\s@]{1,255}$/u
const DECIMAL = /^(0|[1-9]\d{0,17})(?:\.\d{1,4})?$/u
const DATE = /^\d{4}-\d{2}-\d{2}$/u
const RESERVED = new Set(['__proto__', 'prototype', 'constructor'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function canonicalDate(value: string): string | null {
  if (!DATE.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function canonicalTimestamp(value: string): string | null {
  if (!value || value.length > 128) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return url.toString()
  }
  catch { return null }
}

function canonicalEmail(value: string): string | null {
  const normalized = value.trim().normalize('NFC').toLowerCase()
  return EMAIL.test(normalized) && encoder.encode(normalized).byteLength <= 320 ? normalized : null
}

function normalizeText(field: AdminFieldDefinition, value: string): string | null {
  const canonical = value.normalize('NFC').replace(/\r\n?/gu, '\n')
  const normalized = field.preserveWhitespace ? canonical : canonical.trim()
  const maximum = field.maxLength ?? (field.kind === 'textarea' ? 100_000 : 2_000)
  if ([...normalized].length > maximum || encoder.encode(normalized).byteLength > Math.min(maximum * 4, 1_000_000)) return null
  return normalized
}

function normalizeField(field: AdminFieldDefinition, input: unknown): AdminContentValue {
  if (input === undefined || input === null || input === '') {
    if (field.required && !field.nullable) throw new Error('此字段为必填项。')
    return null
  }
  if (field.kind === 'boolean') {
    if (typeof input !== 'boolean') throw new Error('必须是布尔值。')
    return input
  }
  if (field.kind === 'integer') {
    const parsed = typeof input === 'number' ? input : typeof input === 'string' && /^-?\d+$/u.test(input.trim()) ? Number(input) : Number.NaN
    if (!Number.isSafeInteger(parsed)) throw new Error('必须是整数。')
    if (field.min !== undefined && parsed < field.min) throw new Error(`不得小于 ${field.min}。`)
    if (field.max !== undefined && parsed > field.max) throw new Error(`不得大于 ${field.max}。`)
    return parsed
  }
  if (typeof input !== 'string') throw new Error('必须是文本。')
  const text = normalizeText(field, input)
  if (text === null) throw new Error(`文本不得超过 ${field.maxLength ?? (field.kind === 'textarea' ? 100_000 : 2_000)} 个字符。`)
  if (!text || !text.trim()) {
    if (field.required && !field.nullable) throw new Error('此字段为必填项。')
    return null
  }
  if (field.kind === 'email') {
    const email = canonicalEmail(text)
    if (!email) throw new Error('邮箱格式无效。')
    return email
  }
  if (field.kind === 'url') {
    const url = canonicalUrl(text)
    if (!url) throw new Error('只允许不含账号信息的 HTTP/HTTPS URL。')
    return url
  }
  if (field.kind === 'media') {
    try { return normalizeManagedObjectKey(text) }
    catch { throw new Error('媒体 object key 格式无效。') }
  }
  if (field.kind === 'date') {
    const date = canonicalDate(text)
    if (!date) throw new Error('日期格式无效。')
    return date
  }
  if (field.kind === 'datetime') {
    const datetime = canonicalTimestamp(text)
    if (!datetime) throw new Error('日期时间格式无效。')
    return datetime
  }
  if (field.kind === 'decimal') {
    if (!DECIMAL.test(text)) throw new Error('请输入最多 18 位整数和 4 位小数的非负金额。')
    return text.replace(/\.0+$/u, '')
  }
  if (field.kind === 'slug') {
    const slug = text.toLowerCase()
    if (!SAFE_SLUG.test(slug) || slug.length > (field.maxLength ?? 200)) throw new Error('URL 标识只能使用小写字母、数字和单个短横线。')
    return slug
  }
  if (field.kind === 'select' && field.options && !field.options.some(option => option.value === text)) {
    throw new Error('选择值不在允许范围内。')
  }
  return text
}

function orcidValid(value: string): boolean {
  const compact = value.replaceAll('-', '').toUpperCase()
  if (!/^\d{15}[\dX]$/u.test(compact)) return false
  let total = 0
  for (const digit of compact.slice(0, 15)) total = (total + Number(digit)) * 2
  const remainder = (12 - (total % 11)) % 11
  return compact.at(-1) === (remainder === 10 ? 'X' : String(remainder))
}

function normalizeDoi(value: string): string | null {
  const normalized = value.trim().replace(/^doi:\s*/iu, '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '').toLowerCase()
  return /^10\.\d{4,9}\/\S+$/u.test(normalized) && !/[\s<>"']/u.test(normalized) ? normalized : null
}

function dateOrder(errors: Record<string, string>, values: Readonly<Record<string, AdminContentValue>>, start: string, end: string, message: string): void {
  const left = values[start]
  const right = values[end]
  if (typeof left === 'string' && typeof right === 'string' && left > right) errors[end] = message
}

function validateCombined(definition: AdminContentModuleDefinition, values: Record<string, AdminContentValue>, errors: Record<string, string>, enforceRequired: boolean): void {
  if (enforceRequired) for (const field of definition.fields) {
    if (field.required && !field.readOnly && (values[field.name] === null || values[field.name] === undefined || values[field.name] === '')) {
      errors[field.name] ??= '此字段为必填项。'
    }
  }
  if (definition.module === 'profiles' && typeof values.orcid === 'string' && !orcidValid(values.orcid)) errors.orcid = 'ORCID 校验位无效。'
  if (definition.module === 'publications' && typeof values.doi === 'string') {
    const doi = normalizeDoi(values.doi)
    if (!doi) errors.doi = 'DOI 格式无效。'
    else values.doi = doi
  }
  if (definition.module === 'projects') dateOrder(errors, values, 'start_date', 'end_date', '结束日期不得早于开始日期。')
  if (definition.module === 'patents') {
    dateOrder(errors, values, 'application_date', 'grant_date', '授权日期不得早于申请日期。')
    if (typeof values.grant_number === 'string' && values.grant_number && typeof values.grant_date !== 'string') errors.grant_date = '填写授权号时必须填写授权日期。'
  }
  if (definition.module === 'students') dateOrder(errors, values, 'enrollment_date', 'graduation_date', '毕业日期不得早于入学日期。')
  if (definition.module === 'student_category_displays' && typeof values.key === 'string' && !SAFE_CATEGORY_KEY.test(values.key)) errors.key = '分类 key 只能使用小写字母、数字、连字符和下划线。'
}

export interface NormalizedAdminContentValues {
  readonly values: Readonly<Record<string, AdminContentValue>>
}

export function normalizeAdminContentValues(
  definition: AdminContentModuleDefinition,
  input: unknown,
  mode: 'create' | 'update' | 'batch',
  existing?: Readonly<Record<string, AdminContentValue>>,
): NormalizedAdminContentValues {
  if (!isPlainObject(input)) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Mutation values must be an object')
  const fields = new Map(definition.fields.map(field => [field.name, field]))
  const errors: Record<string, string> = Object.create(null) as Record<string, string>
  const normalized: Record<string, AdminContentValue> = Object.create(null) as Record<string, AdminContentValue>

  for (const key of Object.keys(input)) {
    if (RESERVED.has(key) || !fields.has(key)) errors[key] = '该字段不能写入。'
  }
  for (const field of definition.fields) {
    const supplied = Object.hasOwn(input, field.name)
    if (field.readOnly) {
      if (supplied) errors[field.name] = '该字段为只读。'
      continue
    }
    if (!supplied && mode !== 'create') continue
    const raw = supplied ? input[field.name] : field.defaultValue
    try { normalized[field.name] = normalizeField(field, raw) }
    catch (error) { errors[field.name] = error instanceof Error ? error.message : '字段值无效。' }
  }

  if (mode === 'batch') {
    const keys = Object.keys(normalized)
    if (keys.length !== 1) errors._form = '批量操作每次只能修改一个字段。'
    else if (!definition.batchFields.includes(keys[0]!)) errors[keys[0]!] = '该字段不支持批量更新。'
  }
  if (mode !== 'create' && Object.keys(normalized).length === 0 && Object.keys(errors).length === 0) errors._form = '没有可保存的字段。'

  const combined: Record<string, AdminContentValue> = Object.create(null) as Record<string, AdminContentValue>
  if (existing) Object.assign(combined, existing)
  Object.assign(combined, normalized)
  validateCombined(definition, combined, errors, mode === 'create' || existing !== undefined)
  for (const key of Object.keys(normalized)) normalized[key] = combined[key]!

  for (const key of Object.keys(normalized)) {
    try { columnSpec(definition.table, key) }
    catch { errors[key] = '字段与数据库结构不一致。' }
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminContentError('ADMIN_CONTENT_VALIDATION', 'Administration content validation failed', { fieldErrors: errors })
  }
  return Object.freeze({ values: Object.freeze({ ...normalized }) })
}
