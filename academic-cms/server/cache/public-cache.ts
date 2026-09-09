import type { PublicValueCache } from './value-cache'
import type { PublicJsonValue } from '../../shared/contracts/view-model'
import { parsePublicJson, sha256Hex, stablePublicJson, ViewModelError } from '../view-model/serializer'
import type { CacheGenerationSnapshot, PublicCacheDescriptor, PublicCachePolicy, PublicCacheResult, RawCacheAdapter } from './contracts'
import { CACHE_ENVELOPE_HEADROOM_BYTES, MAX_CACHE_RETENTION_SECONDS, MAX_PUBLIC_CACHE_PAYLOAD_BYTES } from './config'
import { CacheError } from './errors'
import type { CacheGenerationStore } from './generation-store'
import { normalizeCacheTags, prepareCacheKey, sameGenerationVector, type PreparedCacheKey } from './keys'

interface CacheEnvelope {
  v: 1
  key: string
  generatedAt: string
  freshUntil: string
  staleUntil: string
  payloadDigest: string
  payload: PublicJsonValue
}

export interface PublicCacheCoordinator {
  readonly flights: Map<string, Promise<PublicJsonValue>>
  readonly generationFlights: Map<string, Promise<CacheGenerationSnapshot>>
}

export function createPublicCacheCoordinator(): PublicCacheCoordinator {
  return { flights: new Map(), generationFlights: new Map() }
}

export interface PublicCacheOptions {
  now?: () => Date
  /** Optional trusted, bounded process-local layer; generation keys are still read on every request. */
  valueCache?: PublicValueCache
  defer?: (task: Promise<void>) => void
  maxPayloadBytes?: number
  onAdapterError?: (operation: 'get' | 'put' | 'delete', error: unknown) => void
  /** Shared per process/Worker isolate to coalesce loaders across requests. */
  coordinator?: PublicCacheCoordinator
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value))
}

function selectedPolicy(value: PublicCachePolicy, defaultMaxBytes: number): Required<PublicCachePolicy> {
  const ttlSeconds = value.ttlSeconds
  const staleSeconds = value.staleSeconds
  const maxPayloadBytes = value.maxPayloadBytes ?? defaultMaxBytes
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 86_400) throw new CacheError('CACHE_INPUT', 'Invalid public cache TTL')
  if (!Number.isSafeInteger(staleSeconds) || staleSeconds < 0 || staleSeconds > 604_800) throw new CacheError('CACHE_INPUT', 'Invalid public cache stale period')
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 1
    || maxPayloadBytes > defaultMaxBytes || maxPayloadBytes > MAX_PUBLIC_CACHE_PAYLOAD_BYTES) {
    throw new CacheError('CACHE_INPUT', 'Invalid public cache payload limit')
  }
  if (ttlSeconds + staleSeconds > MAX_CACHE_RETENTION_SECONDS) throw new CacheError('CACHE_INPUT', 'Public cache retention exceeds the adapter limit')
  return { ttlSeconds, staleSeconds, maxPayloadBytes }
}

export class PublicCacheService {
  private readonly now: () => Date
  private readonly valueCache: PublicValueCache | undefined
  private readonly defer: (task: Promise<void>) => void
  private readonly maxPayloadBytes: number
  private readonly onAdapterError: (operation: 'get' | 'put' | 'delete', error: unknown) => void
  private readonly flights: Map<string, Promise<PublicJsonValue>>
  private readonly generationFlights: Map<string, Promise<CacheGenerationSnapshot>>

