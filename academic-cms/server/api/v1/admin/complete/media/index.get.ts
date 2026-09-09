import { getQuery } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminResourceService } from '~~/server/services/complete-admin/resource-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['media', 'media_assets'], 'view')
    return await new CompleteAdminResourceService(event, principal).list('media', {
      ...getQuery(event),
      f_status: 'active',
    })
  } catch (error) { mapAdminError(event, error) }
})
