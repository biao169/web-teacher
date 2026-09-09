import { passwordChangeRequestSchema } from '../../../../../../shared/schemas/interactions'
import { SecurityError } from '../../../../../security/errors'
import { applyPrivateNoStore, authFailure, protectJsonWrite, refreshCsrfCookie } from '../../../../../utils/auth-http'
import { resolveOptionalSession, useAuthRuntime } from '../../../../../utils/auth-runtime'
import { readBoundedJsonBody } from '../../../../../utils/bounded-json'
import { useInteractionRuntime } from '../../../../../utils/interaction-runtime'

export default defineEventHandler(async (event) => {
  applyPrivateNoStore(event)
  try {
    const runtime = useAuthRuntime(event)
    await protectJsonWrite(event, runtime, 'session')
    const body = passwordChangeRequestSchema.parse(await readBoundedJsonBody(event))
    const session = await resolveOptionalSession(event)
    if (!session) throw new SecurityError('AUTH_REQUIRED', 'Authentication is required')
    const refreshed = await useInteractionRuntime(event).account.changePassword(session, {
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      requestId: event.context.requestId,
    })
    refreshCsrfCookie(event, runtime, refreshed.csrfToken, refreshed.expiresAt)
    return { changed: true, session: runtime.sessions.toView(refreshed) }
  }
  catch (error) { return authFailure(event, error) }
})
