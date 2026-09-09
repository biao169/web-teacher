import { normalizeDisplayName, normalizeEmail, validateNewUsername } from '../../security/account-input'
import { SecurityError } from '../../security/errors'
import { canonicalNow, createSecurityUid } from '../../security/identity'
import type { PasswordBlocklist } from '../../security/password-policy'
import { validateNewPassword } from '../../security/password-policy'
import type { PasswordService } from '../../security/password'
import { PublicInteractionError } from '../../interactions/errors'
import type { InteractionSettingsStore } from '../interactions/settings-store'
import type { PublicActionThrottleService } from '../interactions/action-throttle-service'
import type { AuthStore } from './auth-store'

export interface PublicRegistrationInput {
  username: string
  password: string
  displayName?: string | null
  email?: string | null
  network: string | null
  requestId: string
  siteName?: string | null
}

export interface PublicRegistrationResult {
  registered: true
  username: string
}

export interface RegistrationServiceOptions {
  clock?: () => Date
  crypto?: Crypto
  idFactory?: (prefix: 'user' | 'session' | 'audit') => string
  passwordBlocklist?: PasswordBlocklist
}

export class RegistrationService {
  private readonly clock: () => Date
  private readonly crypto: Crypto
  private readonly idFactory: (prefix: 'user' | 'session' | 'audit') => string

  constructor(
    private readonly store: AuthStore,
    private readonly settings: InteractionSettingsStore,
    private readonly throttle: PublicActionThrottleService,
    private readonly passwords: PasswordService,
    private readonly options: RegistrationServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.crypto = options.crypto ?? globalThis.crypto
    this.idFactory = options.idFactory ?? (prefix => createSecurityUid(prefix, this.crypto))
  }

  async available(): Promise<boolean> {
    return (await this.settings.current()).allowPublicRegistration
  }

  async register(input: PublicRegistrationInput): Promise<PublicRegistrationResult> {
    const current = await this.settings.current()
    if (!current.allowPublicRegistration) {
      throw new SecurityError('AUTH_FORBIDDEN', 'Public registration is disabled', { publicMessage: '当前未开放公开注册。' })
    }
    const username = validateNewUsername(input.username)
    const displayName = normalizeDisplayName(input.displayName) ?? username
    const email = normalizeEmail(input.email)
    try {
      await this.throttle.consume({ action: 'registration', identity: username, network: input.network })
    }
    catch (error) {
      if (error instanceof PublicInteractionError && error.code === 'INTERACTION_THROTTLED') {
        throw new SecurityError('AUTH_THROTTLED', 'Public registration throttle is active', {
          ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }),
          publicMessage: '注册尝试过多，请稍后再试。',
          cause: error,
        })
      }
      throw error
    }
    const validated = await validateNewPassword(input.password, {
      username,
      ...(input.siteName === undefined ? {} : { siteName: input.siteName }),
      additionalBlockedTerms: [displayName, email ?? ''],
    }, this.options.passwordBlocklist)
    const passwordHash = await this.passwords.hash(validated.normalized)
    const now = this.clock()
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new SecurityError('AUTH_CONFIG', 'Registration clock is invalid')
    const at = canonicalNow(now)
    const userUid = this.idFactory('user')
    await this.store.registerPublicUser({
      userUid,
      username,
      passwordHash,
      displayName,
      email,
      at,
      audit: {
        uid: this.idFactory('audit'),
        at,
        actor: { uid: userUid, name: displayName },
        action: 'register',
        module: 'auth',
        targetUid: userUid,
        summary: 'Public user registered',
        detail: {
          username,
          email_supplied: Boolean(email),
          request_id: input.requestId || 'unavailable',
          registration_setting_revision: current.updatedAt,
        },
        status: 'success',
      },
    })
    return Object.freeze({ registered: true, username })
  }
}
