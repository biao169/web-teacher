import type { RawCacheAdapter, RawCacheEntry } from './contracts'
import { MAX_CACHE_RETENTION_SECONDS } from './config'
import { CacheError } from './errors'

interface StoredEntry {
  bytes: Uint8Array
  etag: string | null
  expiresAt: number
  size: number
}

export interface MemoryCacheOptions {
  maxEntries?: number
  maxBytes?: number
  maxEntryBytes?: number
  now?: () => number
}

function cacheEtag(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new CacheError('CACHE_INPUT', 'Invalid cache ETag')
  }
  return value
}

export class MemoryCacheAdapter implements RawCacheAdapter {
  readonly kind = 'memory' as const
  readonly metrics = { hits: 0, misses: 0, puts: 0, deletes: 0, evictions: 0 }
  private readonly entries = new Map<string, StoredEntry>()
  private readonly maxEntries: number
  private readonly maxBytes: number
  private readonly maxEntryBytes: number
  private readonly now: () => number
  private usedBytes = 0

  constructor(options: MemoryCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 512
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024
    this.maxEntryBytes = options.maxEntryBytes ?? 2 * 1024 * 1024
    if (options.now !== undefined && typeof options.now !== 'function') throw new CacheError('CACHE_INPUT', 'Invalid memory cache clock')
    this.now = options.now ?? Date.now
    for (const value of [this.maxEntries, this.maxBytes, this.maxEntryBytes]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new CacheError('CACHE_INPUT', 'Invalid memory cache limit')
    }
    if (this.maxEntryBytes > this.maxBytes) throw new CacheError('CACHE_INPUT', 'Memory cache entry limit exceeds total limit')
  }

  private time(): number {
    const value = this.now()
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new CacheError('CACHE_PROTOCOL', 'Memory cache clock is invalid')
    }
    return value
  }

  private remove(key: string): boolean {
    const entry = this.entries.get(key)
    if (!entry) return false
    this.entries.delete(key)
    this.usedBytes -= entry.size
    return true
  }

  private evict(): void {
    while (this.entries.size > this.maxEntries || this.usedBytes > this.maxBytes) {
      const key = this.entries.keys().next().value as string | undefined
      if (key === undefined) break
      this.remove(key)
      this.metrics.evictions += 1
    }
  }

  async get(key: string): Promise<RawCacheEntry | null> {
    const now = this.time()
    const entry = this.entries.get(key)
    if (!entry || entry.expiresAt <= now) {
      if (entry) this.remove(key)
      this.metrics.misses += 1
      return null
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    this.metrics.hits += 1
    return { bytes: entry.bytes.slice(), etag: entry.etag }
  }

  async put(key: string, entry: RawCacheEntry, retentionSeconds: number): Promise<void> {
    if (!Number.isSafeInteger(retentionSeconds) || retentionSeconds < 1 || retentionSeconds > MAX_CACHE_RETENTION_SECONDS) throw new CacheError('CACHE_INPUT', 'Invalid cache retention')
    if (!(entry.bytes instanceof Uint8Array) || entry.bytes.byteLength > this.maxEntryBytes) throw new CacheError('CACHE_LIMIT', 'Cache entry exceeds memory limit')
    const now = this.time()
    const expiresAt = now + retentionSeconds * 1000
    if (!Number.isSafeInteger(expiresAt)) throw new CacheError('CACHE_PROTOCOL', 'Memory cache expiry overflowed')
    const etag = cacheEtag(entry.etag)
    this.remove(key)
    const copy = entry.bytes.slice()
    this.entries.set(key, { bytes: copy, etag, expiresAt, size: copy.byteLength })
    this.usedBytes += copy.byteLength
    this.metrics.puts += 1
    this.evict()
  }

  async delete(key: string): Promise<boolean> {
    const deleted = this.remove(key)
    if (deleted) this.metrics.deletes += 1
    return deleted
  }

  clear(): void {
    this.entries.clear()
    this.usedBytes = 0
  }

  get size(): number { return this.entries.size }
  get bytes(): number { return this.usedBytes }
}
