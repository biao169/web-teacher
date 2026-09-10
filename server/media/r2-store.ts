import { MediaError, mediaStorageError } from './errors'
import { normalizeManagedObjectKey } from './object-key'
import {
  assertByteRange,
  assertPutMediaInput,
  exactMediaBody,
  type ByteRange,
  type MediaStore,
  type PutMediaInput,
  type StoredMediaHead,
  type StoredMediaRead,
} from './store'

interface R2ObjectLike {
  key: string
  size: number
  etag: string
  httpEtag?: string
  uploaded: Date
  httpMetadata?: { contentType?: string }
  customMetadata?: Record<string, string>
  range?: { offset: number; length: number }
}
interface R2ObjectBodyLike extends R2ObjectLike { body: ReadableStream<Uint8Array> }
type R2Conditional = { etagMatches?: string; etagDoesNotMatch?: string }
interface R2BucketLike {
  head(key: string): Promise<R2ObjectLike | null>
  get(key: string, options?: { range?: ByteRange; onlyIf?: R2Conditional | Headers }): Promise<R2ObjectLike | R2ObjectBodyLike | null>
  put(key: string, body: PutMediaInput['body'], options?: {
    onlyIf?: R2Conditional | Headers
    httpMetadata?: { contentType?: string; contentDisposition?: string; cacheControl?: string }
    customMetadata?: Record<string, string>
    sha256?: string
  }): Promise<R2ObjectLike | null>
  delete(key: string | string[]): Promise<void>
}

function checksumOf(object: R2ObjectLike): string | null {
  const checksum = object.customMetadata?.sha256
  if (checksum === undefined) return null
  if (!/^[0-9a-f]{64}$/u.test(checksum)) throw new MediaError('MEDIA_PROTOCOL', 'R2 returned an invalid SHA-256 metadata value')
  return checksum
}

