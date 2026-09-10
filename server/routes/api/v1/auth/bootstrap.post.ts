import { setHeader } from 'h3'
import { bootstrapRequestSchema } from '../../../../../shared/schemas/auth'
import { authFailure, bearerToken, protectJsonWrite } from '../../../../utils/auth-http'
import { useAuthRuntime } from '../../../../utils/auth-runtime'
import { readBoundedJsonBody } from '../../../../utils/bounded-json'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store, max-age=0')
  try {
    const runtime = useAuthRuntime(event)
    await protectJsonWrite(event, runtime)
    const body = bootstrapRequestSchema.parse(await readBoundedJsonBody(event))
    const result = await runtime.bootstrap.createInitialAdministrator({
      username: body.username,
      password: body.password,
      displayName: body.displayName ?? null,
      email: body.email ?? null,
      presentedToken: bearerToken(event),
      expectedToken: runtime.config.bootstrapToken,
      requestId: event.context.requestId,
    })
    return {
      user: {
        uid: result.userUid,
        username: result.username,
        displayName: result.displayName,
        email: result.email,
      },
    }
  }
  catch (error) {
    return authFailure(event, error)
  }
})
