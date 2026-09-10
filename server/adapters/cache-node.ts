import type { H3Event } from 'h3'
import type { CacheRuntimeConfig } from '../cache/config'
import { MemoryCacheAdapter } from '../cache/memory-adapter'
import type { RawCacheAdapter } from '../cache/contracts'

let cached: { signature: string; adapter: MemoryCacheAdapter } | undefined

export function getPlatformCache(_event: H3Event, config: CacheRuntimeConfig): RawCacheAdapter {
  const signature = JSON.stringify([config.maxEntries, config.maxBytes, config.maxEntryBytes])
  if (cached && cached.signature !== signature) throw new Error('Cache configuration cannot change within one process')
  cached ??= {
    signature,
    adapter: new MemoryCacheAdapter({
      maxEntries: config.maxEntries,
      maxBytes: config.maxBytes,
      maxEntryBytes: config.maxEntryBytes,
    }),
  }
  return cached.adapter
}