  constructor(
    private readonly adapter: RawCacheAdapter,
    private readonly generations: CacheGenerationStore,
    options: PublicCacheOptions = {},
  ) {
    if (!adapter || typeof adapter.get !== 'function' || typeof adapter.put !== 'function' || typeof adapter.delete !== 'function') {
      throw new CacheError('CACHE_INPUT', 'Invalid public cache adapter')
    }
    if (!generations || typeof generations.read !== 'function') throw new CacheError('CACHE_INPUT', 'Invalid cache generation store')
    if (options.now !== undefined && typeof options.now !== 'function') throw new CacheError('CACHE_INPUT', 'Invalid public cache clock')
    if (options.defer !== undefined && typeof options.defer !== 'function') throw new CacheError('CACHE_INPUT', 'Invalid public cache deferral hook')
    if (options.onAdapterError !== undefined && typeof options.onAdapterError !== 'function') throw new CacheError('CACHE_INPUT', 'Invalid public cache diagnostics hook')
    if (options.coordinator !== undefined
      && (!(options.coordinator.flights instanceof Map) || !(options.coordinator.generationFlights instanceof Map))) {
      throw new CacheError('CACHE_INPUT', 'Invalid public cache coordinator')
    }
    const maxPayloadBytes = options.maxPayloadBytes ?? 1_000_000
    if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 1 || maxPayloadBytes > MAX_PUBLIC_CACHE_PAYLOAD_BYTES) {
      throw new CacheError('CACHE_INPUT', 'Invalid public cache payload limit')
    }
    this.valueCache = options.valueCache
    this.now = options.now ?? (() => new Date())
    this.defer = options.defer ?? (task => { void task.catch(() => undefined) })
    this.maxPayloadBytes = maxPayloadBytes
    this.onAdapterError = options.onAdapterError ?? (() => undefined)
    const coordinator = options.coordinator ?? createPublicCacheCoordinator()
    this.flights = coordinator.flights
    this.generationFlights = coordinator.generationFlights
  }

  private currentTime(): Date {
    const value = this.now()
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new CacheError('CACHE_PROTOCOL', 'Cache clock is invalid')
    return value
  }

  private generationSnapshot(tagsInput: readonly string[]): Promise<Awaited<ReturnType<CacheGenerationStore['read']>>> {
    const tags = normalizeCacheTags(tagsInput)
    const key = tags.join('\0')
    const existing = this.generationFlights.get(key)
    if (existing) return existing
    const task = this.generations.read(tags).finally(() => {
      if (this.generationFlights.get(key) === task) this.generationFlights.delete(key)
    })
    this.generationFlights.set(key, task)
    return task
  }

  private async prepared(descriptor: PublicCacheDescriptor): Promise<PreparedCacheKey> {
    return prepareCacheKey(descriptor, await this.generationSnapshot(descriptor.tags))
  }

  private async deleteBestEffort(key: string): Promise<void> {
    this.valueCache?.delete(key)
    try { await this.adapter.delete(key) }
    catch (error) { try { this.onAdapterError('delete', error) } catch { /* diagnostics must not break fail-open caching */ } }
  }

  private async getPrepared<T extends PublicJsonValue>(prepared: PreparedCacheKey): Promise<PublicCacheResult<T>> {
    const local = this.valueCache?.get<T>(prepared.physicalKey, this.currentTime().getTime(), this.maxPayloadBytes)
    if (local && local.status !== 'miss') return local
    let raw
    try { raw = await this.adapter.get(prepared.physicalKey) }
    catch (error) { try { this.onAdapterError('get', error) } catch { /* diagnostics must not break fail-open caching */ }; return { status: 'miss' } }
    if (!raw) return { status: 'miss' }
    try {
      const value = parsePublicJson(decoder.decode(raw.bytes), { limits: { maxBytes: this.maxPayloadBytes + CACHE_ENVELOPE_HEADROOM_BYTES } })
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new CacheError('CACHE_PROTOCOL', 'Cache envelope is not an object')
      const envelope = value as unknown as CacheEnvelope
      if (envelope.v !== 1 || envelope.key !== prepared.fingerprint
        || !validDate(envelope.generatedAt) || !validDate(envelope.freshUntil) || !validDate(envelope.staleUntil)
        || typeof envelope.payloadDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(envelope.payloadDigest)) {
        throw new CacheError('CACHE_PROTOCOL', 'Cache envelope metadata is invalid')
      }
      const created = Date.parse(envelope.generatedAt)
      const fresh = Date.parse(envelope.freshUntil)
      const stale = Date.parse(envelope.staleUntil)
      if (!(created <= fresh && fresh <= stale)) throw new CacheError('CACHE_PROTOCOL', 'Cache envelope timestamps are invalid')
      const now = this.currentTime().getTime()
      if (!Number.isFinite(now) || created > now + 60_000) throw new CacheError('CACHE_PROTOCOL', 'Cache clock is invalid')
      const payload = stablePublicJson(envelope.payload, { limits: { maxBytes: this.maxPayloadBytes } })
      if (await sha256Hex(payload.json) !== envelope.payloadDigest) throw new CacheError('CACHE_PROTOCOL', 'Cache payload integrity check failed')
      if (now >= stale) { await this.deleteBestEffort(prepared.physicalKey); return { status: 'miss' } }
      const etag = `"vm-${envelope.payloadDigest}"`
      this.valueCache?.put(prepared.physicalKey, { value: payload.value, etag, generatedAt: envelope.generatedAt, freshUntil: fresh, staleUntil: stale, bytes: encoder.encode(payload.json).byteLength }, now)
      return { status: now < fresh ? 'fresh' : 'stale', value: payload.value as T, etag, generatedAt: envelope.generatedAt }
    }
    catch (error) {
      await this.deleteBestEffort(prepared.physicalKey)
      if (error instanceof CacheError || error instanceof ViewModelError || error instanceof TypeError || error instanceof SyntaxError) return { status: 'miss' }
      throw error
    }
  }

  async get<T extends PublicJsonValue>(descriptor: PublicCacheDescriptor): Promise<PublicCacheResult<T>> {
    return this.getPrepared<T>(await this.prepared(descriptor))
  }

  private normalizePayload<T extends PublicJsonValue>(value: T, maxBytes: number): { value: T; json: string; digest: Promise<string> } {
    const payload = stablePublicJson(value, { limits: { maxBytes } })
    return { value: payload.value as T, json: payload.json, digest: sha256Hex(payload.json) }
  }

  private async publishPrepared<T extends PublicJsonValue>(
    prepared: PreparedCacheKey,
    payload: { value: T; json: string; digest: Promise<string> },
    policy: Required<PublicCachePolicy>,
  ): Promise<T> {
    const payloadDigest = await payload.digest
    const generatedAt = this.currentTime()
    const generatedAtMs = generatedAt.getTime()
    const freshAtMs = generatedAtMs + policy.ttlSeconds * 1000
    const staleAtMs = generatedAtMs + (policy.ttlSeconds + policy.staleSeconds) * 1000
    if (!Number.isSafeInteger(freshAtMs) || !Number.isSafeInteger(staleAtMs)
      || !Number.isFinite(new Date(freshAtMs).getTime()) || !Number.isFinite(new Date(staleAtMs).getTime())) {
      throw new CacheError('CACHE_PROTOCOL', 'Public cache expiry overflowed')
    }
    const envelope: CacheEnvelope = {
      v: 1,
      key: prepared.fingerprint,
      generatedAt: generatedAt.toISOString(),
      freshUntil: new Date(freshAtMs).toISOString(),
      staleUntil: new Date(staleAtMs).toISOString(),
      payloadDigest,
      payload: payload.value,
    }
    const serialized = stablePublicJson(envelope, { limits: { maxBytes: policy.maxPayloadBytes + CACHE_ENVELOPE_HEADROOM_BYTES } })
    const bytes = encoder.encode(serialized.json)
    try {
      await this.adapter.put(prepared.physicalKey, { bytes, etag: `"vm-${payloadDigest}"` }, policy.ttlSeconds + policy.staleSeconds)
    }
    catch (error) { try { this.onAdapterError('put', error) } catch { /* diagnostics must not break fail-open caching */ } }
    this.valueCache?.put(prepared.physicalKey, { value: payload.value, etag: `"vm-${payloadDigest}"`, generatedAt: envelope.generatedAt, freshUntil: freshAtMs, staleUntil: staleAtMs, bytes: encoder.encode(payload.json).byteLength }, generatedAtMs)
    return payload.value
  }

  private async putPrepared<T extends PublicJsonValue>(prepared: PreparedCacheKey, value: T, inputPolicy: PublicCachePolicy): Promise<T> {
    const policy = selectedPolicy(inputPolicy, this.maxPayloadBytes)
    return this.publishPrepared(prepared, this.normalizePayload(value, policy.maxPayloadBytes), policy)
  }

  async put<T extends PublicJsonValue>(descriptor: PublicCacheDescriptor, value: T, inputPolicy: PublicCachePolicy): Promise<T> {
    return this.putPrepared(await this.prepared(descriptor), value, inputPolicy)
  }

  private loadSingleFlight<T extends PublicJsonValue>(
    prepared: PreparedCacheKey,
    inputPolicy: PublicCachePolicy,
    loader: () => Promise<T>,
  ): Promise<T> {
    const existing = this.flights.get(prepared.physicalKey)
    if (existing) return existing as Promise<T>
    const task = (async () => {
      const policy = selectedPolicy(inputPolicy, this.maxPayloadBytes)
      const loaded = this.normalizePayload(await loader(), policy.maxPayloadBytes)
      // Never publish a value created across an invalidation boundary. It may
      // still be returned to the request that loaded it, but the next request
      // receives a generation-specific miss and loads the new state.
      const current = await this.generations.read(prepared.tags)
      return sameGenerationVector(prepared, current)
        ? this.publishPrepared(prepared, loaded, policy)
        : loaded.value
    })().finally(() => {
      if (this.flights.get(prepared.physicalKey) === task) this.flights.delete(prepared.physicalKey)
    })
    this.flights.set(prepared.physicalKey, task)
    return task
  }

  async remember<T extends PublicJsonValue>(
    descriptor: PublicCacheDescriptor,
    inputPolicy: PublicCachePolicy,
    loader: () => Promise<T>,
  ): Promise<{ value: T; cache: 'hit' | 'stale' | 'miss'; etag: string | null }> {
    const prepared = await this.prepared(descriptor)
    const hit = await this.getPrepared<T>(prepared)
    if (hit.status === 'fresh') return { value: hit.value, cache: 'hit', etag: hit.etag }
    if (hit.status === 'stale') {
      const refresh = this.loadSingleFlight(prepared, inputPolicy, loader).then(() => undefined)
      try { this.defer(refresh) }
      catch { void refresh.catch(() => undefined) }
      return { value: hit.value, cache: 'stale', etag: hit.etag }
    }
    const value = await this.loadSingleFlight(prepared, inputPolicy, loader)
    return { value, cache: 'miss', etag: null }
  }
}
