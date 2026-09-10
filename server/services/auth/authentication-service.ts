import { normalizeLoginUsername } from '../../security/account-input'
import { SecurityError } from '../../security/errors'
import { PasswordService } from '../../security/password'
import type { AuthStore } from './auth-store'
import type { CreatedSession, SessionService } from './session-service'
import type { LoginThrottleService } from './throttle-service'

export interface LoginInput {
  username: string
  password: string
  network: string | null
  userAgent?: string | null
  rotateSessionToken?: string | null
  requestId: string
}

const INVALID_LOGIN_IDENTITY = '~invalid-auth-identity~'

export class AuthenticationService {
  constructor(
    private readonly store: AuthStore,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService,
  ) {}

  async login(input: LoginInput): Promise<CreatedSession> {
    let username: string
    try {
      username = normalizeLoginUsername(input.username)
    }
    catch {
      username = INVALID_LOGIN_IDENTITY
    }

    const keys = await this.throttle.keys(username, input.network)
    const window = this.throttle.window()
    const preflight = await this.store.loginPreflight(username, [keys.account, ...(keys.network ? [keys.network] : [])], window.at)
    const preflightRetry = this.throttle.retryAfter(preflight.throttleStates, window.now)
    if (preflightRetry > 0) {
      // Once a submitted identity/network bucket is blocked, avoid an expensive
      // PBKDF2 operation. Unknown and known accounts still take the same dummy
      // or real KDF path while the bucket is not blocked.
      throw new SecurityError('AUTH_THROTTLED', 'Login throttle is active', { retryAfterSeconds: preflightRetry })
    }

    const verification = await this.passwords.verify(input.password, preflight.credential?.passwordHash ?? '')
    const credential = preflight.credential
    if (!credential || !verification.valid || credential.userStatus !== 'active' || !credential.roleActive) {
      const states = await this.throttle.recordFailure(keys, window)
      const retry = this.throttle.retryAfter(states, window.now)
      if (retry > 0) throw new SecurityError('AUTH_THROTTLED', 'Login throttle activated', { retryAfterSeconds: retry })
      throw new SecurityError('AUTH_INVALID_CREDENTIALS', 'Invalid username or password')
    }

    const replacementPasswordHash = verification.needsRehash
      ? await this.passwords.hash(input.password.normalize('NFC'))
      : null

    return this.sessions.createForCredential(credential, {
      accountThrottleHash: keys.account,
      requestId: input.requestId,
      replacementPasswordHash,
      ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
      ...(input.rotateSessionToken !== undefined ? { rotateSessionToken: input.rotateSessionToken } : {}),
    })
  }
}