function objectEtag(object: R2ObjectLike): string {
  if (typeof object.etag !== 'string' || object.etag.length < 1 || object.etag.length > 256 || /[\u0000-\u001f\u007f"]/u.test(object.etag)) {
    throw new MediaError('MEDIA_PROTOCOL', 'R2 returned an invalid object ETag')
  }
  if (object.httpEtag === undefined) return `"${object.etag}"`
  if (!/^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/u.test(object.httpEtag)
    || object.httpEtag.replace(/^W\//u, '').slice(1, -1) !== object.etag) {
    throw new MediaError('MEDIA_PROTOCOL', 'R2 returned an invalid HTTP ETag')
  }
  return object.httpEtag
}

function contentTypeOf(object: R2ObjectLike): string | null {
  const value = object.httpMetadata?.contentType
  if (value === undefined) return null
  if (typeof value !== 'string' || value.length < 1 || value.length > 255 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new MediaError('MEDIA_PROTOCOL', 'R2 returned an invalid content type')
  }
  return value
}

function normalizeObject(object: R2ObjectLike, expectedKey: string, maxObjectBytes: number): StoredMediaHead {
  if (object.key !== expectedKey || !Number.isSafeInteger(object.size) || object.size < 0 || object.size > maxObjectBytes
    || !(object.uploaded instanceof Date) || !Number.isFinite(object.uploaded.getTime())) {
    throw new MediaError('MEDIA_PROTOCOL', 'R2 returned invalid object metadata')
  }
  return {
    key: expectedKey,
    size: object.size,
    etag: objectEtag(object),
    lastModified: new Date(object.uploaded.getTime()),
    contentType: contentTypeOf(object),
    checksumSha256: checksumOf(object),
  }
}

function assertBucket(bucket: R2BucketLike): void {
  if (!bucket || typeof bucket !== 'object'
    || typeof bucket.head !== 'function' || typeof bucket.get !== 'function'
    || typeof bucket.put !== 'function' || typeof bucket.delete !== 'function') {
    throw new MediaError('MEDIA_CONFIG', 'R2 bucket binding is invalid')
  }
}

export class R2MediaStore implements MediaStore {
  readonly kind = 'r2' as const
  private readonly maxObjectBytes: number

  constructor(private readonly bucket: R2BucketLike, options: { maxObjectBytes?: number } = {}) {
    assertBucket(bucket)
    this.maxObjectBytes = options.maxObjectBytes ?? 100 * 1024 * 1024
    if (!Number.isSafeInteger(this.maxObjectBytes) || this.maxObjectBytes < 1 || this.maxObjectBytes > 1024 * 1024 * 1024) {
      throw new MediaError('MEDIA_CONFIG', 'Invalid R2 media size limit')
    }
  }

  private async rollbackCreatedObject(key: string, created: R2ObjectLike): Promise<void> {
    if (created.key !== key || typeof created.etag !== 'string' || !created.etag || /[\u0000-\u001f\u007f]/u.test(created.etag)) return
    const current = await this.bucket.head(key)
    if (current?.key === key && current.etag === created.etag) await this.bucket.delete(key)
  }

  async head(keyInput: string): Promise<StoredMediaHead | null> {
    const key = normalizeManagedObjectKey(keyInput)
    try {
      const object = await this.bucket.head(key)
      return object ? normalizeObject(object, key, this.maxObjectBytes) : null
    }
    catch (error) { throw mediaStorageError(error) }
  }

  async read(keyInput: string, options: { range?: ByteRange | null; etagMatches?: string | null } = {}): Promise<StoredMediaRead | null> {
    const key = normalizeManagedObjectKey(keyInput)
    const range = assertByteRange(options.range)
    try {
      const object = await this.bucket.get(key, {
        ...(range ? { range } : {}),
        ...(options.etagMatches ? { onlyIf: { etagMatches: options.etagMatches.replace(/^W\//u, '').replace(/^"|"$/gu, '') } } : {}),
      })
      if (!object) return null
      if (!('body' in object) || !(object.body instanceof ReadableStream)) throw new MediaError('MEDIA_PRECONDITION', 'R2 object changed before it could be read')
      const head = normalizeObject(object, key, this.maxObjectBytes)
      const returnedRange = object.range ? assertByteRange(object.range) : range
      if (!range && returnedRange) throw new MediaError('MEDIA_PROTOCOL', 'R2 returned a byte range for a full object request')
      if (range && (!returnedRange || returnedRange.offset !== range.offset || returnedRange.length !== Math.min(range.length, head.size - range.offset))) {
        throw new MediaError('MEDIA_PROTOCOL', 'R2 returned an unexpected byte range')
      }
      return { head, body: exactMediaBody(object.body, returnedRange?.length ?? head.size), range: returnedRange }
    }
    catch (error) { throw mediaStorageError(error) }
  }

  async put(inputValue: PutMediaInput): Promise<StoredMediaHead> {
    const input = assertPutMediaInput(inputValue)
    if (input.size > this.maxObjectBytes) throw new MediaError('MEDIA_LIMIT', 'Media object exceeds the R2 size limit')
    try {
      // Headers preserve the HTTP wildcard semantics of If-None-Match: *.
      const onlyIf = new Headers({ 'if-none-match': '*' })
      const object = await this.bucket.put(input.key, input.body, {
        onlyIf,
        httpMetadata: {
          contentType: input.contentType,
          ...(input.fileName ? { contentDisposition: `attachment; filename="${input.fileName.replace(/["\\]/gu, '_')}"` } : {}),
          ...(input.cacheControl ? { cacheControl: input.cacheControl } : {}),
        },
        ...(input.checksumSha256 ? { customMetadata: { sha256: input.checksumSha256 }, sha256: input.checksumSha256 } : {}),
      })
      if (!object) throw new MediaError('MEDIA_CONFLICT', 'Media object key already exists')
      try {
        const head = normalizeObject(object, input.key, this.maxObjectBytes)
        if (head.size !== input.size) throw new MediaError('MEDIA_PROTOCOL', 'R2 stored an unexpected object size')
        if (input.checksumSha256 && head.checksumSha256 !== input.checksumSha256) {
          throw new MediaError('MEDIA_PROTOCOL', 'R2 did not preserve the declared checksum metadata')
        }
        return { ...head, checksumSha256: input.checksumSha256 ?? head.checksumSha256 }
      }
      catch (validationError) {
        try { await this.rollbackCreatedObject(input.key, object) }
        catch (cleanupError) {
          throw new MediaError('MEDIA_STORAGE', 'R2 object validation and rollback both failed', {
            cause: new AggregateError([validationError, cleanupError], 'R2 media publish rollback failed'),
          })
        }
        throw validationError
      }
    }
    catch (error) { throw mediaStorageError(error) }
  }

  async delete(keyInput: string): Promise<boolean> {
    const key = normalizeManagedObjectKey(keyInput)
    try {
      if (!await this.bucket.head(key)) return false
      await this.bucket.delete(key)
      return true
    }
    catch (error) { throw mediaStorageError(error) }
  }
}
