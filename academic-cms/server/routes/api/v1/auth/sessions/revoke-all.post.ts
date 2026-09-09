import { emptyObjectSchema } from '../../../../../../shared/schemas/interactions'
import { SecurityError } from '../../../../../security/errors'
import { applyPrivateNoStore, authFailure, clearSessionCookies, protectJsonWrite } from '../../../../../utils/auth-http'
import { resolveOptionalSession, useAuthRuntime } from '../../../../../utils/auth-runtime'
import { readBoundedJsonBody } from '../../../../../utils/bounded-json'
import { useInteractionRuntime } from '../../../../../utils/interaction-runtime'

export default defineEventHandler(async (event) => {
  applyPrivateNoStore(event)
  try {
    const runtime = useAuthRuntime(event)
    await protectJsonWrite(event, runtime, 'session')
    emptyObjectSchema.parse(await readBoundedJsonBody(event))
    const session = await resolveOptionalSession(event)
    if (!session) throw new SecurityError('AUTH_REQUIRED', 'Authentication is required')
    const revokedSessions = await useInteractionRuntime(event).account.revokeAllSessions(session, event.context.requestId)
    clearSessionCookies(event, runtime)
    return { authenticated: false, revokedSessions }
  }
  catch (error) { return authFailure(event, error) }
})
