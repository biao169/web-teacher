import { hasUnpairedSurrogate, utf8Length } from './bytes'
import { SecurityError } from './errors'

const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,63}$/u
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export function normalizeLoginUsername(value: unknown): string {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) throw new SecurityError('AUTH_INPUT', 'Username must be valid text')
  const normalized = value.normalize('NFC').trim().toLowerCase()
  if (!normalized || [...normalized].length > 150 || utf8Length(normalized) > 512) throw new SecurityError('AUTH_INPUT', 'Username is invalid')
  return normalized
}

export function validateNewUsername(value: unknown): string {
  const normalized = normalizeLoginUsername(value)
  if (!USERNAME_PATTERN.test(normalized)) throw new SecurityError('AUTH_INPUT', 'Username must use 3–64 lowercase ASCII letters, numbers, dot, underscore or hyphen')
  return normalized
}

export function normalizeDisplayName(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) throw new SecurityError('AUTH_INPUT', 'Display name must be valid text')
  const normalized = value.normalize('NFC').trim()
  if (!normalized || [...normalized].length > 128 || utf8Length(normalized) > 512) throw new SecurityError('AUTH_INPUT', 'Display name is invalid')
  return normalized
}

export function normalizeEmail(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) throw new SecurityError('AUTH_INPUT', 'Email must be valid text')
  const normalized = value.normalize('NFC').trim().toLowerCase()
  if (!normalized) return null
  if ([...normalized].length > 320 || utf8Length(normalized) > 512 || !EMAIL_PATTERN.test(normalized)) throw new SecurityError('AUTH_INPUT', 'Email is invalid')
  return normalized
}
