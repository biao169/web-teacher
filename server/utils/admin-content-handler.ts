import type { H3Event } from 'h3'
import { defineEventHandler, getRouterParam } from 'h3'
import type { PermissionAction } from '../../shared/enums/auth'
import { adminContentModule, isAdminContentModule, type AdminContentModule, type AdminContentModuleDefinition } from '../../shared/admin/content-modules'
import type { ActiveSession } from '../services/auth/session-service'
import { AdminContentError } from '../services/admin/content-errors'
import { protectJsonWrite } from './auth-http'
import { requireEventPermission } from './auth-guard'
import { useAuthRuntime } from './auth-runtime'
import { readBoundedJsonBody } from './bounded-json'
import { adminFailure, applyAdminNoStore } from './admin-http'

/**
 * Long-form records can legitimately contain several large text fields. The
 * limit remains below the global one-megabyte hard ceiling enforced by the
 * handler so a browser request cannot become an unbounded memory allocation.
 */
export const ADMIN_CONTENT_MUTATION_BODY_LIMIT = 768 * 1024
export const ADMIN_CONTENT_BATCH_BODY_LIMIT = 64 * 1024
export const ADMIN_CONTENT_SMALL_BODY_LIMIT = 16 * 1024

export interface AdminContentContext {
  readonly module: AdminContentModule
  readonly definition: AdminContentModuleDefinition
  readonly session: ActiveSession
}

function resolveModule(event: H3Event): { module: AdminContentModule; definition: AdminContentModuleDefinition } {
  const raw = getRouterParam(event, 'module')
  if (!isAdminContentModule(raw)) throw new AdminContentError('ADMIN_CONTENT_NOT_FOUND', 'Unknown admin content module')
  return { module: raw, definition: adminContentModule(raw) }
}

export function adminContentUid(event: H3Event): string {
  const uid = getRouterParam(event, 'uid')
  if (typeof uid !== 'string' || !uid) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Record UID is required')
  return uid
}

export function defineAdminContentReadHandler<T>(
  action: PermissionAction,
  handler: (event: H3Event, context: AdminContentContext) => T | Promise<T>,
) {
  return defineEventHandler(async (event) => {
    applyAdminNoStore(event)
    try {
      const selected = resolveModule(event)
      const session = await requireEventPermission(event, selected.module, action)
      return await handler(event, { ...selected, session })
    }
    catch (error) { return adminFailure(event, error) }
  })
}

export function defineAdminContentWriteHandler<T>(
  action: PermissionAction,
  handler: (event: H3Event, context: AdminContentContext, body: unknown) => T | Promise<T>,
  maximumBytes = ADMIN_CONTENT_SMALL_BODY_LIMIT,
) {
  return defineEventHandler(async (event) => {
    applyAdminNoStore(event)
    try {
      if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 2 || maximumBytes > 1_048_576) throw new TypeError('Admin content body limit is invalid')
      const selected = resolveModule(event)
      const runtime = useAuthRuntime(event)
      await protectJsonWrite(event, runtime, 'session')
      const body = await readBoundedJsonBody(event, maximumBytes)
      const session = await requireEventPermission(event, selected.module, action)
      return await handler(event, { ...selected, session }, body)
    }
    catch (error) { return adminFailure(event, error) }
  })
}
