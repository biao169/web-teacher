import { base64UrlEncode, randomBytes } from './bytes'
import { SecurityError } from './errors'

export interface SecurityHeaderOptions {
  nonce: string
  production: boolean
}

export function createCspNonce(cryptoProvider: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): string {
  return base64UrlEncode(randomBytes(18, cryptoProvider))
}

export function buildContentSecurityPolicy(nonce: string, production: boolean): string {
  if (!/^[A-Za-z0-9_-]{24}$/.test(nonce)) throw new SecurityError('AUTH_CONFIG', 'Invalid CSP nonce')
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'self'`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self' blob:",
  ]
  if (production) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

export function buildSecurityHeaders(options: SecurityHeaderOptions): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {
    'content-security-policy': buildContentSecurityPolicy(options.nonce, options.production),
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'x-dns-prefetch-control': 'off',
  }
  if (options.production) headers['strict-transport-security'] = 'max-age=63072000; includeSubDomains'
  return Object.freeze(headers)
}

export function buildApiSecurityHeaders(production: boolean): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {
    'cache-control': 'private, no-store, max-age=0',
    'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'x-dns-prefetch-control': 'off',
  }
  if (production) headers['strict-transport-security'] = 'max-age=63072000; includeSubDomains'
  return Object.freeze(headers)
}
