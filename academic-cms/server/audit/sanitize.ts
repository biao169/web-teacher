import type { JsonValue } from '../../db/schema-types'
import { SecurityError } from '../security/errors'

const MAX_DEPTH = 8
const MAX_NODES = 1000
const MAX_ITEMS = 100
const MAX_STRING = 2048

function sensitiveKey(value: string): boolean {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!key) return false
  if (key === 'authorization' || key.includes('cookie') || key.includes('secret') || key.includes('privatekey')) return true
  if (key === 'password' || key.endsWith('password') || key === 'passwd' || key === 'passwordhash') return true
  if (key === 'csrf' || key.startsWith('csrf') || key.endsWith('token') || key.endsWith('tokenhash')) return true
  if (key === 'sessionhash' || key === 'sessionfingerprint') return true
  if (key === 'apikey' || key.endsWith('apikey')) return true
  return false
}

export function oneLine(value: unknown, maximum = 500): string | null {
  if (value === null || value === undefined) return null
  if (!['string', 'number', 'boolean', 'bigint'].includes(typeof value)) return null
  const normalized = String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return normalized.slice(0, maximum)
}

/** Copies data properties only. Getters, prototypes and symbol keys are never executed or serialized. */
export function sanitizeAuditDetail(value: unknown): JsonValue {
  let nodes = 0
  const active = new WeakSet<object>()
  const visit = (current: unknown, depth: number, key = ''): JsonValue => {
    nodes += 1
    if (nodes > MAX_NODES || depth > MAX_DEPTH) return '[TRUNCATED]'
    if (key && sensitiveKey(key)) return '[REDACTED]'
    if (current === null || typeof current === 'boolean') return current
    if (typeof current === 'number') return Number.isFinite(current) ? current : '[INVALID_NUMBER]'
    if (typeof current === 'string') return oneLine(current, MAX_STRING) ?? ''
    if (typeof current !== 'object') return `[${typeof current}]`
    if (active.has(current)) return '[CIRCULAR]'
    let prototype: object | null
    let symbols: symbol[]
    let descriptors: PropertyDescriptorMap
    try {
      prototype = Object.getPrototypeOf(current)
      symbols = Object.getOwnPropertySymbols(current)
      descriptors = Object.getOwnPropertyDescriptors(current)
    }
    catch {
      return '[UNSUPPORTED_OBJECT]'
    }
    if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null) return '[UNSUPPORTED_OBJECT]'
    if (symbols.length) return '[UNSUPPORTED_SYMBOL_KEYS]'
    active.add(current)
    try {
      if (Array.isArray(current)) {
        const arrayValue = current as unknown[]
        if (arrayValue.length > MAX_ITEMS) return '[TRUNCATED_ARRAY]'
        const output: JsonValue[] = []
        for (let index = 0; index < arrayValue.length; index += 1) {
          const descriptor = descriptors[String(index)]
          if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return '[UNSUPPORTED_ARRAY]'
          output.push(visit(descriptor.value, depth + 1, key))
        }
        if (Object.keys(descriptors).filter(entry => entry !== 'length').length !== arrayValue.length) return '[UNSUPPORTED_ARRAY]'
        return output
      }
      const entries = Object.entries(descriptors)
      const output: Record<string, JsonValue> = Object.create(null)
      for (const [entryKey, descriptor] of entries.slice(0, MAX_ITEMS)) {
        const safeKey = oneLine(entryKey, 128) ?? 'field'
        if (sensitiveKey(entryKey)) output[safeKey] = '[REDACTED]'
        else {
          output[safeKey] = descriptor.enumerable && Object.hasOwn(descriptor, 'value')
            ? visit(descriptor.value, depth + 1, entryKey)
            : '[UNSUPPORTED_ACCESSOR]'
        }
      }
      if (entries.length > MAX_ITEMS) output.__truncated__ = true
      return output
    }
    finally { active.delete(current) }
  }
  const sanitized = visit(value, 0)
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized) ? sanitized : { value: sanitized }
}

export function assertSafeAuditEvent(value: JsonValue): void {
  const encoded = JSON.stringify(value)
  if (new TextEncoder().encode(encoded).byteLength > 256_000) throw new SecurityError('AUTH_INPUT', 'Audit detail is too large')
}
