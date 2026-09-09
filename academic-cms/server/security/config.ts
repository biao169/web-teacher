import { utf8Length } from './bytes'
import { SecurityError } from './errors'

export interface RawAuthConfig {
  authSecret?: unknown
  bootstrapToken?: unknown
  trustedOrigins?: unknown
  secureCookies?: unknown
  sessionIdleSeconds?: unknown
  sessionAbsoluteSeconds?: unknown
  sessionTouchSeconds?: unknown
  loginWindowSeconds?: unknown
  loginBlockSeconds?: unknown
  loginAccountFailures?: unknown
  loginNetworkFailures?: unknown
  trustedProxyHops?: unknown
}
export interface AuthConfig {
  authSecret: string
  bootstrapToken: string | null
  trustedOrigins: readonly string[]
  secureCookies: boolean
  sessionIdleSeconds: number
  sessionAbsoluteSeconds: number
  sessionTouchSeconds: number
  loginWindowSeconds: number
  loginBlockSeconds: number
  loginAccountFailures: number
  loginNetworkFailures: number
  trustedProxyHops: number
}
function integer(value: unknown, fallback: number, minimum: number, maximum: number, name: string): number {
  const parsed = value === undefined || value === null || value === '' ? fallback : typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new SecurityError('AUTH_CONFIG', `Invalid ${name}`)
  return parsed
}
function boolean(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 'true' || value === '1') return true
  if (value === false || value === 'false' || value === '0') return false
  throw new SecurityError('AUTH_CONFIG', `Invalid ${name}`)
}
export function normalizeOrigin(value: string, production = false): string {
  let url: URL
  try { url = new URL(value) } catch (error) { throw new SecurityError('AUTH_CONFIG', 'Trusted origin is invalid', { cause: error }) }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new SecurityError('AUTH_CONFIG', 'Trusted origin must contain only scheme and authority')
  if (production && url.protocol !== 'https:') throw new SecurityError('AUTH_CONFIG', 'Production trusted origins must use HTTPS')
  return url.origin
}
function origins(value: unknown, production: boolean): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [...new Set(list.map(item => String(item).trim()).filter(Boolean).map(item => normalizeOrigin(item, production)))]
}
function strongSecret(value: unknown, name: string, optional = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (optional) return null
    throw new SecurityError('AUTH_CONFIG', `${name} is required`)
  }
  const secret = String(value)
  if (utf8Length(secret) < 32 || utf8Length(secret) > 4096 || /^(?:change|replace|example|secret|password|development)/i.test(secret)) throw new SecurityError('AUTH_CONFIG', `${name} must be a non-placeholder secret of at least 32 bytes`)
  return secret
}
export function parseAuthConfig(raw: RawAuthConfig, production = false): AuthConfig {
  // Validate root secrets first so a broken deployment cannot be masked by a secondary setting.
  const authSecret = strongSecret(raw.authSecret, 'NUXT_AUTH_SECRET')!
  const bootstrapToken = strongSecret(raw.bootstrapToken, 'NUXT_AUTH_BOOTSTRAP_TOKEN', true)
  const sessionIdleSeconds = integer(raw.sessionIdleSeconds, 1800, 300, 86_400, 'session idle timeout')
  const sessionAbsoluteSeconds = integer(raw.sessionAbsoluteSeconds, 28_800, sessionIdleSeconds, 604_800, 'session absolute timeout')
  const sessionTouchSeconds = integer(raw.sessionTouchSeconds, 300, 30, Math.min(sessionIdleSeconds - 1, 3600), 'session touch interval')
  const trustedOrigins = Object.freeze(origins(raw.trustedOrigins, production))
  if (production && trustedOrigins.length === 0) throw new SecurityError('AUTH_CONFIG', 'At least one trusted origin is required in production')
  const secureCookies = boolean(raw.secureCookies, production, 'secure cookie setting')
  if (production && !secureCookies) throw new SecurityError('AUTH_CONFIG', 'Secure cookies cannot be disabled in production')
  return Object.freeze({
    authSecret,
    bootstrapToken,
    trustedOrigins,
    secureCookies,
    sessionIdleSeconds,
    sessionAbsoluteSeconds,
    sessionTouchSeconds,
    loginWindowSeconds: integer(raw.loginWindowSeconds, 900, 60, 86_400, 'login window'),
    loginBlockSeconds: integer(raw.loginBlockSeconds, 900, 60, 86_400, 'login block duration'),
    loginAccountFailures: integer(raw.loginAccountFailures, 5, 2, 100, 'account failure limit'),
    loginNetworkFailures: integer(raw.loginNetworkFailures, 30, 5, 1000, 'network failure limit'),
    trustedProxyHops: integer(raw.trustedProxyHops, 0, 0, 10, 'trusted proxy hops'),
  })
}
