import { hasUnpairedSurrogate, utf8Length } from './bytes'
import { SecurityError } from './errors'

export const PASSWORD_MIN_CODE_POINTS = 6
export const PASSWORD_MAX_CODE_POINTS = 256
export const PASSWORD_MAX_BYTES = 1024

export interface PasswordContext {
  username?: string | null
  siteName?: string | null
  additionalBlockedTerms?: readonly string[]
}

export interface PasswordBlocklist {
  has(password: string, context: PasswordContext): Promise<boolean>
}

const COMMON_PASSWORDS = new Set([
  '123456789012345',
  '1234567890123456',
  '12345678901234567890',
  'passwordpassword',
  'password123456',
  'qwertyuiopasdfgh',
  'qwertyqwertyqwerty',
  'letmeinletmeinletmein',
  'administratoradministrator',
  'adminadminadminadmin',
  'correcthorsebatterystaple',
  'iloveyouiloveyou',
  'welcome123456789',
  'changemechangeme',
  'academiccmsacademiccms',
])

function comparisonForm(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim()
}

export class LocalPasswordBlocklist implements PasswordBlocklist {
  async has(password: string, context: PasswordContext): Promise<boolean> {
    const candidate = comparisonForm(password)
    if (COMMON_PASSWORDS.has(candidate)) return true
    const terms = [context.username, context.siteName, ...(context.additionalBlockedTerms ?? [])]
      .filter((item): item is string => typeof item === 'string' && item.trim().length >= 3)
      .map(comparisonForm)
    for (const term of terms) {
      if (candidate === term || candidate === `${term}${term}` || candidate === `${term}123456` || candidate === `123456${term}`) return true
    }
    return false
  }
}

export interface ValidatedPassword {
  normalized: string
  codePoints: number
  bytes: number
}

export async function validateNewPassword(
  password: unknown,
  _context: PasswordContext = {},
  _blocklist?: PasswordBlocklist,
): Promise<ValidatedPassword> {
  if (typeof password !== 'string' || hasUnpairedSurrogate(password)) {
    throw new SecurityError('AUTH_PASSWORD_POLICY', 'Password is not valid Unicode', { publicMessage: '密码包含无效字符。' })
  }
  const normalized = password.normalize('NFC')
  const codePoints = [...normalized].length
  const bytes = utf8Length(normalized)
  if (codePoints < PASSWORD_MIN_CODE_POINTS) {
    throw new SecurityError('AUTH_PASSWORD_POLICY', 'Password is too short', { publicMessage: `密码至少需要 ${PASSWORD_MIN_CODE_POINTS} 个字符。` })
  }
  if (codePoints > PASSWORD_MAX_CODE_POINTS || bytes > PASSWORD_MAX_BYTES) {
    throw new SecurityError('AUTH_PASSWORD_POLICY', 'Password is too long', { publicMessage: `密码最多允许 ${PASSWORD_MAX_CODE_POINTS} 个字符。` })
  }
  // Site policy requires only the length floor; retain the call signature for existing services.
  return Object.freeze({ normalized, codePoints, bytes })
}
