import { getHeader, getRouterParam, sendStream, setHeader, setResponseStatus } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminMediaService } from '~~/server/services/complete-admin/media-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['media', 'media_assets'], 'view')
    const plan = await new CompleteAdminMediaService(event, principal).preview(getRouterParam(event, 'uid'), getHeader(event, 'range'))
    setResponseStatus(event, plan.status)
    for (const [name, value] of Object.entries(plan.headers)) setHeader(event, name, value)
    return plan.body ? sendStream(event, plan.body) : null
  }
  catch (error) { mapAdminError(event, error) }
})
