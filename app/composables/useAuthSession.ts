import type { LoginRequestBody, SessionView } from '~~/shared/contracts/auth'
import type {
  PasswordChangeRequestBody,
  PasswordChangeResultView,
  RegistrationReceiptView,
  RegistrationRequestBody,
  RevokeAllSessionsResultView,
} from '~~/shared/contracts/interactions'

const ANONYMOUS: SessionView = Object.freeze({ authenticated: false })

export function useAuthSession() {
  const session = useState<SessionView>('auth:session:v1', () => ANONYMOUS)
  const loaded = useState<boolean>('auth:loaded:v1', () => false)
  const pending = useState<boolean>('auth:pending:v1', () => false)
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  const requestEvent = import.meta.server ? useRequestEvent() : undefined

  async function load(force = false): Promise<SessionView> {
    if (loaded.value && !force) return session.value
    pending.value = true
    try {
      const response = await $fetch.raw<SessionView>('/api/v1/auth/session', headers === undefined ? {} : { headers })
      // An internal SSR fetch does not forward Set-Cookie on its own. Keep
      // refreshed CSRF and expired-session deletion cookies on the outer response.
      if (import.meta.server && requestEvent) {
        const { appendResponseHeader } = await import('h3')
        for (const cookie of response.headers.getSetCookie()) {
          appendResponseHeader(requestEvent, 'set-cookie', cookie)
        }
      }
      if (!response._data) throw new Error('Session endpoint returned no state')
      session.value = response._data
      loaded.value = true
      return session.value
    }
    finally { pending.value = false }
  }

  function clear(): void {
    session.value = ANONYMOUS
    loaded.value = true
    pending.value = false
  }

  function csrfHeaders(): Record<string, string> {
    if (!session.value.authenticated) return {}
    return { 'x-csrf-token': session.value.csrfToken }
  }

  async function login(body: LoginRequestBody): Promise<SessionView> {
    pending.value = true
    try {
      session.value = await $fetch<SessionView>('/api/v1/auth/login', { method: 'POST', body })
      loaded.value = true
      return session.value
    }
    finally { pending.value = false }
  }

  async function register(body: RegistrationRequestBody): Promise<RegistrationReceiptView> {
    pending.value = true
    try { return await $fetch<RegistrationReceiptView>('/api/v1/auth/register', { method: 'POST', body }) }
    finally { pending.value = false }
  }

  async function refresh(): Promise<SessionView> {
    if (!session.value.authenticated) return session.value
    try {
      session.value = await $fetch<SessionView>('/api/v1/auth/session/refresh', {
        method: 'POST', body: {}, headers: csrfHeaders(),
      })
      loaded.value = true
      return session.value
    }
    catch (error) {
      const status = typeof error === 'object' && error && 'statusCode' in error ? Number((error as { statusCode?: unknown }).statusCode) : 0
      if (status === 401) clear()
      throw error
    }
  }

  async function logout(): Promise<void> {
    if (!session.value.authenticated) { clear(); return }
    pending.value = true
    try {
      await $fetch('/api/v1/auth/logout', { method: 'POST', body: {}, headers: csrfHeaders() })
      clear()
    }
    finally { pending.value = false }
  }

  async function revokeAll(): Promise<RevokeAllSessionsResultView> {
    if (!session.value.authenticated) return { authenticated: false, revokedSessions: 0 }
    pending.value = true
    try {
      const result = await $fetch<RevokeAllSessionsResultView>('/api/v1/auth/sessions/revoke-all', {
        method: 'POST', body: {}, headers: csrfHeaders(),
      })
      clear()
      return result
    }
    finally { pending.value = false }
  }

  async function changePassword(body: PasswordChangeRequestBody): Promise<PasswordChangeResultView> {
    if (!session.value.authenticated) throw new Error('Authentication is required')
    pending.value = true
    try {
      const result = await $fetch<PasswordChangeResultView>('/api/v1/auth/password/change', {
        method: 'POST', body, headers: csrfHeaders(),
      })
      session.value = result.session
      loaded.value = true
      return result
    }
    finally { pending.value = false }
  }

  return {
    session: readonly(session), loaded: readonly(loaded), pending: readonly(pending),
    authenticated: computed(() => session.value.authenticated),
    load, login, register, refresh, logout, revokeAll, changePassword, clear,
  }
}
