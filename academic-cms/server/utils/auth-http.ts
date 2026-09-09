import { useRuntimeConfig } from '#imports'
import type { H3Event } from 'h3'
import {
  deleteCookie,
  getCookie,
  getHeader,
  getRequestURL,
  setCookie,
  setHeader,
  setResponseStatus,
} from 'h3'
import { ZodError } from 'zod'
import type { CreatedSession } from '../services/auth/session-service'
import { CSRF_HEADER, remainingCookieLifetimeSeconds } from '../security/cookies'
import { SecurityError, securityError } from '../security/errors'
import { selectClientNetwork } from '../security/origin'
import { protectUnsafeRequest } from '../security/request-protection'
import type { AuthRuntime } from './auth-runtime'

export type JsonWriteProtectionMode = 'anonymous' | 'session'

export function bearerToken(event: H3Event): string | null {
  const authorization = getHeader(event, 'authorization')
  if (!authorization || authorization.length > 4096) return null
  const match = /^Bearer ([^\s\u0000-\u001f\u007f]+)$/u.exec(authorization)
  return match?.[1] ?? null
}

/** Run before consuming an unsafe JSON body or resolving a database session. */
export async function protectJsonWrite(
  event: H3Event,
  runtime: AuthRuntime,
  mode: JsonWriteProtectionMode = 'anonymous',
): Promise<void> {
  const cookieAuthenticated = mode === 'session'
  const sessionToken = cookieAuthenticated ? (getCookie(event, runtime.cookies.sessionName) ?? null) : null
  await protectUnsafeRequest({
    method: event.method,
    contentType: getHeader(event, 'content-type') ?? null,
    origin: getHeader(event, 'origin') ?? null,
    secFetchSite: getHeader(event, 'sec-fetch-site') ?? null,
    // In configured deployments the canonical origin, not a client-controlled
    // Host header, is authoritative. Development falls back to the request URL.
    requestUrl: runtime.config.trustedOrigins[0] ?? getRequestURL(event).toString(),
    trustedOrigins: runtime.config.trustedOrigins,
    cookieAuthenticated,
    sessionToken,
    csrfHeader: cookieAuthenticated ? (getHeader(event, CSRF_HEADER) ?? null) : null,
    csrfCookie: cookieAuthenticated ? (getCookie(event, runtime.cookies.csrfName) ?? null) : null,
    tokens: runtime.tokens,
  })
}

export function setSessionCookies(event: H3Event, runtime: AuthRuntime, session: CreatedSession): void {
  setCookie(event, runtime.cookies.sessionName, session.sessionToken, runtime.cookies.session)
  setCookie(event, runtime.cookies.csrfName, session.csrfToken, runtime.cookies.csrf)
}

/** Restore a missing CSRF cookie without extending it beyond session expiry. */
export function refreshCsrfCookie(
  event: H3Event,
  runtime: AuthRuntime,
  csrfToken: string,
  expiresAt: string,
): void {
  if (getCookie(event, runtime.cookies.csrfName) === csrfToken) return
  const remaining = remainingCookieLifetimeSeconds(expiresAt, runtime.cookies.csrf.maxAge)
  if (remaining <= 0) return
  setCookie(event, runtime.cookies.csrfName, csrfToken, {
    ...runtime.cookies.csrf,
    maxAge: remaining,
  })
}

export function clearSessionCookies(event: H3Event, runtime: AuthRuntime): void {
  deleteCookie(event, runtime.cookies.sessionName, {
    path: '/',
    secure: runtime.cookies.session.secure,
    sameSite: runtime.cookies.session.sameSite,
  })
  deleteCookie(event, runtime.cookies.csrfName, {
    path: '/',
    secure: runtime.cookies.csrf.secure,
    sameSite: runtime.cookies.csrf.sameSite,
  })
}

export function requestNetwork(event: H3Event, runtime: AuthRuntime): string | null {
  const raw = event.node?.req?.socket?.remoteAddress ?? null
  const configuredRuntime = (useRuntimeConfig(event).runtimeKind ?? 'unknown') as 'node' | 'cloudflare' | 'unknown'
  return selectClientNetwork({
    runtimeKind: configuredRuntime,
    cloudflareConnectingIp: getHeader(event, 'cf-connecting-ip') ?? null,
    forwardedFor: getHeader(event, 'x-forwarded-for') ?? null,
    remoteAddress: raw,
    trustedProxyHops: runtime.config.trustedProxyHops,
  })
}

export function applyPrivateNoStore(event: H3Event): void {
  setHeader(event, 'cache-control', 'private, no-store, max-age=0')
  setHeader(event, 'pragma', 'no-cache')
  setHeader(event, 'x-content-type-options', 'nosniff')
}

export function authFailure(event: H3Event, error: unknown): { error: { code: string; message: string; requestId: string } } {
  const expected = error instanceof SecurityError || error instanceof ZodError
  const safe = error instanceof ZodError
    ? new SecurityError('AUTH_INPUT', 'Request schema validation failed', { cause: error })
    : securityError(error)
  const requestId = event.context.requestId || 'unavailable'
  setResponseStatus(event, safe.statusCode)
  applyPrivateNoStore(event)
  if (safe.retryAfterSeconds !== undefined) setHeader(event, 'retry-after', safe.retryAfterSeconds)
  if (!expected) {
    // Never log submitted credentials, cookies, raw headers, stack traces or
    // database messages from this boundary.
    console.error('Authentication request failed unexpectedly', {
      requestId,
      errorType: error instanceof Error ? error.name : typeof error,
      code: safe.code,
    })
  }
  return { error: { code: safe.code, message: safe.publicMessage, requestId } }
}
