import type { H3Event } from 'h3'
import type { MediaRuntimeConfig } from '../media/config'
import { FetchMediaStore, type FetcherLike } from '../media/fetch-store'
import { R2MediaStore } from '../media/r2-store'
import type { MediaStoreSet } from '../services/media/media-service'

export function getPlatformMediaStores(event: H3Event, config: MediaRuntimeConfig): MediaStoreSet {
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  const bucket = env?.MEDIA
  const assets = env?.ASSETS
  return {
    ...(bucket && typeof (bucket as { head?: unknown }).head === 'function' ? { r2: new R2MediaStore(bucket as ConstructorParameters<typeof R2MediaStore>[0], { maxObjectBytes: config.maxObjectBytes }) } : {}),
    ...(assets && typeof (assets as { fetch?: unknown }).fetch === 'function' ? { static: new FetchMediaStore(assets as FetcherLike) } : {}),
  }
}
