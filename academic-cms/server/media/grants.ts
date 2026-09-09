import type { MediaDisposition, MediaPurpose } from '../../shared/enums/media'
import { isMediaDisposition, isMediaPurpose } from '../../shared/enums/media'
import { validateCacheTag } from '../cache/keys'
import { base64UrlDecode, base64UrlEncode, constantTimeEqual, ownedArrayBuffer, utf8, utf8Length } from '../security/bytes'
import { parsePublicJson, stablePublicJson } from '../view-model/serializer'
import { MediaError, type MediaErrorCode } from './errors'
import { normalizeManagedObjectKey } from './object-key'

export type MediaGrantScope = 'public' | 'private'

export interface MediaGrantClaims {
  v: 1
  key: string
  scope: MediaGrantScope
  subject: string | null
  purpose: MediaPurpose
  disposition: MediaDisposition
  allowDownload: boolean
  assetRevision: string
  referenceRevision: string
  generations: Readonly<Record<string, number>>
  exp: number
}

export interface IssueMediaGrant {
  key: string
  scope: MediaGrantScope
  subject?: string | null
  purpose: MediaPurpose
  disposition: MediaDisposition
  allowDownload: boolean
  assetRevision: string
  referenceRevision: string
  generations: Readonly<Record<string, number>>
}

export interface MediaGrantOptions {
  publicSeconds?: number
  privateSeconds?: number
  clock?: () => Date
  subtle?: SubtleCrypto
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const TOKEN_PATTERN = /^([A-Za-z0-9_-]{16,4000})\.([A-Za-z0-9_-]{43})$/u
const EXACT_KEYS = [
  'allowDownload', 'assetRevision', 'disposition', 'exp', 'generations', 'key',
  'purpose', 'referenceRevision', 'scope', 'subject', 'v',
]
const MAX_GENERATION_TAGS = 8
const MAX_GENERATION = 9_007_199_254_740_990
const MAX_PAYLOAD_BYTES = 3_000

function isScope(value: unknown): value is MediaGrantScope {
  return value === 'public' || value === 'private'
}

function boundedRevision(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value || value !== value.normalize('NFC') || /[\u0000-\u001f\u007f]/u.test(value) || utf8Length(value) > 256) {
    throw new MediaError('MEDIA_INPUT', `Invalid ${name}`)
  }
  return value
}

function boundedSubject(value: unknown, scope: MediaGrantScope): string | null {
  if (scope === 'public') {
    if (value !== null && value !== undefined) throw new MediaError('MEDIA_INPUT', 'Public media grants cannot have a subject')
    return null
  }
  if (typeof value !== 'string' || !value || value !== value.normalize('NFC') || /[\u0000-\u001f\u007f]/u.test(value) || utf8Length(value) > 128) {
    throw new MediaError('MEDIA_INPUT', 'Private media grants require a valid subject')
  }
  return value
}

function seconds(value: number | undefined, fallback: number, name: string): number {
  const selected = value ?? fallback
  if (!Number.isSafeInteger(selected) || selected < 30 || selected > 3600) throw new MediaError('MEDIA_CONFIG', `Invalid ${name}`)
  return selected
}

function generationVector(value: unknown, errorCode: Extract<MediaErrorCode, 'MEDIA_INPUT' | 'MEDIA_FORBIDDEN'>): Readonly<Record<string, number>> {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new MediaError(errorCode, 'Invalid media grant generations')
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length < 1 || entries.length > MAX_GENERATION_TAGS) throw new MediaError(errorCode, 'Invalid media grant generation count')
  const result: Record<string, number> = Object.create(null) as Record<string, number>
  for (const [rawTag, rawGeneration] of entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    let tag: string
    try { tag = validateCacheTag(rawTag) }
    catch (error) { throw new MediaError(errorCode, 'Invalid media grant generation tag', { cause: error as Error }) }
    if (!Number.isSafeInteger(rawGeneration) || (rawGeneration as number) < 0 || (rawGeneration as number) > MAX_GENERATION) {
      throw new MediaError(errorCode, 'Invalid media grant generation value')
    }
    result[tag] = rawGeneration as number
  }
  return Object.freeze(result)
}

