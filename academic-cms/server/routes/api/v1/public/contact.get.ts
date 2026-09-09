import { applyPrivateNoStore } from '../../../../utils/auth-http'
import { interactionFailure, resolveLenientInteractionSession } from '../../../../utils/interaction-http'
import { useInteractionRuntime } from '../../../../utils/interaction-runtime'

export default defineEventHandler(async (event) => {
  applyPrivateNoStore(event)
  try {
    const session = await resolveLenientInteractionSession(event)
    return await useInteractionRuntime(event).contact.availability(session)
  }
  catch (error) { return interactionFailure(event, error) }
})
