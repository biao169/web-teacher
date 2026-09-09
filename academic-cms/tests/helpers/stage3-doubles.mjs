import { createHash } from 'node:crypto'

export async function streamBytes(stream) {
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function bodyBytes(body) {
  if (body instanceof Uint8Array) return body.slice()
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0))
  if (typeof Blob !== 'undefined' && body instanceof Blob) return new Uint8Array(await body.arrayBuffer())
  if (body instanceof ReadableStream) return streamBytes(body)
  throw new TypeError('Unsupported test body')
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export class R2BucketDouble {
  constructor(now = () => new Date('2026-08-29T00:00:00.000Z')) {
    this.now = now
    this.objects = new Map()
    this.counter = 0
    this.calls = { head: 0, get: 0, put: 0, delete: 0 }
  }

  metadata(key, record, extra = {}) {
    return {
      key,
      size: record.bytes.byteLength,
      etag: record.etag,
      httpEtag: `"${record.etag}"`,
      uploaded: new Date(record.uploaded),
      httpMetadata: { ...record.httpMetadata },
      customMetadata: { ...record.customMetadata },
      ...extra,
    }
  }

  async head(key) {
    this.calls.head += 1
    const record = this.objects.get(key)
    return record ? this.metadata(key, record) : null
  }

  async get(key, options = {}) {
    this.calls.get += 1
    const record = this.objects.get(key)
    if (!record) return null
    const condition = options.onlyIf instanceof Headers
      ? options.onlyIf.get('if-match')
      : options.onlyIf?.etagMatches
    if (condition && condition !== record.etag) return this.metadata(key, record)
    if (options.range) {
      const { offset, length } = options.range
      if (offset < 0 || length <= 0 || offset >= record.bytes.byteLength) return null
      const actualLength = Math.min(length, record.bytes.byteLength - offset)
      const slice = record.bytes.slice(offset, offset + actualLength)
      return this.metadata(key, record, {
        body: new Blob([slice]).stream(),
        range: { offset, length: actualLength },
      })
    }
    return this.metadata(key, record, { body: new Blob([record.bytes]).stream() })
  }

  async put(key, body, options = {}) {
    this.calls.put += 1
    const noneMatch = options.onlyIf instanceof Headers
      ? options.onlyIf.get('if-none-match')
      : options.onlyIf?.etagDoesNotMatch
    if (noneMatch === '*' && this.objects.has(key)) return null
    const bytes = await bodyBytes(body)
    const etag = `r2-${++this.counter}-${sha256(bytes).slice(0, 16)}`
    const record = {
      bytes,
      etag,
      uploaded: this.now().toISOString(),
      httpMetadata: { ...(options.httpMetadata ?? {}) },
      customMetadata: { ...(options.customMetadata ?? {}) },
    }
    this.objects.set(key, record)
    return this.metadata(key, record)
  }

  async delete(keyOrKeys) {
    this.calls.delete += 1
    for (const key of Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]) this.objects.delete(key)
  }
}

export class CacheDouble {
  constructor() {
    this.entries = new Map()
    this.calls = { match: 0, put: 0, delete: 0 }
  }
  async match(request) {
    this.calls.match += 1
    const response = this.entries.get(request.url)
    return response?.clone()
  }
  async put(request, response) {
    this.calls.put += 1
    this.entries.set(request.url, response.clone())
  }
  async delete(request) {
    this.calls.delete += 1
    return this.entries.delete(request.url)
  }
}

export class InMemoryMediaStore {
  constructor(kind = 'r2', now = () => new Date('2026-08-29T00:00:00.000Z')) {
    this.kind = kind
    this.now = now
    this.objects = new Map()
    this.calls = { head: 0, read: 0, put: 0, delete: 0 }
  }
  seed(key, bytes, { contentType = 'application/octet-stream', checksumSha256 = sha256(bytes) } = {}) {
    const copy = bytes.slice()
    this.objects.set(key, {
      bytes: copy,
      contentType,
      checksumSha256,
      etag: `"memory-${sha256(copy).slice(0, 24)}"`,
      lastModified: this.now(),
    })
  }
  headValue(key, record) {
    return {
      key,
      size: record.bytes.byteLength,
      etag: record.etag,
      lastModified: new Date(record.lastModified),
      contentType: record.contentType,
      checksumSha256: record.checksumSha256,
    }
  }
  async head(key) {
    this.calls.head += 1
    const record = this.objects.get(key)
    return record ? this.headValue(key, record) : null
  }
  async read(key, options = {}) {
    this.calls.read += 1
    const record = this.objects.get(key)
    if (!record) return null
    const expected = options.etagMatches?.replace(/^W\//, '').replace(/^"|"$/g, '')
    const actual = record.etag.replace(/^W\//, '').replace(/^"|"$/g, '')
    if (expected && expected !== actual) {
      const error = new Error('precondition')
      error.code = 'MEDIA_PRECONDITION'
      throw error
    }
    const range = options.range ?? null
    const bytes = range ? record.bytes.slice(range.offset, range.offset + range.length) : record.bytes.slice()
    return { head: this.headValue(key, record), body: new Blob([bytes]).stream(), range }
  }
  async put(input) {
    this.calls.put += 1
    if (this.objects.has(input.key)) throw new Error('conflict')
    const bytes = await bodyBytes(input.body)
    this.seed(input.key, bytes, { contentType: input.contentType, checksumSha256: input.checksumSha256 ?? sha256(bytes) })
    return this.head(input.key)
  }
  async delete(key) {
    this.calls.delete += 1
    return this.objects.delete(key)
  }
}

export function principal(overrides = {}) {
  const permissions = Object.create(null)
  permissions.publications = { view: true, create: false, edit: false, delete: false, export: false }
  permissions.media_assets = { view: true, create: false, edit: false, delete: false, export: false }
  return {
    sessionUid: 'session:1',
    userUid: 'user:1',
    username: 'admin',
    displayName: 'Admin',
    email: null,
    roleUid: 'role:staff',
    roleName: 'Staff',
    roleLevel: 100,
    roleIsSystem: false,
    visibilityScopes: new Set(['public', 'authenticated', 'staff', 'owner', 'hidden']),
    permissions,
    mustChangePassword: false,
    ...overrides,
  }
}

export function seedMediaAsset(db, input = {}) {
  const at = input.updatedAt ?? '2026-08-29T00:00:00.000Z'
  const key = input.objectKey ?? 'publications/paper.pdf'
  const size = input.size ?? 10
  db.prepare(`INSERT INTO media_assets
    (uid, created_at, updated_at, object_key, title, category, mime_type, size, storage_kind, status, checksum)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      input.uid ?? `media:${Math.random().toString(16).slice(2)}`,
      input.createdAt ?? at,
      at,
      key,
      input.title ?? 'Paper.pdf',
      input.category ?? 'publication',
      input.mimeType ?? 'application/pdf',
      size,
      input.storageKind ?? 'r2',
      input.status ?? 'active',
      input.checksum ?? null,
    )
  return key
}
