import type { RawCacheAdapter, RawCacheEntry } from './contracts'
import { MAX_CACHE_RETENTION_SECONDS, MAX_PUBLIC_CACHE_PAYLOAD_BYTES } from './config'
import { CacheError } from './errors'
import { cacheRequestUrl } from './keys'

export interface CacheLike {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
  delete(request: Request): Promise<boolean>
}

const CACHE_CONTENT_TYPE = 'application/vnd.academic-cms.cache+json; charset=utf-8'
const CACHE_FORMAT = '1'

function strictLength(value: string | null, maximum: number): number | null {
  if (value === null || !/^(?:0|[1-9][0-9]*)$/u.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maximum ? parsed : null
}

function cacheEtag(value: string | null): string | null | undefined {
  if (value === null) return null
  if (value.length < 1 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) return undefined
  return value
}

export class CloudflareCacheAdapter implements RawCacheAdapter {
  readonly kind = 'cloudflare' as const
  constructor(private readonly cache: CacheLike, private readonly origin: string, private readonly maxEntryBytes = MAX_PUBLIC_CACHE_PAYLOAD_BYTES) {
    if (!cache || typeof cache.match !== 'function' || typeof cache.put !== 'function' || typeof cache.delete !== 'function') throw new CacheError('CACHE_INPUT', 'Cloudflare cache binding is invalid')
    cacheRequestUrl(origin, `v1/validation/${'0'.repeat(64)}`)
    if (!Number.isSafeInteger(maxEntryBytes) || maxEntryBytes < 1) throw new CacheError('CACHE_INPUT', 'Invalid Cloudflare cache entry limit')
  }

  private request(key: string): Request {
    return new Request(cacheRequestUrl(this.origin, key), { method: 'GET' })
  }

  async get(key: string): Promise<RawCacheEntry | null> {
    const response = await this.cache.match(this.request(key))
    if (!response) return null
    const length = strictLength(response.headers.get('content-length'), this.maxEntryBytes)
    const etag = cacheEtag(response.headers.get('etag'))
    if (response.status !== 200
      || response.headers.get('content-type') !== CACHE_CONTENT_TYPE
      || response.headers.get('x-cms-cache-format') !== CACHE_FORMAT
      || length === null
      || etag === undefined) {
      await this.delete(key)
      return null
    }
    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.byteLength !== length || buffer.byteLength > this.maxEntryBytes) {
      await this.delete(key)
      return null
    }
    return { bytes: buffer, etag }
  }

  async put(key: string, entry: RawCacheEntry, retentionSeconds: number): Promise<void> {
    if (!Number.isSafeInteger(retentionSeconds) || retentionSeconds < 1 || retentionSeconds > MAX_CACHE_RETENTION_SECONDS) throw new CacheError('CACHE_INPUT', 'Invalid cache retention')
    if (!(entry.bytes instanceof Uint8Array) || entry.bytes.byteLength > this.maxEntryBytes) throw new CacheError('CACHE_LIMIT', 'Cache entry exceeds Cloudflare limit')
    const etag = cacheEtag(entry.etag)
    if (etag === undefined) throw new CacheError('CACHE_INPUT', 'Invalid cache ETag')
    const headers = new Headers({
      'cache-control': `public, max-age=${retentionSeconds}`,
      'content-length': String(entry.bytes.byteLength),
      'content-type': CACHE_CONTENT_TYPE,
      'x-content-type-options': 'nosniff',
      'x-cms-cache-format': CACHE_FORMAT,
    })
    if (etag !== null) headers.set('etag', etag)
    const copy = new Uint8Array(entry.bytes.byteLength)
    copy.set(entry.bytes)
    await this.cache.put(this.request(key), new Response(copy.buffer, { status: 200, headers }))
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(this.request(key))
  }
}
