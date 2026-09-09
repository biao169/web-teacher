import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminMediaService } from '~~/server/services/complete-admin/media-service'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['media', 'media_assets'], 'delete', { write: true })
    const body = await readBoundedJson(event, 16 * 1024) as Record<string, unknown>
    return await new CompleteAdminMediaService(event, principal).cleanupExpired(body.limit)
  } catch (error) { mapAdminError(event, error) }
})
