import { getRouterParam } from 'h3'
import { getResource } from '~~/shared/complete-admin/core.mjs'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminResourceService } from '~~/server/services/complete-admin/resource-service'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const key = String(getRouterParam(event, 'resource') ?? '')
    const resource = getResource(key)
    const principal = await requireAdmin(event, resource.permission, 'create', { write: true })
    return { record: await new CompleteAdminResourceService(event, principal).create(key, await readBoundedJson(event)) }
  } catch (error) { mapAdminError(event, error) }
})
