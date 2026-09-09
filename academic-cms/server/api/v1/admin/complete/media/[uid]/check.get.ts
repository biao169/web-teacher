import { getQuery, getRouterParam } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminMediaService } from '~~/server/services/complete-admin/media-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['media', 'media_assets'], 'view')
    const deep = getQuery(event).deep
    if (deep !== undefined && deep !== '0' && deep !== '1') throw new Error('INVALID_MEDIA_SCAN')
    return await new CompleteAdminMediaService(event, principal).check(getRouterParam(event, 'uid'), deep === '1')
  } catch (error) { mapAdminError(event, error) }
})
