import { getRouterParam } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminMediaService } from '~~/server/services/complete-admin/media-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['media', 'media_assets'], 'view')
    return await new CompleteAdminMediaService(event, principal).usage(getRouterParam(event, 'uid'))
  } catch (error) { mapAdminError(event, error) }
})
