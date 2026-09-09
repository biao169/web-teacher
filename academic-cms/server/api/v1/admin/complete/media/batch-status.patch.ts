import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminMediaService } from '~~/server/services/complete-admin/media-service'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['media', 'media_assets'], 'edit', { write: true })
    return await new CompleteAdminMediaService(event, principal).batchStatus(await readBoundedJson(event, 64 * 1024))
  } catch (error) { mapAdminError(event, error) }
})
