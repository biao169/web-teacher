import { getQuery } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminMediaService } from '~~/server/services/complete-admin/media-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['media', 'media_assets'], 'view')
    const query = getQuery(event)
    if (query.uids !== undefined && typeof query.uids !== 'string') throw new Error('INVALID_MEDIA_SCAN')
    return await new CompleteAdminMediaService(event, principal).fullScanStatus(String(query.uids ?? '').split(',').filter(Boolean))
  } catch (error) { mapAdminError(event, error) }
})
