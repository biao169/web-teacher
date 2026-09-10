import { MediaError, mediaStorageError } from './errors'
import { encodeObjectKeyPath, normalizeManagedObjectKey } from './object-key'
import { assertByteRange, exactMediaBody, type ByteRange, type MediaStore, type PutMediaInput, type StoredMediaHead, type StoredMediaRead } from './store'

export interface FetcherLike { fetch(request: Request): Promise<Response> }

function dateHeader(value: string | null): Date {
  if (value === null) return new Date(0)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new MediaError('MEDIA_PROTOCOL', 'Static asset returned an invalid Last-Modified')
  return new Date(parsed)
}

function integerHeader(value: string | null, name: string): number {
  if (value === null || !/^(?:0|[1-9][0-9]*)$/u.test(value)) throw new MediaError('MEDIA_PROTOCOL', `Static asset returned an invalid ${name}`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new MediaError('MEDIA_PROTOCOL', `Static asset returned an invalid ${name}`)
  return parsed
}

interface ParsedContentRange { offset: number; end: number; length: number; total: number }

function parseContentRange(value: string | null): ParsedContentRange {
  const match = value ? /^bytes (0|[1-9][0-9]*)-(0|[1-9][0-9]*)\/(0|[1-9][0-9]*)$/u.exec(value) : null
  if (!match) throw new MediaError('MEDIA_PROTOCOL', 'Static asset returned an invalid Content-Range')
  const offset = Number(match[1])
  const end = Number(match[2])
  const total = Number(match[3])
  if (![offset, end, total].every(Number.isSafeInteger) || offset < 0 || end < offset || total < 1 || end >= total) {
    throw new MediaError('MEDIA_PROTOCOL', 'Static asset returned an invalid Content-Range')
  }
  return { offset, end, length: end - offset + 1, total }
}

function cleanEtag(value: string): string { return value.replace(/^W\//u, '').replace(/^"|"$/gu, '') }

export class FetchMediaStore implements MediaStore {
  readonly kind = 'static' as const
  constructor(private readonly fetcher: FetcherLike, private readonly origin = 'https://assets.internal') {
    let parsed: URL
    try { parsed = new URL(origin) }
    catch (error) { throw new MediaError('MEDIA_CONFIG', 'Invalid static asset origin', { cause: error as Error }) }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new MediaError('MEDIA_CONFIG', 'Static asset origin must be an HTTPS authority')
    }
  }

  private request(keyInput: string, method: 'GET' | 'HEAD', headers?: HeadersInit): { key: string; request: Request } {
    const key = normalizeManagedObjectKey(keyInput)
    const url = new URL(`/${encodeObjectKeyPath(key)}`, this.origin)
    return { key, request: new Request(url, { method, redirect: 'error', ...(headers === undefined ? {} : { headers }) }) }
  }

  private metadata(key: string, response: Response, range: ByteRange | null): { head: StoredMediaHead; returnedRange: ByteRange | null } {
    const length = integerHeader(response.headers.get('content-length'), 'Content-Length')
    const parsedRange = range ? parseContentRange(response.headers.get('content-range')) : null
    if (range && (!parsedRange || parsedRange.offset !== range.offset || parsedRange.length !== range.length || length !== range.length)) {
      throw new MediaError('MEDIA_PROTOCOL', 'Static asset returned an unexpected byte range')
    }
    if (!range && response.headers.has('content-range')) throw new MediaError('MEDIA_PROTOCOL', 'Static asset returned Content-Range for a full representation')
    const total = parsedRange?.total ?? length
    const etag = response.headers.get('etag') ?? `W/"static-${total}"`
    return {
      head: {
        key,
        size: total,
        etag,
        lastModified: dateHeader(response.headers.get('last-modified')),
        contentType: response.headers.get('content-type'),
        checksumSha256: null,
      },
      returnedRange: parsedRange ? { offset: parsedRange.offset, length: parsedRange.length } : null,
    }
  }

  async head(keyInput: string): Promise<StoredMediaHead | null> {
    const { key, request } = this.request(keyInput, 'HEAD')
    try {
      const response = await this.fetcher.fetch(request)
      if (response.status === 404) return null
      if (response.status !== 200) throw new MediaError('MEDIA_STORAGE', `Static asset HEAD failed with ${response.status}`)
      return this.metadata(key, response, null).head
    }
    catch (error) { throw mediaStorageError(error) }
  }

  async read(keyInput: string, options: { range?: ByteRange | null; etagMatches?: string | null } = {}): Promise<StoredMediaRead | null> {
    const range = assertByteRange(options.range)
    const headers = new Headers()
    if (range) headers.set('range', `bytes=${range.offset}-${range.offset + range.length - 1}`)
    if (options.etagMatches) headers.set('if-match', options.etagMatches)
    const { key, request } = this.request(keyInput, 'GET', headers)
    try {
      const response = await this.fetcher.fetch(request)
      if (response.status === 404) return null
      if (response.status === 412) throw new MediaError('MEDIA_PRECONDITION', 'Static asset changed before it could be read')
      if (response.status === 416) throw new MediaError('MEDIA_RANGE', 'Static asset range is not satisfiable')
      if (!(response.status === 200 || response.status === 206) || !response.body) throw new MediaError('MEDIA_STORAGE', `Static asset read failed with ${response.status}`)
      if (range && response.status !== 206) throw new MediaError('MEDIA_PROTOCOL', 'Static asset ignored a byte range')
      if (!range && response.status !== 200) throw new MediaError('MEDIA_PROTOCOL', 'Static asset returned a partial response unexpectedly')
      const metadata = this.metadata(key, response, range)
      if (options.etagMatches && cleanEtag(metadata.head.etag) !== cleanEtag(options.etagMatches)) {
        throw new MediaError('MEDIA_PRECONDITION', 'Static asset changed before it could be read')
      }
      return { head: metadata.head, body: exactMediaBody(response.body as ReadableStream<Uint8Array>, metadata.returnedRange?.length ?? metadata.head.size), range: metadata.returnedRange }
    }
    catch (error) { throw mediaStorageError(error) }
  }

  async put(_input: PutMediaInput): Promise<StoredMediaHead> {
    throw new MediaError('MEDIA_FORBIDDEN', 'Static assets are read-only')
  }

  async delete(_key: string): Promise<boolean> {
    throw new MediaError('MEDIA_FORBIDDEN', 'Static assets are read-only')
  }
}
