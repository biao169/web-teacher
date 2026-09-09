import type { H3Event } from 'h3'
import { setHeader, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { PublicInteractionError } from '../interactions/errors'
import { SecurityError } from '../security/errors'
import { applyPrivateNoStore, clearSessionCookies } from './auth-http'
import { resolveOptionalSession, useAuthRuntime } from './auth-runtime'
import type { ActiveSession } from '../services/auth/session-service'

export function interactionFailure(event: H3Event, error: unknown): { error: { code: string; message: string; requestId: string } } {
  const requestId = event.context.requestId || 'unavailable'
  let code = 'INTERACTION_PROTOCOL'
  let message = '提交服务暂时不可用。'
  let statusCode = 500
  let retryAfter: number | undefined
  let expected = false

  if (error instanceof PublicInteractionError) {
    code = error.code
    message = error.publicMessage
    statusCode = error.statusCode
    retryAfter = error.retryAfterSeconds
    expected = true
  }
  else if (error instanceof SecurityError) {
    code = error.code
    message = error.publicMessage
    statusCode = error.statusCode
    retryAfter = error.retryAfterSeconds
    expected = true
  }
  else if (error instanceof ZodError) {
    code = 'INTERACTION_INPUT'
    message = '提交内容无效。'
    statusCode = 400
    expected = true
  }

  setResponseStatus(event, statusCode)
  applyPrivateNoStore(event)
  if (retryAfter !== undefined) setHeader(event, 'retry-after', retryAfter)
  if (!expected) {
    console.error('Public interaction request failed unexpectedly', {
      requestId,
      errorType: error instanceof Error ? error.name : typeof error,
      code,
    })
  }
  return { error: { code, message, requestId } }
}

export async function resolveLenientInteractionSession(event: H3Event): Promise<ActiveSession | null> {
  try { return await resolveOptionalSession(event) }
  catch (error) {
    if (error instanceof SecurityError && (error.code === 'AUTH_SESSION_INVALID' || error.code === 'AUTH_SESSION_EXPIRED')) {
      clearSessionCookies(event, useAuthRuntime(event))
      return null
    }
    throw error
  }
}
