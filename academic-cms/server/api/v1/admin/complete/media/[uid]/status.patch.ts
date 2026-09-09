import { getRouterParam } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminMediaService } from '~~/server/services/complete-admin/media-service'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['media', 'media_assets'], 'edit', { write: true })
    const body = await readBoundedJson(event, 16 * 1024)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_MEDIA_STATUS')
    const source = body as Record<string, unknown>
    return await new CompleteAdminMediaService(event, principal).setStatus(getRouterParam(event, 'uid'), source.status, source.expectedUpdatedAt)
  } catch (error) { mapAdminError(event, error) }
})