function parsedClaims(value: unknown): MediaGrantClaims {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new MediaError('MEDIA_FORBIDDEN', 'Invalid media grant')
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join('\0') !== EXACT_KEYS.join('\0')) throw new MediaError('MEDIA_FORBIDDEN', 'Invalid media grant shape')
  const scope = record.scope
  if (record.v !== 1 || !isScope(scope) || (record.subject !== null && typeof record.subject !== 'string')
    || typeof record.allowDownload !== 'boolean' || !isMediaPurpose(record.purpose) || !isMediaDisposition(record.disposition)
    || typeof record.assetRevision !== 'string' || typeof record.referenceRevision !== 'string'
    || typeof record.key !== 'string' || typeof record.exp !== 'number' || !Number.isSafeInteger(record.exp)) {
    throw new MediaError('MEDIA_FORBIDDEN', 'Invalid media grant fields')
  }
  try {
    return {
      v: 1,
      key: normalizeManagedObjectKey(record.key),
      scope,
      subject: boundedSubject(record.subject, scope),
      purpose: record.purpose,
      disposition: record.disposition,
      allowDownload: record.allowDownload,
      assetRevision: boundedRevision(record.assetRevision, 'asset revision'),
      referenceRevision: boundedRevision(record.referenceRevision, 'reference revision'),
      generations: generationVector(record.generations, 'MEDIA_FORBIDDEN'),
      exp: record.exp,
    }
  }
  catch (error) {
    if (error instanceof MediaError && error.code === 'MEDIA_FORBIDDEN') throw error
    throw new MediaError('MEDIA_FORBIDDEN', 'Invalid media grant fields', error instanceof Error ? { cause: error } : undefined)
  }
}

export class MediaGrantService {
  private readonly publicSeconds: number
  private readonly privateSeconds: number
  private readonly clock: () => Date
  private readonly subtle: SubtleCrypto
  private keyPromise: Promise<CryptoKey> | undefined

  constructor(private readonly secret: string, options: MediaGrantOptions = {}) {
    if (typeof secret !== 'string' || utf8Length(secret) < 32 || utf8Length(secret) > 4096) throw new MediaError('MEDIA_CONFIG', 'Media grant secret has an invalid length')
    if (options.clock !== undefined && typeof options.clock !== 'function') throw new MediaError('MEDIA_CONFIG', 'Media grant clock is invalid')
    const subtle = options.subtle ?? globalThis.crypto?.subtle
    if (!subtle || typeof subtle.importKey !== 'function' || typeof subtle.sign !== 'function') throw new MediaError('MEDIA_CONFIG', 'Web Crypto HMAC is unavailable')
    this.publicSeconds = seconds(options.publicSeconds, 300, 'public media grant lifetime')
    this.privateSeconds = seconds(options.privateSeconds, 120, 'private media grant lifetime')
    this.clock = options.clock ?? (() => new Date())
    this.subtle = subtle
  }

