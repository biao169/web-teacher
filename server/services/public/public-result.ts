import type { PublicJsonValue } from '../../../shared/contracts/view-model'
import type { PublicCachePolicy, PublicCacheDescriptor } from '../../cache/contracts'
import type { PublicCacheService } from '../../cache/public-cache'
import { sha256Hex, stablePublicJson } from '../../view-model/serializer'

export type PublicServiceResult<T> = {
  viewModel: T
  cache: 'hit' | 'stale' | 'miss'
  etag: string
}

/** Selection preparation must not serve or populate a stale public list cache. */
export async function freshPublicView<T>(maxBytes: number, loader: () => Promise<T>): Promise<PublicServiceResult<T>> {
  const normalized = stablePublicJson(await loader(), { limits: { maxBytes, maxDepth: 20, maxNodes: 20_000 } })
  return { viewModel: normalized.value as unknown as T, cache: 'miss', etag: `"vm-${await sha256Hex(normalized.json)}"` }
}

export async function rememberPublicView<T>(
  cache: PublicCacheService,
  descriptor: PublicCacheDescriptor,
  policy: PublicCachePolicy,
  maxBytes: number,
  loader: () => Promise<T>,
): Promise<PublicServiceResult<T>> {
  const remembered = await cache.remember<PublicJsonValue>(descriptor, policy, async () => {
    const value = await loader()
    return stablePublicJson(value, { limits: { maxBytes, maxDepth: 20, maxNodes: 20_000 } }).value as PublicJsonValue
  })
  const viewModel = remembered.value as unknown as T
  const etag = remembered.etag ?? `"vm-${await sha256Hex(stablePublicJson(viewModel, { limits: { maxBytes } }).json)}"`
  return { viewModel, cache: remembered.cache, etag }
}

export function mediaBoundedCachePolicy(publicMediaGrantSeconds: number, desiredTtl: number, desiredStale: number, maxPayloadBytes: number): PublicCachePolicy {
  if (!Number.isSafeInteger(publicMediaGrantSeconds) || publicMediaGrantSeconds < 30 || publicMediaGrantSeconds > 3_600) {
    throw new TypeError('Invalid public media grant lifetime')
  }
  const budget = Math.max(2, publicMediaGrantSeconds - 20)
  const ttlSeconds = Math.min(desiredTtl, Math.max(1, budget))
  const staleSeconds = Math.min(desiredStale, Math.max(0, budget - ttlSeconds))
  return { ttlSeconds, staleSeconds, maxPayloadBytes }
}
