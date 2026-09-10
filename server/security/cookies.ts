import { SecurityError } from './errors'

export const CSRF_HEADER = 'x-csrf-token'

export interface CookieOptions {
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict'
  path: '/'
  maxAge: number
}

export interface CookiePolicy {
  sessionName: string
  csrfName: string
  session: CookieOptions & { httpOnly: true; sameSite: 'lax' }
  csrf: CookieOptions & { httpOnly: false; sameSite: 'strict' }
}

export function cookiePolicy(secure: boolean, absoluteSeconds: number): CookiePolicy {
  if (!Number.isSafeInteger(absoluteSeconds) || absoluteSeconds < 300 || absoluteSeconds > 604_800) {
    throw new SecurityError('AUTH_CONFIG', 'Invalid cookie lifetime')
  }
  return Object.freeze({
    sessionName: secure ? '__Host-academic-cms-session' : 'academic-cms-session',
    csrfName: secure ? '__Host-academic-cms-csrf' : 'academic-cms-csrf',
    session: Object.freeze({ httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: absoluteSeconds }),
    csrf: Object.freeze({ httpOnly: false, secure, sameSite: 'strict', path: '/', maxAge: absoluteSeconds }),
  })
}

/**
 * Returns the remaining cookie lifetime without allowing a refreshed cookie to
 * outlive the server-side session absolute expiry.
 */
export function remainingCookieLifetimeSeconds(
  expiresAt: string,
  maximumSeconds: number,
  nowMilliseconds = Date.now(),
): number {
  if (!Number.isSafeInteger(maximumSeconds) || maximumSeconds < 1 || maximumSeconds > 604_800) {
    throw new SecurityError('AUTH_CONFIG', 'Invalid maximum cookie lifetime')
  }
  if (!Number.isFinite(nowMilliseconds)) throw new SecurityError('AUTH_CONFIG', 'Invalid cookie clock')
  const expiryMilliseconds = Date.parse(expiresAt)
  if (!Number.isFinite(expiryMilliseconds)) throw new SecurityError('AUTH_PROTOCOL', 'Session expiry is invalid')
  const remaining = Math.ceil((expiryMilliseconds - nowMilliseconds) / 1000)
  if (remaining <= 0) return 0
  return Math.min(maximumSeconds, remaining)
}

