import { getRouterParam } from 'h3'
import { getResource } from '~~/shared/complete-admin/core.mjs'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminResourceService } from '~~/server/services/complete-admin/resource-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const key = String(getRouterParam(event, 'resource') ?? '')
    const resource = getResource(key)
    const principal = await requireAdmin(event, resource.permission, 'view')
    return await new CompleteAdminResourceService(event, principal).list(key)
  } catch (error) { mapAdminError(event, error) }
})
