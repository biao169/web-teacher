import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminMediaService } from '~~/server/services/complete-admin/media-service'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['media', 'media_assets'], 'create', { write: true })
    await requireAdmin(event, ['media', 'media_assets'], 'edit')
    await readBoundedJson(event, 1024)
    return await new CompleteAdminMediaService(event, principal).startFullScan()
  } catch (error) { mapAdminError(event, error) }
})
