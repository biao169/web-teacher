import { getCookie } from 'h3'
import { registrationRequestSchema } from '../../../../../shared/schemas/interactions'
import { SecurityError } from '../../../../security/errors'
import { applyPrivateNoStore, authFailure, protectJsonWrite, requestNetwork } from '../../../../utils/auth-http'
import { resolveOptionalSession, useAuthRuntime } from '../../../../utils/auth-runtime'
import { readBoundedJsonBody } from '../../../../utils/bounded-json'
import { useInteractionRuntime } from '../../../../utils/interaction-runtime'

export default defineEventHandler(async (event) => {
  applyPrivateNoStore(event)
  try {
    const auth = useAuthRuntime(event)
    const hasSessionCookie = Boolean(getCookie(event, auth.cookies.sessionName))
    await protectJsonWrite(event, auth, hasSessionCookie ? 'session' : 'anonymous')
    if (hasSessionCookie && await resolveOptionalSession(event)) {
      throw new SecurityError('AUTH_FORBIDDEN', 'Authenticated users cannot register another public account', {
        publicMessage: '当前账号已登录。',
      })
    }
    const body = registrationRequestSchema.parse(await readBoundedJsonBody(event))
    const config = useRuntimeConfig(event)
    return await useInteractionRuntime(event).registration.register({
      username: body.username,
      password: body.password,
      displayName: body.displayName ?? null,
      email: body.email ?? null,
      network: requestNetwork(event, auth),
      requestId: event.context.requestId,
      siteName: typeof config.public === 'object' && config.public && 'siteName' in config.public
        ? String((config.public as Record<string, unknown>).siteName ?? '')
        : null,
    })
  }
  catch (error) { return authFailure(event, error) }
})
