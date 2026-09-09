import type { H3Event } from 'h3'
import { getCookie } from 'h3'
import { useRuntimeConfig } from '#imports'
import { AuthStore } from '../services/auth/auth-store'
import { AuthenticationService } from '../services/auth/authentication-service'
import { BootstrapService } from '../services/auth/bootstrap-service'
import { SessionService, type ActiveSession } from '../services/auth/session-service'
import { LoginThrottleService } from '../services/auth/throttle-service'
import { parseAuthConfig, type AuthConfig } from '../security/config'
import { cookiePolicy } from '../security/cookies'
import { PasswordService } from '../security/password'
import { SecurityError } from '../security/errors'
import { AuthTokenService } from '../security/tokens'
import { useDatabase } from './database'

export interface AuthRuntime {
  config: AuthConfig
  cookies: ReturnType<typeof cookiePolicy>
  store: AuthStore
  tokens: AuthTokenService
  passwords: PasswordService
  sessions: SessionService
  authentication: AuthenticationService
  bootstrap: BootstrapService
}

let cachedAuthSecret: string | undefined
let cachedTokenService: AuthTokenService | undefined
let passwordService: PasswordService | undefined

function tokenService(secret: string): AuthTokenService {
  if (cachedTokenService) {
    if (cachedAuthSecret !== secret) throw new SecurityError('AUTH_CONFIG', 'Authentication secret cannot change within one process')
    return cachedTokenService
  }
  cachedAuthSecret = secret
  cachedTokenService = new AuthTokenService(secret)
  return cachedTokenService
}

function rawConfig(event: H3Event): Record<string, unknown> {
  return useRuntimeConfig(event) as unknown as Record<string, unknown>
}

export function useAuthRuntime(event: H3Event): AuthRuntime {
  if (event.context.authRuntime) return event.context.authRuntime
  const raw = rawConfig(event)
  const config = parseAuthConfig({
    authSecret: raw.authSecret,
    bootstrapToken: raw.authBootstrapToken,
    trustedOrigins: raw.authTrustedOrigins,
    secureCookies: raw.authSecureCookies,
    sessionIdleSeconds: raw.authSessionIdleSeconds,
    sessionAbsoluteSeconds: raw.authSessionAbsoluteSeconds,
    sessionTouchSeconds: raw.authSessionTouchSeconds,
    loginWindowSeconds: raw.authLoginWindowSeconds,
    loginBlockSeconds: raw.authLoginBlockSeconds,
    loginAccountFailures: raw.authLoginAccountFailures,
    loginNetworkFailures: raw.authLoginNetworkFailures,
    trustedProxyHops: raw.authTrustedProxyHops,
  }, process.env.NODE_ENV === 'production')
  const store = new AuthStore(useDatabase(event).adapter)
  const tokens = tokenService(config.authSecret)
  passwordService ??= new PasswordService()
  const sessions = new SessionService(store, tokens, {
    sessionPolicy: {
      idleSeconds: config.sessionIdleSeconds,
      absoluteSeconds: config.sessionAbsoluteSeconds,
      touchSeconds: config.sessionTouchSeconds,
    },
  })
  const throttle = new LoginThrottleService(store, tokens, {
    windowSeconds: config.loginWindowSeconds,
    blockSeconds: config.loginBlockSeconds,
    accountFailures: config.loginAccountFailures,
    networkFailures: config.loginNetworkFailures,
  })
  const runtime: AuthRuntime = {
    config,
    cookies: cookiePolicy(config.secureCookies, config.sessionAbsoluteSeconds),
    store,
    tokens,
    passwords: passwordService,
    sessions,
    authentication: new AuthenticationService(store, passwordService, sessions, throttle),
    bootstrap: new BootstrapService(store, passwordService, tokens),
  }
  event.context.authRuntime = runtime
  return runtime
}

export function resolveOptionalSession(event: H3Event): Promise<ActiveSession | null> {
  event.context.authSessionPromise ??= (() => {
    const runtime = useAuthRuntime(event)
    return runtime.sessions.resolve(getCookie(event, runtime.cookies.sessionName))
  })()
  return event.context.authSessionPromise
}
