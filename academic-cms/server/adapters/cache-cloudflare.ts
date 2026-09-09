import type { H3Event } from 'h3'
import { CloudflareCacheAdapter, type CacheLike } from '../cache/cloudflare-adapter'
import type { CacheRuntimeConfig } from '../cache/config'
import type { RawCacheAdapter } from '../cache/contracts'

interface CachedCloudflareAdapter {
  signature: string
  adapter: CloudflareCacheAdapter
}

// Workers reuse module state inside an isolate. Keeping one adapter per actual
// Cache binding lets the request runtime also reuse one single-flight
// coordinator without coupling cache correctness to request-scoped objects.
const adapters = new WeakMap<object, CachedCloudflareAdapter>()

export function getPlatformCache(_event: H3Event, config: CacheRuntimeConfig): RawCacheAdapter {
  const storage = globalThis.caches as unknown as { default?: CacheLike }
  const binding = storage?.default
  if (!binding) throw new Error('Cloudflare default Cache API is unavailable')
  if ((typeof binding !== 'object' || binding === null) && typeof binding !== 'function') {
    throw new Error('Cloudflare default Cache API binding is invalid')
  }
  if (!config.origin) throw new Error('NUXT_CACHE_ORIGIN is required for Cloudflare Cache API keys')

  const identity = binding as object
  const signature = JSON.stringify([config.origin, config.maxEntryBytes])
  const cached = adapters.get(identity)
  if (cached) {
    if (cached.signature !== signature) throw new Error('Cloudflare cache configuration cannot change within one isolate')
    return cached.adapter
  }

  const adapter = new CloudflareCacheAdapter(binding, config.origin, config.maxEntryBytes)
  adapters.set(identity, { signature, adapter })
  return adapter
}
