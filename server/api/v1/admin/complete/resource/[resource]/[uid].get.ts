import { getRouterParam } from 'h3'
import { getResource } from '~~/shared/complete-admin/core.mjs'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminResourceService } from '~~/server/services/complete-admin/resource-service'
import { adminError, mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const key = String(getRouterParam(event, 'resource') ?? '')
    const resource = getResource(key)
    const principal = await requireAdmin(event, resource.permission, 'view')
    const record = await new CompleteAdminResourceService(event, principal).get(key, getRouterParam(event, 'uid'))
    if (!record) throw adminError(404, 'RECORD_NOT_FOUND', '记录不存在')
    return { record }
  } catch (error) { mapAdminError(event, error) }
})
