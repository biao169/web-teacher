import type { AuthModule } from '../../../shared/enums/auth'
import { AUTH_MODULES } from '../../../shared/enums/auth'
import { normalizeDisplayName, normalizeEmail, validateNewUsername } from '../../security/account-input'
import { SecurityError } from '../../security/errors'
import { canonicalNow, createSecurityUid } from '../../security/identity'
import { PasswordService } from '../../security/password'
import { validateNewPassword, type PasswordBlocklist } from '../../security/password-policy'
import { AuthTokenService } from '../../security/tokens'
import type { AuthStore } from './auth-store'

export interface BootstrapAdminRequest {
  username: string
  password: string
  displayName?: string | null
  email?: string | null
  presentedToken: string | null | undefined
  expectedToken: string | null
  requestId: string
}

export interface BootstrapResult {
  userUid: string
  username: string
  displayName: string | null
  email: string | null
  permissionModules: readonly AuthModule[]
}

export interface BootstrapServiceOptions {
  clock?: () => Date
  crypto?: Crypto
  idFactory?: (prefix: 'user' | 'session' | 'audit') => string
  passwordBlocklist?: PasswordBlocklist
}

export class BootstrapService {
  private readonly clock: () => Date
  private readonly crypto: Crypto
  private readonly idFactory: (prefix: 'user' | 'session' | 'audit') => string

  constructor(
    private readonly store: AuthStore,
    private readonly passwords: PasswordService,
    private readonly tokens: AuthTokenService,
    private readonly options: BootstrapServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.crypto = options.crypto ?? globalThis.crypto
    this.idFactory = options.idFactory ?? (prefix => createSecurityUid(prefix, this.crypto))
  }

  async createInitialAdministrator(input: BootstrapAdminRequest): Promise<BootstrapResult> {
    if (!await this.tokens.verifyBootstrapToken(input.presentedToken, input.expectedToken)) {
      throw new SecurityError('AUTH_BOOTSTRAP_UNAVAILABLE', 'Bootstrap token is absent or invalid')
    }
    if (!await this.store.bootstrapAvailable()) throw new SecurityError('AUTH_BOOTSTRAP_UNAVAILABLE', 'Bootstrap has already completed')

    const username = validateNewUsername(input.username)
    const displayName = normalizeDisplayName(input.displayName) ?? username
    const email = normalizeEmail(input.email)
    const validated = await validateNewPassword(input.password, { username }, this.options.passwordBlocklist)
    const passwordHash = await this.passwords.hash(validated.normalized)
    const now = this.clock()
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new SecurityError('AUTH_CONFIG', 'Security clock returned an invalid date')
    const at = canonicalNow(now)
    const userUid = this.idFactory('user')

    await this.store.bootstrapAdmin({
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
        action: 'bootstrap',
        module: 'auth',
        targetUid: userUid,
        summary: 'Initial administrator created',
        detail: {
          username,
          role: 'system_administrator',
          permission_modules: AUTH_MODULES,
          request_id: input.requestId || 'unavailable',
        },
        status: 'success',
      },
    })

    return { userUid, username, displayName, email, permissionModules: AUTH_MODULES }
  }
}
