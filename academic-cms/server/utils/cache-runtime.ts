import { PublicValueCache } from '../cache/value-cache'
import { useRuntimeConfig } from '#imports'
import { getPlatformCache } from '#cache-platform'
import type { H3Event } from 'h3'
import { parseCacheConfig } from '../cache/config'
import { CacheGenerationStore } from '../cache/generation-store'
import { CacheInvalidator } from '../cache/invalidation-map'
import { createPublicCacheCoordinator, PublicCacheService, type PublicCacheCoordinator } from '../cache/public-cache'
import type { RawCacheAdapter } from '../cache/contracts'
import { useDatabase } from './database'

export interface CacheRuntime {
  publicCache: PublicCacheService
  invalidator: CacheInvalidator
}

const valueCaches = new WeakMap<RawCacheAdapter, PublicValueCache>()

const coordinators = new WeakMap<RawCacheAdapter, PublicCacheCoordinator>()

function coordinatorFor(adapter: RawCacheAdapter): PublicCacheCoordinator {
  let coordinator = coordinators.get(adapter)
  if (!coordinator) {
    coordinator = createPublicCacheCoordinator()
    coordinators.set(adapter, coordinator)
  }
  return coordinator
}

export function useCacheRuntime(event: H3Event): CacheRuntime {
  if (event.context.cacheRuntime) return event.context.cacheRuntime
  const config = parseCacheConfig(useRuntimeConfig(event) as unknown as Record<string, unknown>)
  const generations = new CacheGenerationStore(useDatabase(event).adapter)
  const adapter = getPlatformCache(event, config)
  let valueCache = valueCaches.get(adapter)
  if (!valueCache) {
    valueCache = new PublicValueCache(Math.min(64, config.maxEntries), Math.min(4 * 1024 * 1024, config.maxBytes))
    valueCaches.set(adapter, valueCache)
  }
  const runtime: CacheRuntime = {
    publicCache: new PublicCacheService(adapter, generations, {
      maxPayloadBytes: config.maxPayloadBytes,
      valueCache,
      coordinator: coordinatorFor(adapter),
      defer: task => {
        try { event.waitUntil(task) }
        catch { void task.catch(() => undefined) }
      },
      onAdapterError: (operation, error) => console.warn('Public cache adapter failed open', {
        requestId: event.context.requestId,
        operation,
        errorType: error instanceof Error ? error.name : typeof error,
      }),
    }),
    invalidator: new CacheInvalidator(generations),
  }
  event.context.cacheRuntime = runtime
  return runtime
}
