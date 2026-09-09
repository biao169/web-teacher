import { getCookie, getHeader, setHeader } from 'h3'
import { loginRequestSchema } from '../../../../../shared/schemas/auth'
import { authFailure, protectJsonWrite, requestNetwork, setSessionCookies } from '../../../../utils/auth-http'
import { useAuthRuntime } from '../../../../utils/auth-runtime'
import { readBoundedJsonBody } from '../../../../utils/bounded-json'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store, max-age=0')
  try {
    const runtime = useAuthRuntime(event)
    await protectJsonWrite(event, runtime)
    const body = loginRequestSchema.parse(await readBoundedJsonBody(event))
    const userAgent = getHeader(event, 'user-agent')
    const rotateSessionToken = getCookie(event, runtime.cookies.sessionName)
    const session = await runtime.authentication.login({
      username: body.username,
      password: body.password,
      network: requestNetwork(event, runtime),
      requestId: event.context.requestId,
      ...(userAgent !== undefined ? { userAgent } : {}),
      ...(rotateSessionToken !== undefined ? { rotateSessionToken } : {}),
    })
    setSessionCookies(event, runtime, session)
    return runtime.sessions.toView(session)
  }
  catch (error) {
    return authFailure(event, error)
  }
})
