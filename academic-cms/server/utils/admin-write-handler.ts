import type { H3Event } from 'h3'; import { defineEventHandler } from 'h3'
import type { AdminPermissionRequirement } from '../../shared/contracts/admin'; import type { ActiveSession } from '../services/auth/session-service'
import { AUTH_JSON_BODY_LIMIT } from '../security/body'; import { protectJsonWrite } from './auth-http'; import { requireEventPermission } from './auth-guard'; import { readBoundedJsonBody } from './bounded-json'; import { adminFailure, applyAdminNoStore } from './admin-http'; import { useAuthRuntime } from './auth-runtime'
export interface AdminWriteHandlerOptions { readonly maximumBytes?: number }
export function defineAdminWriteHandler<TResult>(requirement: AdminPermissionRequirement, handler: (event: H3Event, session: ActiveSession, body: unknown) => TResult | Promise<TResult>, options: AdminWriteHandlerOptions = {}) {
  return defineEventHandler(async (event) => {
    applyAdminNoStore(event)
    try {
      const maximumBytes = options.maximumBytes ?? AUTH_JSON_BODY_LIMIT
      if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 2 || maximumBytes > 1_048_576) throw new TypeError('Admin write body limit is invalid')
      const runtime = useAuthRuntime(event); await protectJsonWrite(event, runtime, 'session')
      const body = await readBoundedJsonBody(event, maximumBytes)
      const session = await requireEventPermission(event, requirement.module, requirement.action)
      return await handler(event, session, body)
    }
    catch (error) { return adminFailure(event, error) }
  })
}
