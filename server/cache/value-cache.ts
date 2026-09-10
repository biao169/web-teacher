import type { PublicJsonValue } from '../../shared/contracts/view-model'
import type { PublicCacheResult } from './contracts'
import { CacheError } from './errors'

/** Preserve serializer null-prototype records as well as their defensive-copy boundary. */
function cloneValue<T extends PublicJsonValue>(value: T): T {
  if (Array.isArray(value)) return value.map(item => cloneValue(item)) as T
  if (value !== null && typeof value === 'object') {
    const output: Record<string, PublicJsonValue> = Object.create(Object.getPrototypeOf(value))
    for (const key of Object.keys(value)) output[key] = cloneValue((value as Record<string, PublicJsonValue>)[key]!)
    return output as T
  }
  return value
}

type Entry = { value: PublicJsonValue; etag: string; generatedAt: string; freshUntil: number; staleUntil: number; bytes: number }
/** Process/isolate-local LRU of already validated public JSON. Never holds sessions or HTML. */
export class PublicValueCache {
  private readonly entries = new Map<string, Entry>()
  private usedBytes = 0
  readonly metrics = { hits: 0, misses: 0, evictions: 0 }
  constructor(private readonly maxEntries = 64, private readonly maxBytes = 4 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new CacheError('CACHE_INPUT', 'Invalid public value cache capacity')
  }
  delete(key: string): void {
    const entry = this.entries.get(key)
    if (entry) { this.usedBytes -= entry.bytes; this.entries.delete(key) }
  }
  put(key: string, entry: Entry, now: number): void {
    this.delete(key)
    // JSON bytes are a payload budget, not a measurement of JavaScript heap usage.
    if (entry.bytes > this.maxBytes || entry.staleUntil <= now) return
    for (const [oldKey, old] of this.entries) if (old.staleUntil <= now) this.delete(oldKey)
    this.entries.set(key, { ...entry, value: cloneValue(entry.value) })
    this.usedBytes += entry.bytes
    while (this.entries.size > this.maxEntries || this.usedBytes > this.maxBytes) {
      this.delete(this.entries.keys().next().value!); this.metrics.evictions++
    }
  }
  get<T extends PublicJsonValue>(key: string, now: number, maxPayloadBytes: number): PublicCacheResult<T> {
    const entry = this.entries.get(key)
    if (!entry || entry.staleUntil <= now || Date.parse(entry.generatedAt) > now + 60000 || entry.bytes > maxPayloadBytes) {
      if (entry) this.delete(key)
      this.metrics.misses++; return { status: 'miss' }
    }
    this.entries.delete(key); this.entries.set(key, entry); this.metrics.hits++
    return { status: now < entry.freshUntil ? 'fresh' : 'stale', value: cloneValue(entry.value) as T, etag: entry.etag, generatedAt: entry.generatedAt }
  }
  get size(): number { return this.entries.size }
  get bytes(): number { return this.usedBytes }
}
