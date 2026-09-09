import { getCookie, setHeader } from 'h3'
import { authFailure, clearSessionCookies, protectJsonWrite } from '../../../../utils/auth-http'
import { resolveOptionalSession, useAuthRuntime } from '../../../../utils/auth-runtime'
import { SecurityError } from '../../../../security/errors'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store, max-age=0')
  const runtime = useAuthRuntime(event)
  try {
    const hasSessionCookie = Boolean(getCookie(event, runtime.cookies.sessionName))
    await protectJsonWrite(event, runtime, hasSessionCookie ? 'session' : 'anonymous')
    const session = hasSessionCookie ? await resolveOptionalSession(event) : null
    await runtime.sessions.logout(session, event.context.requestId)
    clearSessionCookies(event, runtime)
    return runtime.sessions.toView(null)
  }
  catch (error) {
    if (error instanceof SecurityError && (error.code === 'AUTH_SESSION_INVALID' || error.code === 'AUTH_SESSION_EXPIRED')) {
      clearSessionCookies(event, runtime)
      return runtime.sessions.toView(null)
    }
    return authFailure(event, error)
  }
})
