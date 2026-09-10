import type { H3Event } from 'h3'; import { defineEventHandler } from 'h3'
import type { AdminPermissionRequirement } from '../../shared/contracts/admin'; import type { ActiveSession } from '../services/auth/session-service'
import { requireEventPermission } from './auth-guard'; import { adminFailure, applyAdminNoStore } from './admin-http'
export function defineAdminReadHandler<T>(requirement: AdminPermissionRequirement, handler: (event: H3Event, session: ActiveSession) => T | Promise<T>) {
  return defineEventHandler(async (event) => { applyAdminNoStore(event); try { const session = await requireEventPermission(event, requirement.module, requirement.action); return await handler(event, session) } catch (error) { return adminFailure(event, error) } })
}
