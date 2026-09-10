import type { AuthTokenService } from './tokens'
import { SecurityError } from './errors'
import { canonicalizeOrigin, requestOrigin } from './origin'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const JSON_TYPES = new Set(['application/json', 'application/merge-patch+json'])

export interface UnsafeRequestProtectionInput {
  method: string
  contentType?: string | null
  origin?: string | null
  secFetchSite?: string | null
  requestUrl: string
  trustedOrigins: readonly string[]
  cookieAuthenticated: boolean
  sessionToken?: string | null
  csrfHeader?: string | null
  csrfCookie?: string | null
  requireJson?: boolean
  tokens?: AuthTokenService
}

function normalizedMethod(value: string): string {
  if (typeof value !== 'string' || value.length > 16 || !/^[A-Za-z]+$/u.test(value)) {
    throw new SecurityError('AUTH_INPUT', 'Invalid HTTP method')
  }
  return value.toUpperCase()
}

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(normalizedMethod(method))
}

function mediaType(value: string | null | undefined): string | null {
  if (!value) return null
  return value.split(';', 1)[0]!.trim().toLowerCase()
}

/** Protects state-changing, browser-facing endpoints before their body is consumed. */
export async function protectUnsafeRequest(input: UnsafeRequestProtectionInput): Promise<void> {
  const method = normalizedMethod(input.method)
  if (SAFE_METHODS.has(method)) return

  const fetchSite = input.secFetchSite?.trim().toLowerCase() ?? null
  if (fetchSite && fetchSite !== 'same-origin') {
    throw new SecurityError('AUTH_ORIGIN', 'Fetch metadata is not same-origin')
  }

  if (input.requireJson ?? true) {
    const type = mediaType(input.contentType)
    if (!type || !JSON_TYPES.has(type)) {
      throw new SecurityError('AUTH_UNSUPPORTED_MEDIA_TYPE', 'State-changing API requests require JSON')
    }
  }

  const origin = input.origin
  if (!origin || origin === 'null') throw new SecurityError('AUTH_ORIGIN', 'Origin header is required')
  const supplied = canonicalizeOrigin(origin)
  const own = requestOrigin(input.requestUrl)
  if (input.trustedOrigins.length > 0) {
    const allowed = new Set(input.trustedOrigins.map(value => canonicalizeOrigin(value)))
    if (!allowed.has(supplied)) throw new SecurityError('AUTH_ORIGIN', 'Request origin is not trusted')
  }
  else if (supplied !== own) {
    throw new SecurityError('AUTH_ORIGIN', 'Request origin is not trusted')
  }

  if (!input.cookieAuthenticated) return
  if (!input.tokens || !await input.tokens.verifyCsrf(input.sessionToken ?? '', input.csrfCookie, input.csrfHeader)) {
    throw new SecurityError('AUTH_CSRF', 'CSRF validation failed')
  }
}
