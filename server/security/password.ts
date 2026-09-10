import { base64UrlDecode, base64UrlEncode, constantTimeEqual, hasUnpairedSurrogate, ownedArrayBuffer, randomBytes, utf8, utf8Length } from './bytes'
import { SecurityError } from './errors'

export const PASSWORD_ALGORITHM = 'pbkdf2-sha256'
export const PASSWORD_ITERATIONS = 600_000
export const PASSWORD_SALT_BYTES = 32
export const PASSWORD_HASH_BYTES = 32
export const PASSWORD_INPUT_MAX_BYTES = 1024
export const DUMMY_PASSWORD_HASH = 'pbkdf2-sha256$600000$WlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlo$X3RJJL05zB3qEwbLh8r3UWf3kjpidw-AoeQQcdNQ-3w'

export interface ParsedPasswordHash {
  algorithm: typeof PASSWORD_ALGORITHM
  iterations: number
  salt: Uint8Array
  hash: Uint8Array
}

export interface PasswordVerification {
  valid: boolean
  needsRehash: boolean
}

export interface Pbkdf2Engine {
  derive(password: Uint8Array, salt: Uint8Array, iterations: number, bytes: number): Promise<Uint8Array>
}

export class WebCryptoPbkdf2Engine implements Pbkdf2Engine {
  constructor(private readonly subtle: SubtleCrypto = globalThis.crypto.subtle) {}

  async derive(password: Uint8Array, salt: Uint8Array, iterations: number, bytes: number): Promise<Uint8Array> {
    const key = await this.subtle.importKey('raw', ownedArrayBuffer(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await this.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: ownedArrayBuffer(salt), iterations }, key, bytes * 8)
    return new Uint8Array(bits)
  }
}

export function normalizePasswordForHash(password: string): string {
  return password.normalize('NFC')
}

export function parsePasswordHash(encoded: string): ParsedPasswordHash | null {
  if (typeof encoded !== 'string' || encoded.length > 512) return null
  const parts = encoded.split('$')
  if (parts.length !== 4 || parts[0] !== PASSWORD_ALGORITHM || !/^\d{1,8}$/u.test(parts[1]!)) return null
  const iterations = Number(parts[1])
  if (!Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 2_000_000) return null
  try {
    const salt = base64UrlDecode(parts[2]!)
    const hash = base64UrlDecode(parts[3]!)
    if (salt.length < 16 || salt.length > 64 || hash.length !== PASSWORD_HASH_BYTES) return null
    return { algorithm: PASSWORD_ALGORITHM, iterations, salt, hash }
  }
  catch {
    return null
  }
}

function requiredDummyHash(): ParsedPasswordHash {
  const parsed = parsePasswordHash(DUMMY_PASSWORD_HASH)
  if (!parsed) throw new Error('DUMMY_PASSWORD_HASH is invalid')
  return parsed
}
const parsedDummy: ParsedPasswordHash = requiredDummyHash()

export class PasswordService {
  constructor(
    private readonly engine: Pbkdf2Engine = new WebCryptoPbkdf2Engine(),
    private readonly cryptoProvider: Pick<Crypto, 'getRandomValues'> = globalThis.crypto,
  ) {}

  async hash(normalizedPassword: string): Promise<string> {
    if (typeof normalizedPassword !== 'string') throw new SecurityError('AUTH_INPUT', 'Password cannot be hashed')
    const normalized = normalizePasswordForHash(normalizedPassword)
    const byteLength = utf8Length(normalized)
    if (byteLength === 0 || byteLength > PASSWORD_INPUT_MAX_BYTES) throw new SecurityError('AUTH_INPUT', 'Password cannot be hashed')
    const salt = randomBytes(PASSWORD_SALT_BYTES, this.cryptoProvider)
    const hash = await this.engine.derive(utf8(normalized), salt, PASSWORD_ITERATIONS, PASSWORD_HASH_BYTES)
    if (hash.length !== PASSWORD_HASH_BYTES) throw new SecurityError('AUTH_PROTOCOL', 'PBKDF2 returned an invalid length')
    return `${PASSWORD_ALGORITHM}$${PASSWORD_ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(hash)}`
  }

  /** Unknown hashes and oversized candidates still perform one bounded derivation. */
  async verify(password: unknown, encoded: string): Promise<PasswordVerification> {
    const candidateValid = typeof password === 'string' && !hasUnpairedSurrogate(password) && utf8Length(password) <= PASSWORD_INPUT_MAX_BYTES
    const stored = parsePasswordHash(encoded)
    const target = stored ?? parsedDummy
    const candidate = candidateValid ? normalizePasswordForHash(password) : ''
    const actual = await this.engine.derive(utf8(candidate), target.salt, target.iterations, target.hash.length)
    return Object.freeze({
      valid: candidateValid && stored !== null && constantTimeEqual(actual, target.hash),
      needsRehash: stored !== null && (stored.iterations !== PASSWORD_ITERATIONS || stored.salt.length !== PASSWORD_SALT_BYTES || stored.hash.length !== PASSWORD_HASH_BYTES),
    })
  }
}
