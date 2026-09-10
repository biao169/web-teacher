import { emptyObjectSchema } from '../../../../../../shared/schemas/interactions'
import { SecurityError } from '../../../../../security/errors'
import { applyPrivateNoStore, authFailure, protectJsonWrite, refreshCsrfCookie } from '../../../../../utils/auth-http'
import { resolveOptionalSession, useAuthRuntime } from '../../../../../utils/auth-runtime'
import { readBoundedJsonBody } from '../../../../../utils/bounded-json'

export default defineEventHandler(async (event) => {
  applyPrivateNoStore(event)
  try {
    const runtime = useAuthRuntime(event)
    await protectJsonWrite(event, runtime, 'session')
    emptyObjectSchema.parse(await readBoundedJsonBody(event))
    const session = await resolveOptionalSession(event)
    if (!session) throw new SecurityError('AUTH_REQUIRED', 'Authentication is required')
    refreshCsrfCookie(event, runtime, session.csrfToken, session.expiresAt)
    return runtime.sessions.toView(session)
  }
  catch (error) { return authFailure(event, error) }
})
