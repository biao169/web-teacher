export interface RawCacheEntry {
  bytes: Uint8Array
  etag: string | null
}

export interface RawCacheAdapter {
  readonly kind: 'memory' | 'cloudflare'
  get(key: string): Promise<RawCacheEntry | null>
  put(key: string, entry: RawCacheEntry, retentionSeconds: number): Promise<void>
  delete(key: string): Promise<boolean>
}

export interface CacheGenerationSnapshot {
  readonly generations: ReadonlyMap<string, number>
}

export interface PublicCachePolicy {
  ttlSeconds: number
  staleSeconds: number
  maxPayloadBytes?: number
}

export interface PublicCacheDescriptor {
  namespace: string
  resource: string
  tags: readonly string[]
  locale?: 'zh' | 'en'
  params?: unknown
  schemaVersion?: number
}

export interface PublicCacheHit<T> {
  status: 'fresh' | 'stale'
  value: T
  etag: string
  generatedAt: string
}

export interface PublicCacheMiss {
  status: 'miss'
}

export type PublicCacheResult<T> = PublicCacheHit<T> | PublicCacheMiss
