import { hasUnpairedSurrogate } from '../../shared/utils/unicode'
import { MediaError } from './errors'
import type { ByteRange } from './store'

const DOWNLOAD_MIME_TYPES = new Set([
  'application/json',
  'application/octet-stream',
  'application/pdf',
  'application/rtf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'text/csv',
  'text/markdown',
  'text/plain',
])

const INLINE_MIME_TYPES = new Set([
  'application/pdf',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
])

export interface ResolvedRange extends ByteRange { end: number }

/** Unsafe active formats such as HTML, JavaScript, XML and SVG are downgraded. */
export function safeMimeType(input: string | null | undefined): string {
  if (!input) return 'application/octet-stream'
  const type = input.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return DOWNLOAD_MIME_TYPES.has(type) ? type : 'application/octet-stream'
}

export function isInlineMediaType(input: string): boolean {
  return INLINE_MIME_TYPES.has(safeMimeType(input))
}

export function mediaKind(input: string | null | undefined): 'image' | 'video' | 'pdf' | 'file' {
  const mime = safeMimeType(input)
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  return 'file'
}

export function parseSingleRange(header: string | null | undefined, size: number): ResolvedRange | null {
  if (!header) return null
  if (!Number.isSafeInteger(size) || size < 0) throw new MediaError('MEDIA_PROTOCOL', 'Invalid media size')
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) throw new MediaError('MEDIA_RANGE', 'Only one byte range is supported')
  if (size === 0) throw new MediaError('MEDIA_RANGE', 'Empty objects do not satisfy byte ranges')

  let offset: number
  let end: number
  if (match[1] === '') {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new MediaError('MEDIA_RANGE', 'Invalid suffix range')
    const length = Math.min(suffix, size)
    offset = size - length
    end = size - 1
  }
  else {
    offset = Number(match[1])
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size) throw new MediaError('MEDIA_RANGE', 'Range starts beyond the object')
    if (match[2] === '') end = size - 1
    else {
      end = Number(match[2])
      if (!Number.isSafeInteger(end) || end < offset) throw new MediaError('MEDIA_RANGE', 'Invalid byte range end')
      end = Math.min(end, size - 1)
    }
  }
  return { offset, end, length: end - offset + 1 }
}

function stripWeak(etag: string): string { return etag.trim().replace(/^W\//u, '') }
function etagList(header: string): string[] { return header.split(',').map(item => item.trim()).filter(Boolean) }

export function normalizeHttpEtag(etag: string): string {
  const value = etag.trim()
  if (/^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/u.test(value)) return value
  const safe = value.replace(/["\\\u0000-\u001f\u007f]/gu, '')
  if (!safe) throw new MediaError('MEDIA_PROTOCOL', 'Invalid media ETag')
  return `"${safe}"`
}

export interface MediaPreconditions {
  ifMatch?: string | null
  ifNoneMatch?: string | null
  ifModifiedSince?: string | null
  ifUnmodifiedSince?: string | null
}

export function evaluateMediaPreconditions(
  request: MediaPreconditions,
  metadata: { etag: string; lastModified: Date },
  method: 'GET' | 'HEAD' = 'GET',
): 304 | 412 | null {
  const etag = normalizeHttpEtag(metadata.etag)
  const strong = stripWeak(etag)
  const ifMatch = request.ifMatch?.trim()
  if (ifMatch) {
    const matches = ifMatch === '*' || etagList(ifMatch).some(candidate => !candidate.startsWith('W/') && stripWeak(candidate) === strong)
    if (!matches) return 412
  }
  else if (request.ifUnmodifiedSince) {
    const at = Date.parse(request.ifUnmodifiedSince)
    if (Number.isFinite(at) && metadata.lastModified.getTime() > at + 999) return 412
  }

  const ifNoneMatch = request.ifNoneMatch?.trim()
  if (ifNoneMatch) {
    const matches = ifNoneMatch === '*' || etagList(ifNoneMatch).some(candidate => stripWeak(candidate) === strong)
    if (matches) return method === 'GET' || method === 'HEAD' ? 304 : 412
  }
  else if (request.ifModifiedSince) {
    const at = Date.parse(request.ifModifiedSince)
    if (Number.isFinite(at) && metadata.lastModified.getTime() <= at + 999) return 304
  }
  return null
}

export function ifRangeMatches(value: string | null | undefined, metadata: { etag: string; lastModified: Date }): boolean {
  if (!value) return true
  const candidate = value.trim()
  if (candidate.startsWith('W/')) return false
  if (candidate.startsWith('"')) return candidate === normalizeHttpEtag(metadata.etag) && !normalizeHttpEtag(metadata.etag).startsWith('W/')
  const at = Date.parse(candidate)
  return Number.isFinite(at) && metadata.lastModified.getTime() <= at + 999
}

export function safeDownloadName(input: string | null | undefined, fallback = 'download'): string {
  const candidate = typeof input === 'string' ? input.normalize('NFC') : ''
  if (!candidate || hasUnpairedSurrogate(candidate)) return fallback
  const cleaned = candidate
    .replace(/[\/\\\u0000-\u001f\u007f]/gu, '_')
    .replace(/[";]/gu, '_')
    .trim()
  const truncated = [...cleaned].slice(0, 180).join('')
  return truncated && truncated !== '.' && truncated !== '..' ? truncated : fallback
}
export function contentDisposition(fileName: string | null | undefined, download: boolean): string {
  const safe = safeDownloadName(fileName)
  const ascii = safe.replace(/[^\x20-\x7e]/gu, '_') || 'download'
  const encoded = encodeURIComponent(safe).replace(/[!'()*]/gu, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

export function strongChecksumEtag(checksum: string | null | undefined, fallback: string): string {
  return checksum && /^[0-9a-f]{64}$/u.test(checksum) ? `"sha256-${checksum}"` : normalizeHttpEtag(fallback)
}

/** Managed public URLs are short-lived capabilities, so cache lifetime never exceeds the grant. */
export function mediaCacheControl(isPublic: boolean, remainingGrantSeconds = 300): string {
  if (!isPublic) return 'private, no-store, max-age=0'
  if (!Number.isSafeInteger(remainingGrantSeconds) || remainingGrantSeconds < 1 || remainingGrantSeconds > 7_200) {
    throw new MediaError('MEDIA_PROTOCOL', 'Invalid remaining media grant lifetime')
  }
  const maxAge = Math.min(300, remainingGrantSeconds)
  const stale = Math.min(60, Math.max(0, remainingGrantSeconds - maxAge))
  return `public, max-age=${maxAge}, s-maxage=${maxAge}${stale ? `, stale-while-revalidate=${stale}` : ''}`
}
