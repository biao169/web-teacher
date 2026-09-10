import type { Row } from '../../../db/models'
import type { MediaProjectionRequest, MediaViewModel, MissingMediaViewModel } from '../../../shared/contracts/media'
import { isAuthModule, isVisibilityScope } from '../../../shared/enums/auth'
import { isMediaDisposition, isMediaPurpose, type MediaPurpose, type MediaStorageKind } from '../../../shared/enums/media'
import { hasUnpairedSurrogate } from '../../../shared/utils/unicode'
import { cacheRecordTag } from '../../cache/invalidation-map'
import { hasPermission, type AuthenticatedPrincipal } from '../../security/permissions'
import { ownedArrayBuffer } from '../../security/bytes'
import { canAccessVisibility } from '../../security/visibility'
import { MediaError } from '../../media/errors'
import type { MediaGrantClaims } from '../../media/grants'
import { MediaGrantService } from '../../media/grants'
import {
  contentDisposition,
  evaluateMediaPreconditions,
  ifRangeMatches,
  isInlineMediaType,
  mediaCacheControl,
  mediaKind,
  parseSingleRange,
  safeDownloadName,
  safeMimeType,
  strongChecksumEtag,
  type MediaPreconditions,
} from '../../media/http'
import { encodeObjectKeyPath, normalizeExternalMediaUrl, normalizeManagedObjectKey } from '../../media/object-key'
import { exactMediaBody, type MediaStore, type StoredMediaHead } from '../../media/store'
import { MediaCatalogStore } from './media-catalog-store'

export interface MediaStoreSet {
  local?: MediaStore
  r2?: MediaStore
  static?: MediaStore
}

export interface MediaRequestInput extends MediaPreconditions {
  objectKey: string
  grant: string
  method: 'GET' | 'HEAD'
  range?: string | null
  ifRange?: string | null
  download?: boolean
}

export interface MediaResponsePlan {
  status: 200 | 206 | 304 | 412 | 416
  headers: Readonly<Record<string, string>>
  body: ReadableStream<Uint8Array> | null
}

export interface MediaStorageInspection {
  objectKey: string
  storageKind: MediaStorageKind
  exists: boolean | null
  actualSize: number | null
  sizeMatches: boolean | null
  checksumMatches: boolean | null
  checksumVerified: boolean
  mimeMatches: boolean | null
  consistent: boolean | null
  checkedAt: string
  note: string | null
}

export interface MediaBackupObject {
  objectKey: string
  storageKind: 'local' | 'r2'
  mimeType: string
  size: number
  checksumSha256: string
  bytes: Uint8Array
}

export interface MediaBackupRestoreResult {
  objectKey: string
  storageKind: 'local' | 'r2'
  created: boolean
}

export type PrincipalResolver = () => Promise<AuthenticatedPrincipal | null>

const MAX_PROJECTIONS = 500
const MEDIA_POLICY_TAG = 'public:media-policy'
const encoder = new TextEncoder()

function storeFor(stores: MediaStoreSet, kind: MediaStorageKind): MediaStore {
  const store = kind === 'local' ? stores.local : kind === 'r2' ? stores.r2 : kind === 'static' ? stores.static : undefined
  if (!store || store.kind !== kind) throw new MediaError('MEDIA_CONFIG', `Media store is not configured for ${kind}`)
  return store
}

function defaultFileName(asset: Row<'media_assets'>): string {
  if (asset.title?.trim()) return safeDownloadName(asset.title)
  if (asset.storage_kind === 'external') {
    try { return safeDownloadName(new URL(asset.object_key).pathname.split('/').pop()) }
    catch { return 'download' }
  }
  return safeDownloadName(asset.object_key.split('/').pop())
}

function boundedText(value: string | null | undefined, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new MediaError('MEDIA_INPUT', 'Invalid media presentation text')
  }
  const canonical = value.normalize('NFC')
  if (encoder.encode(canonical).byteLength > 4096) throw new MediaError('MEDIA_INPUT', 'Invalid media presentation text')
  return canonical
}
function dimension(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isSafeInteger(value) || value < 1 || value > 32_768) throw new MediaError('MEDIA_INPUT', 'Invalid media dimension')
  return value
}

