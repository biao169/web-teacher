import { hasUnpairedSurrogate } from '../../shared/utils/unicode'
import { MediaError } from './errors'

export const MEDIA_KEY_LIMITS = Object.freeze({
  bytes: 768,
  segments: 24,
  segmentBytes: 128,
})

const encoder = new TextEncoder()
const SAFE_SEGMENT = /^[\p{L}\p{N}][\p{L}\p{N}._@+~-]*$/u
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu

function bytes(value: string): number { return encoder.encode(value).byteLength }

/** Canonical portable key for local files and R2 objects. */
export function normalizeManagedObjectKey(input: string): string {
  if (typeof input !== 'string' || input.length === 0 || hasUnpairedSurrogate(input)) {
    throw new MediaError('MEDIA_INPUT', 'Invalid media object key')
  }
  if (input !== input.normalize('NFC')) throw new MediaError('MEDIA_INPUT', 'Media object key must use NFC normalization')
  if (input.startsWith('/') || input.endsWith('/') || input.includes('\\') || /[?#\u0000-\u001f\u007f]/u.test(input)) {
    throw new MediaError('MEDIA_INPUT', 'Unsafe media object key')
  }
  if (/%(?:2f|5c|00)/iu.test(input)) throw new MediaError('MEDIA_INPUT', 'Encoded path separators are not allowed')
  if (bytes(input) > MEDIA_KEY_LIMITS.bytes) throw new MediaError('MEDIA_LIMIT', 'Media object key is too long')
  const segments = input.split('/')
  if (segments.length > MEDIA_KEY_LIMITS.segments) throw new MediaError('MEDIA_LIMIT', 'Media object key has too many segments')
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..' || segment.trim() !== segment || segment.endsWith('.')) throw new MediaError('MEDIA_INPUT', 'Unsafe media key segment')
    if (!SAFE_SEGMENT.test(segment) || WINDOWS_DEVICE.test(segment)) throw new MediaError('MEDIA_INPUT', 'Unsupported media key segment')
    if (bytes(segment) > MEDIA_KEY_LIMITS.segmentBytes) throw new MediaError('MEDIA_LIMIT', 'Media key segment is too long')
  }
  return segments.join('/')
}

export function encodeObjectKeyPath(key: string): string {
  return normalizeManagedObjectKey(key).split('/').map(encodeURIComponent).join('/')
}

export function decodeObjectKeyPath(path: string): string {
  if (typeof path !== 'string' || !path) throw new MediaError('MEDIA_INPUT', 'Media path is required')
  let decoded: string
  try { decoded = path.split('/').map(segment => decodeURIComponent(segment)).join('/') }
  catch (error) { throw new MediaError('MEDIA_INPUT', 'Media path encoding is invalid', { cause: error }) }
  // Canonical encoding closes double-encoding and ambiguous route forms.
  const normalized = normalizeManagedObjectKey(decoded)
  if (encodeObjectKeyPath(normalized) !== path) throw new MediaError('MEDIA_INPUT', 'Media path is not canonical')
  return normalized
}

export function normalizeExternalMediaUrl(input: string): string {
  if (typeof input !== 'string' || !input || hasUnpairedSurrogate(input) || input !== input.trim()) {
    throw new MediaError('MEDIA_INPUT', 'Invalid external media URL')
  }
  let url: URL
  try { url = new URL(input) }
  catch (error) { throw new MediaError('MEDIA_INPUT', 'Invalid external media URL', { cause: error }) }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || url.hash) {
    throw new MediaError('MEDIA_INPUT', 'External media must use an uncredentialed HTTPS URL')
  }
  if (url.port && url.port !== '443') throw new MediaError('MEDIA_INPUT', 'External media URL uses a disallowed port')
  url.hostname = url.hostname.toLowerCase()
  return url.toString()
}
