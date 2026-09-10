declare module 'h3' {
  export function getQuery(event: H3Event): Record<string, string | string[] | undefined>
  export function getRouterParam(event: H3Event, name: string, options?: { decode?: boolean }): string | undefined
  export function sendStream(event: H3Event, stream: ReadableStream<Uint8Array>): unknown
}

declare module '#media-platform' {
  import type { H3Event } from 'h3'
  import type { MediaRuntimeConfig } from '../../server/media/config'
  import type { MediaStoreSet } from '../../server/services/media/media-service'
  export function getPlatformMediaStores(event: H3Event, config: MediaRuntimeConfig): MediaStoreSet
}

declare module '#cache-platform' {
  import type { H3Event } from 'h3'
  import type { CacheRuntimeConfig } from '../../server/cache/config'
  import type { RawCacheAdapter } from '../../server/cache/contracts'
  export function getPlatformCache(event: H3Event, config: CacheRuntimeConfig): RawCacheAdapter
}