function boundedIdentifier(value: unknown, name: string, maxBytes = 256): string {
  if (typeof value !== 'string' || !value || value !== value.normalize('NFC') || hasUnpairedSurrogate(value)
    || /[\u0000-\u001f\u007f]/u.test(value) || encoder.encode(value).byteLength > maxBytes) {
    throw new MediaError('MEDIA_INPUT', `Invalid media ${name}`)
  }
  return value
}

const MEDIA_FALLBACKS = new Set(['initials', 'placeholder', 'none'])

function validateProjectionRequest(request: MediaProjectionRequest): void {
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || !isAuthModule(request.module) || !isVisibilityScope(request.visibility)
    || (request.secondaryVisibility !== undefined && request.secondaryVisibility !== null && !isVisibilityScope(request.secondaryVisibility))
    || !isMediaPurpose(request.purpose)
    || (request.disposition !== undefined && !isMediaDisposition(request.disposition))
    || (request.allowDownload !== undefined && typeof request.allowDownload !== 'boolean')
    || (request.fallback !== undefined && !MEDIA_FALLBACKS.has(request.fallback))) {
    throw new MediaError('MEDIA_INPUT', 'Invalid media projection')
  }
  if (request.objectKey !== null && typeof request.objectKey !== 'string') throw new MediaError('MEDIA_INPUT', 'Invalid media object key')
  boundedIdentifier(request.recordUid, 'record UID')
  boundedIdentifier(request.referenceRevision, 'reference revision')
  if (request.ownerUid !== undefined && request.ownerUid !== null) boundedIdentifier(request.ownerUid, 'owner UID', 128)
  if ((request.visibility === 'owner' || request.secondaryVisibility === 'owner') && !request.ownerUid) {
    throw new MediaError('MEDIA_INPUT', 'Owner-visible media requires an owner UID')
  }
  boundedText(request.alt)
  boundedText(request.title)
  dimension(request.width)
  dimension(request.height)
}

function expectedKind(purpose: MediaPurpose): 'image' | 'pdf' | 'file' {
  if (!isMediaPurpose(purpose)) throw new MediaError('MEDIA_INPUT', 'Invalid media purpose')
  if (['avatar', 'logo', 'favicon', 'og_image', 'cover'].includes(purpose)) return 'image'
  if (purpose === 'publication_pdf') return 'pdf'
  return 'file'
}

function missing(request: MediaProjectionRequest): MissingMediaViewModel {
  return {
    available: false,
    alt: boundedText(request.alt),
    kind: expectedKind(request.purpose),
    fallback: request.fallback ?? (expectedKind(request.purpose) === 'image' ? 'placeholder' : 'none'),
  }
}

function projectionAllowed(request: MediaProjectionRequest, principal: AuthenticatedPrincipal | null): boolean {
  if (!canAccessVisibility({ visibility: request.visibility, principal, ownerUid: request.ownerUid ?? null })) return false
  if (request.secondaryVisibility && !canAccessVisibility({ visibility: request.secondaryVisibility, principal, ownerUid: request.ownerUid ?? null })) return false
  const permissionRequired = request.visibility === 'staff' || request.visibility === 'hidden'
    || request.secondaryVisibility === 'staff' || request.secondaryVisibility === 'hidden'
  return !permissionRequired || hasPermission(principal, request.module, 'view')
}

function publicProjection(request: MediaProjectionRequest): boolean {
  return projectionAllowed(request, null)
}

function normalizedAssetKey(asset: Row<'media_assets'>): string {
  return asset.storage_kind === 'external' ? normalizeExternalMediaUrl(asset.object_key) : normalizeManagedObjectKey(asset.object_key)
}

export function mediaAssetRevision(asset: Row<'media_assets'>): string {
  const value = `${asset.uid}:${asset.updated_at}:${asset.storage_kind}:${asset.size}:${asset.checksum ?? '-'}`
  if (encoder.encode(value).byteLength > 256) throw new MediaError('MEDIA_PROTOCOL', 'Media asset revision exceeds its grant budget')
  return value
}

