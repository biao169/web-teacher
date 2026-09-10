import { SecurityError } from '../../security/errors'
import { canonicalNow, createSecurityUid } from '../../security/identity'
import type { PasswordBlocklist } from '../../security/password-policy'
import { validateNewPassword } from '../../security/password-policy'
import type { PasswordService } from '../../security/password'
import type { ActiveSession, SessionService } from './session-service'
import type { AuthStore } from './auth-store'

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
  requestId: string
}

export interface AccountServiceOptions {
  clock?: () => Date
  crypto?: Crypto
  idFactory?: (prefix: 'user' | 'session' | 'audit') => string
  passwordBlocklist?: PasswordBlocklist
}

export class AccountService {
  private readonly clock: () => Date
  private readonly crypto: Crypto
  private readonly idFactory: (prefix: 'user' | 'session' | 'audit') => string

  constructor(
    private readonly store: AuthStore,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly options: AccountServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.crypto = options.crypto ?? globalThis.crypto
    this.idFactory = options.idFactory ?? (prefix => createSecurityUid(prefix, this.crypto))
  }

  private now(): Date {
    const value = this.clock()
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new SecurityError('AUTH_CONFIG', 'Account clock is invalid')
    return value
  }

  async changePassword(active: ActiveSession, input: ChangePasswordRequest): Promise<ActiveSession> {
    const credential = await this.store.findCredentialByUsername(active.principal.username)
    if (!credential || credential.userUid !== active.principal.userUid || credential.userStatus !== 'active' || !credential.roleActive) {
      throw new SecurityError('AUTH_SESSION_INVALID', 'Account is no longer available')
    }
    const current = await this.passwords.verify(input.currentPassword, credential.passwordHash)
    if (!current.valid) throw new SecurityError('AUTH_INVALID_CREDENTIALS', 'Current password is invalid', { publicMessage: '当前密码错误。' })
    const validated = await validateNewPassword(input.newPassword, {
      username: credential.username,
      additionalBlockedTerms: [credential.displayName ?? '', credential.email ?? ''],
    }, this.options.passwordBlocklist)
    if (input.currentPassword.normalize('NFC') === validated.normalized) {
      throw new SecurityError('AUTH_PASSWORD_POLICY', 'New password matches the current password', { publicMessage: '新密码不能与当前密码相同。' })
    }
    const replacementPasswordHash = await this.passwords.hash(validated.normalized)
    const at = canonicalNow(this.now())
    await this.store.changePassword({
      userUid: credential.userUid,
      currentSessionHash: active.sessionHash,
      expectedPasswordHash: credential.passwordHash,
      replacementPasswordHash,
      at,
      audit: {
        uid: this.idFactory('audit'),
        at,
        actor: { uid: credential.userUid, name: credential.displayName ?? credential.username },
        action: 'password_change',
        module: 'auth',
        targetUid: credential.userUid,
        summary: 'Account password changed and other sessions revoked',
        detail: { request_id: input.requestId || 'unavailable' },
        status: 'success',
      },
    })
    const refreshed = await this.sessions.resolve(active.sessionToken)
    if (!refreshed) throw new SecurityError('AUTH_SESSION_INVALID', 'Session disappeared after password change')
    return refreshed
  }

  async revokeAllSessions(active: ActiveSession, requestId: string): Promise<number> {
    const at = canonicalNow(this.now())
    return this.store.revokeAllForUserWithAudit(active.principal.userUid, at, 'admin_revoked', {
      uid: this.idFactory('audit'),
      at,
      actor: { uid: active.principal.userUid, name: active.principal.displayName ?? active.principal.username },
      action: 'sessions_revoke_all',
      module: 'auth',
      targetUid: active.principal.userUid,
      summary: 'All user sessions revoked',
      detail: { request_id: requestId || 'unavailable' },
      status: 'success',
    })
  }
}
