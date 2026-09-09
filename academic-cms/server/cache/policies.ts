import type { PublicCachePolicy } from './contracts'

export const PUBLIC_CACHE_POLICIES = Object.freeze({
  home: { ttlSeconds: 60, staleSeconds: 300, maxPayloadBytes: 768_000 },
  layout: { ttlSeconds: 300, staleSeconds: 1_800, maxPayloadBytes: 64_000 },
  list: { ttlSeconds: 180, staleSeconds: 900, maxPayloadBytes: 512_000 },
  detail: { ttlSeconds: 600, staleSeconds: 1_800, maxPayloadBytes: 512_000 },
  filters: { ttlSeconds: 60, staleSeconds: 300, maxPayloadBytes: 64_000 },
  translations: { ttlSeconds: 300, staleSeconds: 1_800, maxPayloadBytes: 512_000 },
} satisfies Readonly<Record<string, PublicCachePolicy>>)
