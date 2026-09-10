import type { SessionView } from '../../../shared/contracts/auth'
import { SecurityError } from '../../security/errors'
import { canonicalNow, createSecurityUid } from '../../security/identity'
import type { AuthenticatedPrincipal } from '../../security/permissions'
import { toSafeUserView } from '../../security/permissions'
import {
  DEFAULT_SESSION_POLICY,
  nextSessionTouch,
  newSessionTimes,
  sessionInvalidReason,
  type SessionPolicy,
} from '../../security/session-policy'
import { AuthTokenService, type SessionMaterial } from '../../security/tokens'
import {
  AuthStore,
  principalFromCredential,
  type CredentialRecord,
  type SessionRevokeReason,
} from './auth-store'

export interface SecurityRuntimeOptions {
  clock?: () => Date
  crypto?: Crypto
  sessionPolicy?: SessionPolicy
  idFactory?: (prefix: 'user' | 'session' | 'audit') => string
}

export interface ActiveSession {
  principal: AuthenticatedPrincipal
  sessionHash: string
  sessionToken: string
  csrfToken: string
  expiresAt: string
  idleExpiresAt: string
}

export interface CreatedSession extends SessionMaterial {
  principal: AuthenticatedPrincipal
  expiresAt: string
  idleExpiresAt: string
}

export interface CreateSessionInput {
  accountThrottleHash: string
  userAgent?: string | null
  replacementPasswordHash?: string | null
  rotateSessionToken?: string | null
  requestId: string
}

export class SessionService {
  private readonly clock: () => Date
  private readonly crypto: Crypto
  private readonly policy: SessionPolicy
  private readonly idFactory: (prefix: 'user' | 'session' | 'audit') => string

  constructor(
    private readonly store: AuthStore,
    private readonly tokens: AuthTokenService,
    options: SecurityRuntimeOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.crypto = options.crypto ?? globalThis.crypto
    this.policy = options.sessionPolicy ?? DEFAULT_SESSION_POLICY
    this.idFactory = options.idFactory ?? (prefix => createSecurityUid(prefix, this.crypto))
  }

  private now(): Date {
    const value = this.clock()
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new SecurityError('AUTH_CONFIG', 'Security clock returned an invalid date')
    return new Date(value.getTime())
  }

  async createForCredential(credential: CredentialRecord, input: CreateSessionInput): Promise<CreatedSession> {
    const now = this.now()
    const at = canonicalNow(now)
    const times = newSessionTimes(now, this.policy)
    const material = await this.tokens.createSessionMaterial()
    const sessionUid = this.idFactory('session')
    let rotateSessionHash: string | null = null
    if (input.rotateSessionToken && this.tokens.isSessionToken(input.rotateSessionToken)) {
      rotateSessionHash = await this.tokens.sessionHash(input.rotateSessionToken)
    }
    const userAgentHash = await this.tokens.userAgentHash(input.userAgent)
    await this.store.persistSession({
      sessionUid,
      sessionHash: material.sessionHash,
      userUid: credential.userUid,
      at,
      idleExpiresAt: times.idleExpiresAt,
      expiresAt: times.expiresAt,
      userAgentHash,
      accountThrottleHash: input.accountThrottleHash,
      replacementPasswordHash: input.replacementPasswordHash ?? null,
      rotateSessionHash,
      audit: {
        uid: this.idFactory('audit'),
        at,
        actor: { uid: credential.userUid, name: credential.displayName ?? credential.username },
        action: 'login',
        module: 'auth',
        targetUid: credential.userUid,
        summary: 'User session created',
        detail: {
          session_uid: sessionUid,
          request_id: input.requestId || 'unavailable',
          password_rehashed: Boolean(input.replacementPasswordHash),
          rotated_previous_session: Boolean(rotateSessionHash),
          user_agent_recorded: Boolean(userAgentHash),
        },
        status: 'success',
      },
    })
    return {
      ...material,
      principal: principalFromCredential(credential, sessionUid),
      expiresAt: times.expiresAt,
      idleExpiresAt: times.idleExpiresAt,
    }
  }

  async resolve(rawSessionToken: string | null | undefined): Promise<ActiveSession | null> {
    if (!rawSessionToken) return null
    const token = this.tokens.assertSessionToken(rawSessionToken)
    const tokenHash = await this.tokens.sessionHash(token)
    const stored = await this.store.resolveSessionByHash(tokenHash)
    if (!stored) throw new SecurityError('AUTH_SESSION_INVALID', 'Session is invalid')

    const now = this.now()
    const invalid = sessionInvalidReason({
      now,
      revokedAt: stored.revokedAt,
      idleExpiresAt: stored.idleExpiresAt,
      expiresAt: stored.expiresAt,
      userStatus: stored.userStatus,
      roleActive: stored.roleActive,
    })
    if (invalid) {
      const reason: SessionRevokeReason = invalid === 'user_inactive'
        ? 'user_disabled'
        : invalid === 'role_inactive'
          ? 'role_disabled'
          : invalid === 'idle_timeout' || invalid === 'absolute_timeout'
            ? 'expired'
            : 'security_policy'
      if (stored.revokedAt === null) await this.store.revokeSessionByHash(tokenHash, canonicalNow(now), reason)
      const code = invalid === 'idle_timeout' || invalid === 'absolute_timeout' ? 'AUTH_SESSION_EXPIRED' : 'AUTH_SESSION_INVALID'
      throw new SecurityError(code, 'Session is no longer active')
    }

    const touch = nextSessionTouch(now, stored.lastSeenAt, stored.expiresAt, this.policy)
    if (touch.due && !await this.store.touchSession(tokenHash, touch.lastSeenAt, touch.idleExpiresAt)) {
      throw new SecurityError('AUTH_SESSION_INVALID', 'Session changed while being refreshed')
    }
    return {
      principal: stored.principal,
      sessionHash: tokenHash,
      sessionToken: token,
      csrfToken: await this.tokens.csrfToken(token),
      expiresAt: stored.expiresAt,
      idleExpiresAt: touch.due ? touch.idleExpiresAt : stored.idleExpiresAt,
    }
  }

  async logout(active: ActiveSession | null, requestId: string): Promise<void> {
    if (!active) return
    const at = canonicalNow(this.now())
    await this.store.revokeSessionByHash(active.sessionHash, at, 'logout', {
      uid: this.idFactory('audit'),
      at,
      actor: { uid: active.principal.userUid, name: active.principal.displayName ?? active.principal.username },
      action: 'logout',
      module: 'auth',
      targetUid: active.principal.userUid,
      summary: 'User session revoked',
      detail: { session_uid: active.principal.sessionUid, request_id: requestId || 'unavailable' },
      status: 'success',
    })
  }

  toView(active: ActiveSession | null): SessionView {
    if (!active) return { authenticated: false }
    return {
      authenticated: true,
      user: toSafeUserView(active.principal),
      expiresAt: active.expiresAt,
      idleExpiresAt: active.idleExpiresAt,
      csrfToken: active.csrfToken,
    }
  }
}
