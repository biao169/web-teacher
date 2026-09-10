import { getCookie } from 'h3'
import { contactMessageRequestSchema } from '../../../../../shared/schemas/interactions'
import { applyPrivateNoStore, protectJsonWrite, requestNetwork } from '../../../../utils/auth-http'
import { resolveOptionalSession, useAuthRuntime } from '../../../../utils/auth-runtime'
import { readBoundedJsonBody } from '../../../../utils/bounded-json'
import { interactionFailure } from '../../../../utils/interaction-http'
import { useInteractionRuntime } from '../../../../utils/interaction-runtime'

const CONTACT_BODY_LIMIT = 64 * 1024

export default defineEventHandler(async (event) => {
  applyPrivateNoStore(event)
  try {
    const auth = useAuthRuntime(event)
    const hasSessionCookie = Boolean(getCookie(event, auth.cookies.sessionName))
    await protectJsonWrite(event, auth, hasSessionCookie ? 'session' : 'anonymous')
    const body = contactMessageRequestSchema.parse(await readBoundedJsonBody(event, CONTACT_BODY_LIMIT))
    const session = hasSessionCookie ? await resolveOptionalSession(event) : null
    return await useInteractionRuntime(event).contact.submit({
      newsUid: body.newsUid ?? null,
      name: body.name ?? null,
      email: body.email ?? null,
      messageType: body.messageType,
      subject: body.subject,
      content: body.content,
      website: body.website ?? null,
      network: requestNetwork(event, auth),
      requestId: event.context.requestId,
      session,
    })
  }
  catch (error) { return interactionFailure(event, error) }
})