function generationVector(tags: readonly string[], source: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  const result: Record<string, number> = Object.create(null) as Record<string, number>
  for (const tag of [...new Set(tags)].sort()) {
    const generation = source.get(tag) ?? 0
    if (!Number.isSafeInteger(generation) || generation < 0) throw new MediaError('MEDIA_PROTOCOL', 'Invalid media dependency generation')
    result[tag] = generation
  }
  return Object.freeze(result)
}

function generationsMatch(claims: MediaGrantClaims, current: ReadonlyMap<string, number>): boolean {
  return Object.entries(claims.generations).every(([tag, expected]) => (current.get(tag) ?? 0) === expected)
}

function sameStoredObject(expected: StoredMediaHead, actual: StoredMediaHead): boolean {
  return expected.key === actual.key
    && expected.size === actual.size
    && expected.etag === actual.etag
    && expected.lastModified.getTime() === actual.lastModified.getTime()
    && expected.checksumSha256 === actual.checksumSha256
}

function digestHex(bytes: Uint8Array): Promise<string> {
  return crypto.subtle.digest('SHA-256', ownedArrayBuffer(bytes)).then(value =>
    [...new Uint8Array(value)].map(part => part.toString(16).padStart(2, '0')).join(''))
}

async function checksumBody(body: ReadableStream<Uint8Array>, expectedSize: number): Promise<string> {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > 1024 * 1024 * 1024) {
    throw new MediaError('MEDIA_LIMIT', 'Media object is too large to verify')
  }
  const output = new Uint8Array(expectedSize)
  const reader = body.getReader()
  let offset = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      const chunk = result.value
      if (!(chunk instanceof Uint8Array) || offset + chunk.byteLength > expectedSize) {
        throw new MediaError('MEDIA_PROTOCOL', 'Media verification stream exceeded its declared size')
      }
      output.set(chunk, offset)
      offset += chunk.byteLength
    }
  }
  finally { reader.releaseLock() }
  if (offset !== expectedSize) throw new MediaError('MEDIA_PROTOCOL', 'Media verification stream ended before its declared size')
  return digestHex(output)
}

async function readExactBytes(body: ReadableStream<Uint8Array>, expectedSize: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > 1024 * 1024 * 1024) {
    throw new MediaError('MEDIA_LIMIT', 'Media object is too large to back up')
  }
  const output = new Uint8Array(expectedSize)
  const reader = body.getReader()
  let offset = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      if (!(result.value instanceof Uint8Array) || offset + result.value.byteLength > expectedSize) {
        throw new MediaError('MEDIA_PROTOCOL', 'Media backup stream exceeded its declared size')
      }
      output.set(result.value, offset)
      offset += result.value.byteLength
    }
  }
  finally { reader.releaseLock() }
  if (offset !== expectedSize) throw new MediaError('MEDIA_PROTOCOL', 'Media backup stream ended before its declared size')
  return output
}

export interface MediaServiceOptions {
  routeBase?: string
}

interface PreparedProjection {
  request: MediaProjectionRequest
  key: string | null
  allowed: boolean
  tags: readonly string[]
}

export class MediaService {
  private readonly routeBase: string

  constructor(
    private readonly catalog: MediaCatalogStore,
    private readonly stores: MediaStoreSet,
    private readonly grants: MediaGrantService,
    options: MediaServiceOptions = {},
  ) {
    const routeBase = options.routeBase ?? '/media'
    if (!/^\/[a-z0-9/_-]*[a-z0-9_-]$/u.test(routeBase)) throw new MediaError('MEDIA_CONFIG', 'Invalid media route base')
    this.routeBase = routeBase.replace(/\/$/u, '')
  }

