import { CacheError } from './errors'
import { normalizeCacheOrigin } from './keys'

export const CACHE_ENVELOPE_HEADROOM_BYTES = 32 * 1024
export const MAX_PUBLIC_CACHE_PAYLOAD_BYTES = 2 * 1024 * 1024
export const MAX_CACHE_RETENTION_SECONDS = 7 * 24 * 60 * 60

export interface CacheRuntimeConfig {
  maxEntries: number
  maxBytes: number
  maxEntryBytes: number
  maxPayloadBytes: number
  origin: string | null
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number, name: string): number {
  let selected: number
  if (value === '' || value === null || value === undefined) selected = fallback
  else if (typeof value === 'number') selected = value
  else if (typeof value === 'string' && value === value.trim() && /^(?:0|[1-9][0-9]*)$/u.test(value)) selected = Number(value)
  else throw new CacheError('CACHE_INPUT', `Invalid ${name}`)
  if (!Number.isSafeInteger(selected) || selected < minimum || selected > maximum) throw new CacheError('CACHE_INPUT', `Invalid ${name}`)
  return selected
}

export function parseCacheConfig(raw: Record<string, unknown>): CacheRuntimeConfig {
  const maxBytes = integer(raw.cacheMaxBytes, 32 * 1024 * 1024, 1024, 512 * 1024 * 1024, 'cache byte limit')
  const maxEntryBytes = integer(raw.cacheMaxEntryBytes, 2 * 1024 * 1024, 64 * 1024, 8 * 1024 * 1024, 'cache entry byte limit')
  if (maxEntryBytes > maxBytes) throw new CacheError('CACHE_INPUT', 'Cache entry limit exceeds total cache limit')
  let origin: string | null = null
  if (raw.cacheOrigin !== undefined && raw.cacheOrigin !== null && raw.cacheOrigin !== '') {
    if (typeof raw.cacheOrigin !== 'string') throw new CacheError('CACHE_INPUT', 'Invalid cache origin')
    origin = normalizeCacheOrigin(raw.cacheOrigin)
  }
  return {
    maxEntries: integer(raw.cacheMaxEntries, 512, 1, 100_000, 'cache entry count'),
    maxBytes,
    maxEntryBytes,
    maxPayloadBytes: Math.min(MAX_PUBLIC_CACHE_PAYLOAD_BYTES, maxEntryBytes - CACHE_ENVELOPE_HEADROOM_BYTES),
    origin,
  }
}
