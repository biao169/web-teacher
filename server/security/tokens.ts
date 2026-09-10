import { base64UrlEncode, constantTimeEqual, constantTimeStringEqual, hexEncode, ownedArrayBuffer, randomBytes, utf8, utf8Length } from './bytes'
import { SecurityError } from './errors'

export const SESSION_TOKEN_BYTES = 32
export const SESSION_TOKEN_LENGTH = 43
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u

export interface SessionMaterial {
  sessionToken: string
  sessionHash: string
  csrfToken: string
}

export class AuthTokenService {
  private keyPromise?: Promise<CryptoKey>

  constructor(
    private readonly secret: string,
    private readonly subtle: SubtleCrypto = globalThis.crypto.subtle,
    private readonly cryptoProvider: Pick<Crypto, 'getRandomValues'> = globalThis.crypto,
  ) {
    if (utf8Length(secret) < 32 || utf8Length(secret) > 4096) throw new SecurityError('AUTH_CONFIG', 'Authentication secret has an invalid length')
  }

  private key(): Promise<CryptoKey> {
    this.keyPromise ??= this.subtle.importKey('raw', ownedArrayBuffer(utf8(this.secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return this.keyPromise
  }

  private async mac(domain: string, value: string): Promise<Uint8Array> {
    const signature = await this.subtle.sign('HMAC', await this.key(), ownedArrayBuffer(utf8(`${domain}\0${value}`)))
    return new Uint8Array(signature)
  }

  newSessionToken(): string {
    return base64UrlEncode(randomBytes(SESSION_TOKEN_BYTES, this.cryptoProvider))
  }

  isSessionToken(value: unknown): value is string {
    return typeof value === 'string' && TOKEN_PATTERN.test(value)
  }

  assertSessionToken(value: unknown): string {
    if (!this.isSessionToken(value)) throw new SecurityError('AUTH_SESSION_INVALID', 'Malformed session token')
    return value
  }

  async sessionHash(token: string): Promise<string> {
    if (!this.isSessionToken(token)) throw new SecurityError('AUTH_SESSION_INVALID', 'Malformed session token')
    return hexEncode(await this.mac('session:v1', token))
  }

  async csrfToken(sessionToken: string): Promise<string> {
    if (!this.isSessionToken(sessionToken)) throw new SecurityError('AUTH_SESSION_INVALID', 'Malformed session token')
    return base64UrlEncode(await this.mac('csrf:v1', sessionToken))
  }

  async createSessionMaterial(): Promise<SessionMaterial> {
    const sessionToken = this.newSessionToken()
    const [sessionHash, csrfToken] = await Promise.all([this.sessionHash(sessionToken), this.csrfToken(sessionToken)])
    return { sessionToken, sessionHash, csrfToken }
  }

  async verifyCsrf(sessionToken: unknown, cookieToken: unknown, headerToken: unknown): Promise<boolean> {
    if (!this.isSessionToken(sessionToken) || typeof cookieToken !== 'string' || typeof headerToken !== 'string') return false
    if (!TOKEN_PATTERN.test(cookieToken) || !TOKEN_PATTERN.test(headerToken) || !constantTimeStringEqual(cookieToken, headerToken)) return false
    return constantTimeStringEqual(await this.csrfToken(sessionToken), headerToken)
  }

  async throttleKey(scope: 'account' | 'network', value: string): Promise<string> {
    if (!value || utf8Length(value) > 512) throw new SecurityError('AUTH_INPUT', 'Invalid throttle key input')
    return hexEncode(await this.mac(`throttle:${scope}:v1`, value))
  }

  async actionThrottleKey(
    action: 'registration' | 'contact',
    scope: 'identity' | 'network',
    value: string,
  ): Promise<string> {
    if (!['registration', 'contact'].includes(action) || !['identity', 'network'].includes(scope)
      || !value || utf8Length(value) > 512) {
      throw new SecurityError('AUTH_INPUT', 'Invalid public action throttle key input')
    }
    return hexEncode(await this.mac(`public-action:${action}:${scope}:v1`, value))
  }

  async userAgentHash(value: string | null | undefined): Promise<string | null> {
    if (!value) return null
    const bounded = value.normalize('NFC').trim().slice(0, 512)
    return bounded ? hexEncode(await this.mac('user-agent:v1', bounded)) : null
  }

  async sessionCorrelation(token: string): Promise<string> {
    if (!this.isSessionToken(token)) throw new SecurityError('AUTH_SESSION_INVALID', 'Malformed session token')
    return hexEncode((await this.mac('audit-session:v1', token)).slice(0, 16))
  }

  async verifyBootstrapToken(provided: unknown, expected: string | null): Promise<boolean> {
    if (typeof provided !== 'string' || !expected || utf8Length(provided) > 4096) return false
    const [left, right] = await Promise.all([this.mac('bootstrap:v1', provided), this.mac('bootstrap:v1', expected)])
    return constantTimeEqual(left, right)
  }
}
