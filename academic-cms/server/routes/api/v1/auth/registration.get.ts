import { PASSWORD_MIN_CODE_POINTS } from '../../../../security/password-policy'
import { applyPrivateNoStore } from '../../../../utils/auth-http'
import { authFailure } from '../../../../utils/auth-http'
import { resolveLenientInteractionSession } from '../../../../utils/interaction-http'
import { useInteractionRuntime } from '../../../../utils/interaction-runtime'

export default defineEventHandler(async (event) => {
  applyPrivateNoStore(event)
  try {
    const [enabled, session] = await Promise.all([
      useInteractionRuntime(event).registration.available(),
      resolveLenientInteractionSession(event),
    ])
    return {
      enabled,
      authenticated: Boolean(session),
      minimumPasswordLength: PASSWORD_MIN_CODE_POINTS,
    }
  }
  catch (error) { return authFailure(event, error) }
})