  private key(): Promise<CryptoKey> {
    this.keyPromise ??= this.subtle.importKey('raw', ownedArrayBuffer(utf8(this.secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return this.keyPromise
  }

  private async signature(encodedPayload: string): Promise<Uint8Array> {
    return new Uint8Array(await this.subtle.sign('HMAC', await this.key(), ownedArrayBuffer(utf8(`media-grant:v1\0${encodedPayload}`))))
  }

  private epochSeconds(): number {
    const value = this.clock()
    if (!(value instanceof Date)) throw new MediaError('MEDIA_CONFIG', 'Media grant clock is invalid')
    const now = Math.floor(value.getTime() / 1000)
    if (!Number.isSafeInteger(now)) throw new MediaError('MEDIA_CONFIG', 'Media grant clock is invalid')
    return now
  }

  async issue(input: IssueMediaGrant): Promise<string> {
    if (!input || typeof input !== 'object') throw new MediaError('MEDIA_INPUT', 'Media grant input is required')
    if (!isScope(input.scope)) throw new MediaError('MEDIA_INPUT', 'Invalid media grant scope')
    if (!isMediaPurpose(input.purpose)) throw new MediaError('MEDIA_INPUT', 'Invalid media purpose')
    if (!isMediaDisposition(input.disposition)) throw new MediaError('MEDIA_INPUT', 'Invalid media disposition')
    if (typeof input.allowDownload !== 'boolean') throw new MediaError('MEDIA_INPUT', 'Invalid media download flag')
    const now = this.epochSeconds()
    const lifetime = input.scope === 'public' ? this.publicSeconds : this.privateSeconds
    // Two-bucket expiry keeps URLs stable throughout a bucket while ensuring
    // every token has at least one full configured lifetime remaining.
    const exp = (Math.floor(now / lifetime) + 2) * lifetime
    const claims: MediaGrantClaims = {
      v: 1,
      key: normalizeManagedObjectKey(input.key),
      scope: input.scope,
      subject: boundedSubject(input.subject, input.scope),
      purpose: input.purpose,
      disposition: input.disposition,
      allowDownload: input.allowDownload,
      assetRevision: boundedRevision(input.assetRevision, 'asset revision'),
      referenceRevision: boundedRevision(input.referenceRevision, 'reference revision'),
      generations: generationVector(input.generations, 'MEDIA_INPUT'),
      exp,
    }
    const payload = stablePublicJson(claims, { limits: { maxBytes: MAX_PAYLOAD_BYTES, maxDepth: 5, maxNodes: 64 } }).json
    const encoded = base64UrlEncode(encoder.encode(payload))
    if (encoded.length > 4000) throw new MediaError('MEDIA_LIMIT', 'Media grant exceeds its token budget')
    return `${encoded}.${base64UrlEncode(await this.signature(encoded))}`
  }

  async verify(token: string, expectedKey: string): Promise<MediaGrantClaims> {
    if (typeof token !== 'string' || token.length > 4096) throw new MediaError('MEDIA_FORBIDDEN', 'Invalid media grant')
    const match = TOKEN_PATTERN.exec(token)
    if (!match) throw new MediaError('MEDIA_FORBIDDEN', 'Invalid media grant')
    const encoded = match[1]!
    const suppliedSignature = match[2]!
    let payloadBytes: Uint8Array
    let signature: Uint8Array
    try {
      payloadBytes = base64UrlDecode(encoded)
      signature = base64UrlDecode(suppliedSignature)
    }
    catch (error) { throw new MediaError('MEDIA_FORBIDDEN', 'Invalid media grant encoding', { cause: error as Error }) }
    if (payloadBytes.byteLength > MAX_PAYLOAD_BYTES || !constantTimeEqual(signature, await this.signature(encoded))) {
      throw new MediaError('MEDIA_FORBIDDEN', 'Invalid media grant signature or payload size')
    }
    let claims: MediaGrantClaims
    try { claims = parsedClaims(parsePublicJson(decoder.decode(payloadBytes), { limits: { maxBytes: MAX_PAYLOAD_BYTES, maxDepth: 5, maxNodes: 64 } })) }
    catch (error) {
      if (error instanceof MediaError) throw error
      throw new MediaError('MEDIA_FORBIDDEN', 'Invalid media grant payload', { cause: error as Error })
    }
    if (claims.key !== normalizeManagedObjectKey(expectedKey)) throw new MediaError('MEDIA_FORBIDDEN', 'Media grant does not match the requested object')
    const now = this.epochSeconds()
    const maximum = claims.scope === 'public' ? this.publicSeconds * 2 : this.privateSeconds * 2
    if (claims.exp <= now || claims.exp > now + maximum + 1) throw new MediaError('MEDIA_FORBIDDEN', 'Media grant has expired or has an invalid lifetime')
    return claims
  }

  remainingSeconds(claims: MediaGrantClaims): number {
    const remaining = claims.exp - this.epochSeconds()
    if (!Number.isSafeInteger(remaining) || remaining < 1) throw new MediaError('MEDIA_FORBIDDEN', 'Media grant has expired')
    return remaining
  }

  authorizeSubject(claims: MediaGrantClaims, principalUid: string | null): void {
    if (claims.scope === 'private' && (!principalUid || claims.subject !== principalUid)) {
      throw new MediaError('MEDIA_FORBIDDEN', 'Media grant subject does not match the session')
    }
  }
}