  /** Reads one managed object with a stable ETag and verifies it against catalog metadata. */
  async readForBackup(asset: Row<'media_assets'>): Promise<MediaBackupObject | null> {
    if (asset.storage_kind !== 'local' && asset.storage_kind !== 'r2') return null
    const objectKey = normalizeManagedObjectKey(asset.object_key)
    const store = storeFor(this.stores, asset.storage_kind)
    const head = await store.head(objectKey)
    if (!head || head.size !== asset.size) throw new MediaError('MEDIA_NOT_FOUND', 'Media object is unavailable for backup')
    const stored = await store.read(objectKey, { etagMatches: head.etag })
    if (!stored || !sameStoredObject(head, stored.head) || stored.range !== null) throw new MediaError('MEDIA_PRECONDITION', 'Media object changed during backup')
    const bytes = await readExactBytes(stored.body, head.size)
    const checksumSha256 = await digestHex(bytes)
    if (asset.checksum && asset.checksum !== checksumSha256) throw new MediaError('MEDIA_PRECONDITION', 'Media object checksum does not match catalog metadata')
    return { objectKey, storageKind: asset.storage_kind, mimeType: safeMimeType(asset.mime_type), size: bytes.byteLength, checksumSha256, bytes }
  }

  /** Restores a verified managed object, translating local/R2 storage kind to the target runtime when needed. */
  async restoreFromBackup(input: MediaBackupObject): Promise<MediaBackupRestoreResult> {
    const objectKey = normalizeManagedObjectKey(input.objectKey)
    const mimeType = safeMimeType(input.mimeType)
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength !== input.size || await digestHex(input.bytes) !== input.checksumSha256) {
      throw new MediaError('MEDIA_PRECONDITION', 'Media backup payload failed checksum verification')
    }
    const storageKind = this.stores[input.storageKind]?.kind === input.storageKind
      ? input.storageKind
      : this.stores.local ? 'local' : this.stores.r2 ? 'r2' : null
    if (!storageKind) throw new MediaError('MEDIA_CONFIG', 'No writable media store is configured for restore')
    const store = storeFor(this.stores, storageKind)
    const existing = await store.head(objectKey)
    if (existing) {
      if (existing.size !== input.size) throw new MediaError('MEDIA_CONFLICT', 'A different media object already uses this key')
      let checksum = existing.checksumSha256
      if (!checksum) {
        const stored = await store.read(objectKey, { etagMatches: existing.etag })
        if (!stored || !sameStoredObject(existing, stored.head) || stored.range !== null) throw new MediaError('MEDIA_PRECONDITION', 'Existing media object changed during restore')
        checksum = await digestHex(await readExactBytes(stored.body, existing.size))
      }
      if (checksum !== input.checksumSha256) throw new MediaError('MEDIA_CONFLICT', 'A different media object already uses this key')
      return { objectKey, storageKind, created: false }
    }
    const restored = await store.put({ key: objectKey, body: input.bytes, size: input.size, contentType: mimeType, checksumSha256: input.checksumSha256 })
    if (restored.size !== input.size || restored.checksumSha256 !== input.checksumSha256) {
      await store.delete(objectKey).catch(() => false)
      throw new MediaError('MEDIA_PROTOCOL', 'Restored media object failed storage verification')
    }
    return { objectKey, storageKind, created: true }
  }

  async rollbackBackupRestore(result: MediaBackupRestoreResult): Promise<void> {
    if (!result.created) return
    await storeFor(this.stores, result.storageKind).delete(result.objectKey)
  }

  /** Checks catalog metadata against the configured Local/R2/static store without exposing storage paths. */
  async inspectStorage(asset: Row<'media_assets'>, options: { deepChecksum?: boolean } = {}): Promise<MediaStorageInspection> {
    const checkedAt = new Date().toISOString()
    if (asset.storage_kind === 'external') {
      normalizeExternalMediaUrl(asset.object_key)
      return {
        objectKey: asset.object_key,
        storageKind: asset.storage_kind,
        exists: null,
        actualSize: null,
        sizeMatches: null,
        checksumMatches: null,
        checksumVerified: false,
        mimeMatches: null,
        consistent: null,
        checkedAt,
        note: '外部 HTTPS 资源不会由服务器主动探测，以避免服务端请求伪造。',
      }
    }

    const key = normalizeManagedObjectKey(asset.object_key)
    const store = storeFor(this.stores, asset.storage_kind)
    const head = await store.head(key)
    if (!head) {
      return {
        objectKey: key,
        storageKind: asset.storage_kind,
        exists: false,
        actualSize: null,
        sizeMatches: false,
        checksumMatches: null,
        checksumVerified: false,
        mimeMatches: null,
        consistent: false,
        checkedAt,
        note: '媒体目录中没有找到对应对象。',
      }
    }

    const sizeMatches = asset.size === head.size
    let actualChecksum = head.checksumSha256
    let checksumVerified = actualChecksum !== null
    if (options.deepChecksum && asset.checksum && !actualChecksum && sizeMatches) {
      const stored = await store.read(key, { etagMatches: head.etag })
      if (!stored) throw new MediaError('MEDIA_NOT_FOUND', 'Media object disappeared during verification')
      if (!sameStoredObject(head, stored.head)) throw new MediaError('MEDIA_PRECONDITION', 'Media object changed during verification')
      actualChecksum = await checksumBody(stored.body, head.size)
      checksumVerified = true
    }
    const checksumMatches = asset.checksum ? (actualChecksum ? asset.checksum === actualChecksum : null) : null
    const catalogMime = asset.mime_type ? safeMimeType(asset.mime_type) : null
    const storedMime = head.contentType ? safeMimeType(head.contentType) : null
    const mimeMatches = catalogMime && storedMime ? catalogMime === storedMime : null
    const consistent = sizeMatches && checksumMatches !== false && mimeMatches !== false
    return {
      objectKey: key,
      storageKind: asset.storage_kind,
      exists: true,
      actualSize: head.size,
      sizeMatches,
      checksumMatches,
      checksumVerified,
      mimeMatches,
      consistent,
      checkedAt,
      note: checksumMatches === null && asset.checksum ? '存储未提供摘要；可执行深度校验。' : null,
    }
  }

  /** Projects an entire page's media, its policy and dependency vector in one catalog batch. */
  async project(requests: readonly MediaProjectionRequest[], principal: AuthenticatedPrincipal | null): Promise<MediaViewModel[]> {
    if (!Array.isArray(requests) || requests.length > MAX_PROJECTIONS) throw new MediaError('MEDIA_LIMIT', 'Too many media projections')
    if (requests.length === 0) return []
    const prepared: PreparedProjection[] = await Promise.all(requests.map(async request => {
      validateProjectionRequest(request)
      const key = request.objectKey === null
        ? null
        : request.objectKey.startsWith('https://')
          ? normalizeExternalMediaUrl(request.objectKey)
          : normalizeManagedObjectKey(request.objectKey)
      const recordTag = await cacheRecordTag(request.module, request.recordUid)
      return {
        request,
        key,
        allowed: projectionAllowed(request, principal),
        tags: request.purpose === 'publication_pdf' ? [recordTag, MEDIA_POLICY_TAG] : [recordTag],
      }
    }))
    const eligible = prepared.filter(item => item.allowed && item.key !== null)
    if (eligible.length === 0) return prepared.map(item => missing(item.request))
    const catalog = await this.catalog.projectionData(
      eligible.map(item => item.key!),
      eligible.flatMap(item => item.tags),
      { includePdfPolicy: eligible.some(item => item.request.purpose === 'publication_pdf') },
    )

    return Promise.all(prepared.map(async ({ request, key, allowed, tags }): Promise<MediaViewModel> => {
      if (!key || !allowed) return missing(request)
      const asset = catalog.assets.get(key)
      if (!asset || asset.status !== 'active' || normalizedAssetKey(asset) !== key) return missing(request)
      const mimeType = safeMimeType(asset.mime_type)
      const kind = mediaKind(mimeType)
      const expected = expectedKind(request.purpose)
      if ((expected === 'image' && kind !== 'image') || (expected === 'pdf' && kind !== 'pdf')) return missing(request)
      const scope = publicProjection(request) ? 'public' : 'private'
      if (scope === 'private' && !principal) return missing(request)
      const requestedDownload = request.allowDownload ?? true
      const allowDownload = request.purpose === 'publication_pdf'
        ? requestedDownload && catalog.publicationPdfDownloadAllowed
        : requestedDownload
      let disposition = request.disposition ?? (kind === 'file' ? 'attachment' : 'inline')
      if (!isInlineMediaType(mimeType)) disposition = 'attachment'
      if (!allowDownload && disposition === 'attachment') throw new MediaError('MEDIA_CONFIG', 'A non-inline media type cannot disable download')

      let url: string
      if (asset.storage_kind === 'external') {
        // External URLs bypass application authorization and response headers.
        // Hide them when those guarantees are required instead of pretending to
        // enforce a policy that the application cannot actually control.
        if (scope !== 'public' || !allowDownload) return missing(request)
        url = normalizeExternalMediaUrl(asset.object_key)
      }
      else {
        const token = await this.grants.issue({
          key: asset.object_key,
          scope,
          ...(scope === 'private' ? { subject: principal!.userUid } : {}),
          purpose: request.purpose,
          disposition,
          allowDownload,
          assetRevision: mediaAssetRevision(asset),
          referenceRevision: request.referenceRevision,
          generations: generationVector(tags, catalog.generations),
        })
        const parameters = new URLSearchParams({ g: token })
        url = `${this.routeBase}/${encodeObjectKeyPath(asset.object_key)}?${parameters.toString()}`
      }
      return {
        available: true,
        url,
        alt: boundedText(request.alt),
        title: boundedText(request.title === undefined ? asset.title : request.title, '') || null,
        kind,
        mimeType,
        size: asset.size,
        width: dimension(request.width),
        height: dimension(request.height),
        disposition,
        downloadAllowed: allowDownload,
        cacheScope: scope,
        purpose: request.purpose,
      }
    }))
  }

  async resolveView(request: MediaProjectionRequest, principal: AuthenticatedPrincipal | null): Promise<MediaViewModel> {
    return (await this.project([request], principal))[0]!
  }

  /** Reads an active or trashed managed object for an already-authorized admin endpoint. */
  async readForAdministration(asset: Row<'media_assets'>, rangeHeader?: string | null): Promise<MediaResponsePlan> {
    if (asset.storage_kind === 'external') throw new MediaError('MEDIA_NOT_FOUND', 'External media cannot be proxied for administration')
    const mime = safeMimeType(asset.mime_type)
    if (!isInlineMediaType(mime)) throw new MediaError('MEDIA_NOT_FOUND', 'Media type cannot be previewed inline')
    const store = storeFor(this.stores, asset.storage_kind)
    const head = await store.head(asset.object_key)
    if (!head || head.size !== asset.size) throw new MediaError('MEDIA_NOT_FOUND', 'Media object is unavailable')
    const range = parseSingleRange(rangeHeader, head.size)
    const stored = await store.read(asset.object_key, { range })
    if (!stored || stored.head.size !== asset.size) throw new MediaError('MEDIA_NOT_FOUND', 'Media object is unavailable')
    const bodyLength = range?.length ?? stored.head.size
    return {
      status: range ? 206 : 200,
      headers: {
        'cache-control': 'private, no-store, max-age=0',
        'content-type': mime,
        'content-length': String(bodyLength),
        ...(range ? { 'content-range': `bytes ${range.offset}-${range.end}/${stored.head.size}` } : {}),
        'accept-ranges': 'bytes',
        'content-disposition': contentDisposition(defaultFileName(asset), false),
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin',
      },
      body: exactMediaBody(stored.body, bodyLength),
    }
  }

  private async authorizeGrant(input: MediaRequestInput, resolvePrincipal: PrincipalResolver): Promise<MediaGrantClaims> {
    const claims = await this.grants.verify(input.grant, input.objectKey)
    if (claims.scope === 'private') this.grants.authorizeSubject(claims, (await resolvePrincipal())?.userUid ?? null)
    return claims
  }

  async deliver(input: MediaRequestInput, resolvePrincipal: PrincipalResolver): Promise<MediaResponsePlan> {
    const objectKey = normalizeManagedObjectKey(input.objectKey)
    const claims = await this.authorizeGrant({ ...input, objectKey }, resolvePrincipal)
    const catalog = await this.catalog.deliveryData(objectKey, Object.keys(claims.generations))
    const asset = catalog.asset
    if (!asset || asset.status !== 'active') throw new MediaError('MEDIA_NOT_FOUND', 'Media is unavailable')
    if (!generationsMatch(claims, catalog.generations)) throw new MediaError('MEDIA_FORBIDDEN', 'Media authorization is no longer current')
    if (asset.storage_kind === 'external') throw new MediaError('MEDIA_PROTOCOL', 'External media is not delivered by the managed route')
    if (normalizedAssetKey(asset) !== objectKey || mediaAssetRevision(asset) !== claims.assetRevision) {
      throw new MediaError('MEDIA_FORBIDDEN', 'Media grant no longer matches the asset')
    }

    const store = storeFor(this.stores, asset.storage_kind)
    const head = await store.head(asset.object_key)
    if (!head) throw new MediaError('MEDIA_NOT_FOUND', 'Media object is unavailable')
    if (asset.size !== head.size) throw new MediaError('MEDIA_PROTOCOL', 'Media catalog size does not match storage')
    if (asset.checksum && head.checksumSha256 && asset.checksum !== head.checksumSha256) throw new MediaError('MEDIA_PROTOCOL', 'Media catalog checksum does not match storage')
    const size = head.size
    // A catalog checksum is descriptive metadata, not proof that the bytes
    // currently returned by a storage provider still match it. Only promote a
    // checksum to a strong HTTP validator when the provider itself attests it;
    // otherwise retain the provider's (possibly weak) object validator.
    const etag = strongChecksumEtag(head.checksumSha256, head.etag)
    const mime = safeMimeType(asset.mime_type ?? head.contentType)
    const isPublic = claims.scope === 'public'
    const commonHeaders: Record<string, string> = {
      etag,
      'last-modified': head.lastModified.toUTCString(),
      'accept-ranges': 'bytes',
      'cache-control': mediaCacheControl(isPublic, this.grants.remainingSeconds(claims)),
      'content-type': mime,
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-site',
    }
    const precondition = evaluateMediaPreconditions(input, { etag, lastModified: head.lastModified }, input.method)
    if (precondition) return { status: precondition, headers: commonHeaders, body: null }

    const wantsDownload = Boolean(input.download)
    if (wantsDownload && !claims.allowDownload) throw new MediaError('MEDIA_FORBIDDEN', 'Media download is disabled')
    const attachment = wantsDownload || claims.disposition === 'attachment' || !isInlineMediaType(mime)
    commonHeaders['content-disposition'] = contentDisposition(defaultFileName(asset), attachment)

    let range = null
    if (!input.range || ifRangeMatches(input.ifRange, { etag, lastModified: head.lastModified })) {
      try { range = parseSingleRange(input.range, size) }
      catch (error) {
        if (error instanceof MediaError && error.code === 'MEDIA_RANGE') {
          return { status: 416, headers: { ...commonHeaders, 'content-range': `bytes */${size}`, 'content-length': '0' }, body: null }
        }
        throw error
      }
    }

    commonHeaders['content-length'] = String(range?.length ?? size)
    if (range) commonHeaders['content-range'] = `bytes ${range.offset}-${range.end}/${size}`
    if (input.method === 'HEAD') return { status: range ? 206 : 200, headers: commonHeaders, body: null }

    const stored = await store.read(asset.object_key, { range, etagMatches: head.etag })
    if (!stored) throw new MediaError('MEDIA_NOT_FOUND', 'Media object is unavailable')
    if (!sameStoredObject(head, stored.head)
      || (range && (!stored.range || stored.range.offset !== range.offset || stored.range.length !== range.length))
      || (!range && stored.range !== null)) {
      throw new MediaError('MEDIA_PROTOCOL', 'Media object changed or storage returned an unexpected representation')
    }
    return { status: range ? 206 : 200, headers: commonHeaders, body: stored.body }
  }
}
