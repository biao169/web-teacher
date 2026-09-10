import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { RESOURCE_CATALOG } from '~~/shared/complete-admin/core.mjs'
import { CompleteAdminResourceService } from '~~/server/services/complete-admin/resource-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, [...new Set(Object.values(RESOURCE_CATALOG).flatMap((value: any) => value.permission ?? []))], 'view')
    return { modules: new CompleteAdminResourceService(event, principal).schemas() }
  } catch (error) { mapAdminError(event, error) }
})
