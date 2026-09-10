import { setHeader } from 'h3'
import { authFailure, clearSessionCookies, refreshCsrfCookie } from '../../../../utils/auth-http'
import { resolveOptionalSession, useAuthRuntime } from '../../../../utils/auth-runtime'
import { SecurityError } from '../../../../security/errors'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store, max-age=0')
  const runtime = useAuthRuntime(event)
  try {
    const session = await resolveOptionalSession(event)
    if (session) refreshCsrfCookie(event, runtime, session.csrfToken, session.expiresAt)
    return runtime.sessions.toView(session)
  }
  catch (error) {
    if (error instanceof SecurityError && (error.code === 'AUTH_SESSION_INVALID' || error.code === 'AUTH_SESSION_EXPIRED')) {
      clearSessionCookies(event, runtime)
      return runtime.sessions.toView(null)
    }
    return authFailure(event, error)
  }
})
