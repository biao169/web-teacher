import { defineEventHandler, getQuery } from 'h3'
import { ADMIN_IDENTITY_RESOURCES, isAdminIdentityResource } from '~~/shared/admin/identity'
import { CompleteAdminDuplicateService } from '~~/server/services/complete-admin/duplicate-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event)
    if (!isAdminIdentityResource(query.resource)) throw new Error('UNKNOWN_DUPLICATE_RESOURCE')
    await requireAdmin(event, [ADMIN_IDENTITY_RESOURCES[query.resource].module], 'view')
    return await new CompleteAdminDuplicateService(event).check(query.resource, query.field, query.value, query.excludeUid)
  }
  catch (error) { mapAdminError(event, error) }
})
