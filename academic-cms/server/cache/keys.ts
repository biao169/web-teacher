import { sha256Hex, stablePublicJson } from '../view-model/serializer'
import { CacheError } from './errors'
import type { CacheGenerationSnapshot, PublicCacheDescriptor } from './contracts'

const encoder = new TextEncoder()
const NAME_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/u
const RESOURCE_PATTERN = /^[a-z0-9][a-z0-9._~:/-]{0,255}$/u
const TAG_PATTERN = /^[a-z][a-z0-9._:-]{0,127}$/u

export function validateCacheTag(tag: string): string {
  if (typeof tag !== 'string' || !TAG_PATTERN.test(tag)) throw new CacheError('CACHE_INPUT', 'Invalid cache tag')
  return tag
}

export function normalizeCacheTags(tags: readonly string[]): string[] {
  if (!Array.isArray(tags) || tags.length < 1 || tags.length > 32) throw new CacheError('CACHE_LIMIT', 'Cache entries require between 1 and 32 tags')
  return [...new Set(tags.map(validateCacheTag))].sort()
}

function validateDescriptor(descriptor: PublicCacheDescriptor): Required<Pick<PublicCacheDescriptor, 'namespace' | 'resource' | 'tags' | 'schemaVersion'>> & Pick<PublicCacheDescriptor, 'locale' | 'params'> {
  if (!descriptor || typeof descriptor !== 'object') throw new CacheError('CACHE_INPUT', 'Cache descriptor is required')
  if (!NAME_PATTERN.test(descriptor.namespace)) throw new CacheError('CACHE_INPUT', 'Invalid cache namespace')
  if (!RESOURCE_PATTERN.test(descriptor.resource) || encoder.encode(descriptor.resource).byteLength > 256) throw new CacheError('CACHE_INPUT', 'Invalid cache resource')
  if (descriptor.locale !== undefined && descriptor.locale !== 'zh' && descriptor.locale !== 'en') throw new CacheError('CACHE_INPUT', 'Invalid cache locale')
  const schemaVersion = descriptor.schemaVersion ?? 1
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > 1_000_000) throw new CacheError('CACHE_INPUT', 'Invalid cache schema version')
  return {
    namespace: descriptor.namespace,
    resource: descriptor.resource,
    tags: normalizeCacheTags(descriptor.tags),
    schemaVersion,
    ...(descriptor.locale === undefined ? {} : { locale: descriptor.locale }),
    ...(descriptor.params === undefined ? {} : { params: descriptor.params }),
  }
}

export interface PreparedCacheKey {
  physicalKey: string
  fingerprint: string
  tags: readonly string[]
  generations: Readonly<Record<string, number>>
}

export async function prepareCacheKey(descriptor: PublicCacheDescriptor, snapshot: CacheGenerationSnapshot): Promise<PreparedCacheKey> {
  const normalized = validateDescriptor(descriptor)
  const generations: Record<string, number> = Object.create(null) as Record<string, number>
  for (const tag of normalized.tags) {
    const generation = snapshot.generations.get(tag) ?? 0
    if (!Number.isSafeInteger(generation) || generation < 0) throw new CacheError('CACHE_PROTOCOL', 'Invalid cache generation')
    generations[tag] = generation
  }
  const { json } = stablePublicJson({
    v: 1,
    namespace: normalized.namespace,
    resource: normalized.resource,
    schemaVersion: normalized.schemaVersion,
    locale: normalized.locale ?? null,
    params: normalized.params ?? null,
    generations,
  }, { limits: { maxBytes: 64_000, maxDepth: 12, maxNodes: 5_000 } })
  const fingerprint = await sha256Hex(json)
  return {
    physicalKey: `v1/${normalized.namespace}/${fingerprint}`,
    fingerprint,
    tags: normalized.tags,
    generations,
  }
}

export function sameGenerationVector(prepared: PreparedCacheKey, snapshot: CacheGenerationSnapshot): boolean {
  for (const tag of prepared.tags) {
    if ((snapshot.generations.get(tag) ?? 0) !== prepared.generations[tag]) return false
  }
  return true
}

export function normalizeCacheOrigin(origin: string): string {
  if (typeof origin !== 'string' || !origin || origin !== origin.trim()) throw new CacheError('CACHE_INPUT', 'Invalid cache origin')
  let url: URL
  try { url = new URL(origin) }
  catch (error) { throw new CacheError('CACHE_INPUT', 'Invalid cache origin', { cause: error }) }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new CacheError('CACHE_INPUT', 'Cache origin must contain only scheme and authority')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new CacheError('CACHE_INPUT', 'Cache origin must use HTTPS')
  }
  return url.origin
}

export function cacheRequestUrl(origin: string, physicalKey: string): string {
  const url = new URL(normalizeCacheOrigin(origin))
  if (!/^v1\/[a-z][a-z0-9._-]{0,63}\/[a-f0-9]{64}$/u.test(physicalKey)) throw new CacheError('CACHE_INPUT', 'Invalid physical cache key')
  url.pathname = `/__cms_cache/${physicalKey}`
  return url.toString()
}
