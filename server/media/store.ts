import { hasUnpairedSurrogate } from '../../shared/utils/unicode'
import { MediaError, mediaStorageError } from './errors'
import { normalizeManagedObjectKey } from './object-key'

export interface ByteRange {
  offset: number
  length: number
}

export type MediaBody = ReadableStream<Uint8Array> | Uint8Array | ArrayBuffer | Blob

export interface StoredMediaHead {
  key: string
  size: number
  etag: string
  lastModified: Date
  contentType: string | null
  checksumSha256: string | null
}

export interface StoredMediaRead {
  head: StoredMediaHead
  body: ReadableStream<Uint8Array>
  range: ByteRange | null
}

export interface PutMediaInput {
  key: string
  body: MediaBody
  size: number
  contentType: string
  checksumSha256?: string | null
  fileName?: string | null
  cacheControl?: string | null
}

export interface MediaStore {
  /** Enumerate only managed objects; static and external stores are not scanned. */
  scanEntries?(): AsyncIterable<{ key: string; skipped?: boolean; error?: boolean }>
  readonly kind: 'local' | 'r2' | 'static'
  head(key: string): Promise<StoredMediaHead | null>
  read(key: string, options?: { range?: ByteRange | null; etagMatches?: string | null }): Promise<StoredMediaRead | null>
  put(input: PutMediaInput): Promise<StoredMediaHead>
  delete(key: string): Promise<boolean>
}

export const MAX_MEDIA_OBJECT_BYTES = 1024 * 1024 * 1024
const encoder = new TextEncoder()
const MIME_TOKEN = /^[A-Za-z0-9!#$&^_.+\-*']+$/u

export function assertByteRange(range: ByteRange | null | undefined): ByteRange | null {
  if (range === null || range === undefined) return null
  if (!Number.isSafeInteger(range.offset) || !Number.isSafeInteger(range.length) || range.offset < 0 || range.length <= 0) {
    throw new MediaError('MEDIA_RANGE', 'Invalid media byte range')
  }
  if (range.offset + range.length > Number.MAX_SAFE_INTEGER) throw new MediaError('MEDIA_RANGE', 'Media byte range overflows')
  return { offset: range.offset, length: range.length }
}

export function assertSha256(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new MediaError('MEDIA_INPUT', 'Invalid SHA-256 checksum')
  return value
}

function contentType(value: unknown): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 3 || value.length > 255
    || /[\u0000-\u001f\u007f]/u.test(value) || value.includes(';')) {
    throw new MediaError('MEDIA_INPUT', 'Invalid media content type')
  }
  const parts = value.split('/')
  if (parts.length !== 2 || !MIME_TOKEN.test(parts[0]!) || !MIME_TOKEN.test(parts[1]!)) {
    throw new MediaError('MEDIA_INPUT', 'Invalid media content type')
  }
  return `${parts[0]!.toLowerCase()}/${parts[1]!.toLowerCase()}`
}

function optionalMetadata(value: unknown, name: string, maxBytes: number): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string' || !value || value !== value.normalize('NFC') || hasUnpairedSurrogate(value)
    || /[\u0000-\u001f\u007f]/u.test(value) || encoder.encode(value).byteLength > maxBytes) {
    throw new MediaError('MEDIA_INPUT', `Invalid media ${name}`)
  }
  return value
}

export function assertPutMediaInput(input: PutMediaInput): PutMediaInput {
  if (!input || typeof input !== 'object') throw new MediaError('MEDIA_INPUT', 'Media upload input is required')
  const key = normalizeManagedObjectKey(input.key)
  if (!Number.isSafeInteger(input.size) || input.size < 0 || input.size > MAX_MEDIA_OBJECT_BYTES) {
    throw new MediaError('MEDIA_LIMIT', 'Media object size is invalid')
  }
  const normalizedFileName = optionalMetadata(input.fileName, 'file name', 512)
  const normalizedCacheControl = optionalMetadata(input.cacheControl, 'cache control', 512)
  return {
    ...input,
    key,
    contentType: contentType(input.contentType),
    checksumSha256: assertSha256(input.checksumSha256),
    ...(normalizedFileName === undefined ? {} : { fileName: normalizedFileName }),
    ...(normalizedCacheControl === undefined ? {} : { cacheControl: normalizedCacheControl }),
  }
}

export function mediaBodyStream(body: MediaBody): ReadableStream<Uint8Array> {
  if (body instanceof ReadableStream) return body
  if (body instanceof Uint8Array) {
    const copy = body.slice()
    return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(copy); controller.close() } })
  }
  if (body instanceof ArrayBuffer) {
    const copy = new Uint8Array(body.slice(0))
    return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(copy); controller.close() } })
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) return body.stream()
  throw new MediaError('MEDIA_INPUT', 'Unsupported media body')
}


/** Ensures a provider stream exactly matches metadata before completion. */
export function exactMediaBody(body: ReadableStream<Uint8Array>, expectedLength: number): ReadableStream<Uint8Array> {
  if (!(body instanceof ReadableStream) || !Number.isSafeInteger(expectedLength) || expectedLength < 0) {
    throw new MediaError('MEDIA_PROTOCOL', 'Invalid media body length contract')
  }
  const reader = body.getReader()
  let received = 0
  let released = false
  const release = () => {
    if (released) return
    released = true
    try { reader.releaseLock() }
    catch { /* reader may already be released by the runtime */ }
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read()
        if (result.done) {
          release()
          if (received !== expectedLength) throw new MediaError('MEDIA_PROTOCOL', 'Media body ended before its declared length')
          controller.close()
          return
        }
        if (!(result.value instanceof Uint8Array)) throw new MediaError('MEDIA_PROTOCOL', 'Media provider returned a non-byte stream')
        if (received + result.value.byteLength > expectedLength) {
          try { await reader.cancel('media body exceeded declared length') }
          catch { /* cancellation is best effort */ }
          release()
          throw new MediaError('MEDIA_PROTOCOL', 'Media body exceeded its declared length')
        }
        received += result.value.byteLength
        if (result.value.byteLength > 0) controller.enqueue(result.value)
      }
      catch (error) {
        release()
        controller.error(error instanceof MediaError ? error : mediaStorageError(error))
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason) }
      finally { release() }
    },
  })
}
