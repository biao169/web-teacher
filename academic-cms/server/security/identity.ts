import { base64UrlEncode, randomBytes } from './bytes'
import { SecurityError } from './errors'

export type SecurityIdPrefix = 'user' | 'session' | 'audit'

export function createSecurityUid(prefix: SecurityIdPrefix, cryptoProvider: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): string {
  if (!['user', 'session', 'audit'].includes(prefix)) throw new SecurityError('AUTH_CONFIG', 'Invalid security identifier prefix')
  return `${prefix}:${base64UrlEncode(randomBytes(18, cryptoProvider))}`
}

export function canonicalNow(now: Date): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new SecurityError('AUTH_CONFIG', 'Invalid security clock')
  return now.toISOString()
}
