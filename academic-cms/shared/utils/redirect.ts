import { hasUnpairedSurrogate } from './unicode'

const FORBIDDEN_PREFIXES = ['/api', '/_nuxt', '/media']
const MAX_DECODE_ROUNDS = 8

function slashCount(value: string): number {
  let count = 0
  for (const char of value) if (char === '/') count += 1
  return count
}

/**
 * Decodes a path repeatedly while rejecting any encoding layer that can
 * introduce routing structure. This prevents double-encoded slash, backslash
 * and dot-segment variants from being interpreted differently by proxies,
 * routers and the browser.
 */
function fullyDecodeUnambiguousPath(rawPath: string): string | null {
  let current = rawPath
  for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
    if (hasUnpairedSurrogate(current) || /[\\\u0000-\u001f\u007f]/u.test(current)) return null
    const segments = current.split('/')
    if (segments.some(segment => segment === '.' || segment === '..')) return null

    let decoded: string
    try { decoded = decodeURIComponent(current) }
    catch { return null }
    if (decoded === current) return current
    if (slashCount(decoded) !== slashCount(current)) return null
    current = decoded
  }
  return null
}

function hasForbiddenPrefix(pathname: string): boolean {
  return FORBIDDEN_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** Accepts only an unambiguous same-origin application path. */
export function safeApplicationRedirect(value: unknown, fallback: string): string {
  if (typeof fallback !== 'string' || !fallback.startsWith('/') || fallback.startsWith('//')
    || fullyDecodeUnambiguousPath(fallback.split(/[?#]/u, 1)[0]!) === null) {
    throw new TypeError('Fallback redirect is invalid')
  }
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) return fallback
  const candidate = value.normalize('NFC').trim()
  if (!candidate || candidate.length > 2_048 || !candidate.startsWith('/') || candidate.startsWith('//')
    || /[\\\u0000-\u001f\u007f]/u.test(candidate)) return fallback

  const rawPath = candidate.split(/[?#]/u, 1)[0]!
  const decodedRawPath = fullyDecodeUnambiguousPath(rawPath)
  if (decodedRawPath === null || hasForbiddenPrefix(decodedRawPath)) return fallback

  let url: URL
  try { url = new URL(candidate, 'https://redirect.invalid') }
  catch { return fallback }
  if (url.origin !== 'https://redirect.invalid' || url.username || url.password) return fallback

  const decodedPath = fullyDecodeUnambiguousPath(url.pathname)
  if (decodedPath === null || hasForbiddenPrefix(decodedPath)) return fallback
  return `${url.pathname}${url.search}${url.hash}`
}
