import { SecurityError } from './errors'

export interface SessionPolicy {
  idleSeconds: number
  absoluteSeconds: number
  touchSeconds: number
}

export const DEFAULT_SESSION_POLICY: Readonly<SessionPolicy> = Object.freeze({
  idleSeconds: 30 * 60,
  absoluteSeconds: 8 * 60 * 60,
  touchSeconds: 5 * 60,
})

export interface SessionTimes {
  createdAt: string
  lastSeenAt: string
  idleExpiresAt: string
  expiresAt: string
}

function canonical(time: number): string {
  const value = new Date(time)
  if (!Number.isFinite(value.getTime())) throw new SecurityError('AUTH_CONFIG', 'Invalid session clock')
  return value.toISOString()
}

export function validateSessionPolicy(policy: SessionPolicy): void {
  if (!Number.isSafeInteger(policy.idleSeconds) || policy.idleSeconds < 300 || policy.idleSeconds > 86_400) throw new SecurityError('AUTH_CONFIG', 'Invalid session idle timeout')
  if (!Number.isSafeInteger(policy.absoluteSeconds) || policy.absoluteSeconds < policy.idleSeconds || policy.absoluteSeconds > 604_800) throw new SecurityError('AUTH_CONFIG', 'Invalid session absolute timeout')
  if (!Number.isSafeInteger(policy.touchSeconds) || policy.touchSeconds < 30 || policy.touchSeconds >= policy.idleSeconds) throw new SecurityError('AUTH_CONFIG', 'Invalid session touch interval')
}

export function newSessionTimes(now: Date, policy: SessionPolicy = DEFAULT_SESSION_POLICY): SessionTimes {
  validateSessionPolicy(policy)
  const start = now.getTime()
  if (!Number.isFinite(start)) throw new SecurityError('AUTH_CONFIG', 'Invalid session clock')
  const absolute = start + policy.absoluteSeconds * 1000
  return {
    createdAt: canonical(start),
    lastSeenAt: canonical(start),
    idleExpiresAt: canonical(Math.min(start + policy.idleSeconds * 1000, absolute)),
    expiresAt: canonical(absolute),
  }
}

export type SessionInvalidReason = 'revoked' | 'idle_timeout' | 'absolute_timeout' | 'user_inactive' | 'role_inactive'
export interface SessionValidityInput {
  now: Date
  revokedAt: string | null
  idleExpiresAt: string
  expiresAt: string
  userStatus: 'active' | 'disabled' | 'locked'
  roleActive: boolean
}

export function sessionInvalidReason(input: SessionValidityInput): SessionInvalidReason | null {
  const now = input.now.getTime()
  const idle = Date.parse(input.idleExpiresAt)
  const absolute = Date.parse(input.expiresAt)
  if (![now, idle, absolute].every(Number.isFinite)) throw new SecurityError('AUTH_PROTOCOL', 'Stored session time is invalid')
  if (input.revokedAt !== null) return 'revoked'
  if (input.userStatus !== 'active') return 'user_inactive'
  if (!input.roleActive) return 'role_inactive'
  if (now >= absolute) return 'absolute_timeout'
  if (now >= idle) return 'idle_timeout'
  return null
}

export interface SessionTouch { due: boolean; lastSeenAt: string; idleExpiresAt: string }
export function nextSessionTouch(now: Date, lastSeenAt: string, expiresAt: string, policy: SessionPolicy = DEFAULT_SESSION_POLICY): SessionTouch {
  validateSessionPolicy(policy)
  const current = now.getTime(), previous = Date.parse(lastSeenAt), absolute = Date.parse(expiresAt)
  if (![current, previous, absolute].every(Number.isFinite) || previous > current || current >= absolute) throw new SecurityError('AUTH_PROTOCOL', 'Stored session timeline is invalid')
  return {
    due: current - previous >= policy.touchSeconds * 1000,
    lastSeenAt: canonical(current),
    idleExpiresAt: canonical(Math.min(current + policy.idleSeconds * 1000, absolute)),
  }
}
