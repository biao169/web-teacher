import type { H3Event } from 'h3'
import type { AuthModule, PermissionAction } from '../../shared/enums/auth'
import { SecurityError } from '../security/errors'
import { requirePermission } from '../security/permissions'
import type { ActiveSession } from '../services/auth/session-service'
import { resolveOptionalSession } from './auth-runtime'

/** Resolves the opaque cookie session once per request and fails closed. */
export async function requireActiveSession(event: H3Event): Promise<ActiveSession> {
  const active = event.context.authSession ?? await resolveOptionalSession(event)
  if (!active) throw new SecurityError('AUTH_REQUIRED', 'Authentication is required')
  event.context.authSession = active
  return active
}

/** Module permission checks are server-side and never inferred from UI visibility. */
export async function requireEventPermission(
  event: H3Event,
  module: AuthModule,
  action: PermissionAction,
): Promise<ActiveSession> {
  const active = await requireActiveSession(event)
  requirePermission(active.principal, module, action)
  return active
}
