import { getQuery } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminMediaService } from '~~/server/services/complete-admin/media-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['media', 'media_assets'], 'view')
    const value = getQuery(event).uids
    if (typeof value !== 'string') throw new Error('INVALID_MEDIA_USAGE_SUMMARY')
    return await new CompleteAdminMediaService(event, principal).usageSummary(value.split(',').filter(Boolean))
  } catch (error) { mapAdminError(event, error) }
})
