import { getRouterParam } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminAuthService } from '~~/server/services/complete-admin/auth-service'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['auth', 'auth_users', 'users'], 'edit', { write: true })
    return await new CompleteAdminAuthService(event, principal).revokeSessions(getRouterParam(event, 'uid'), await readBoundedJson(event, 16 * 1024))
  } catch (error) { mapAdminError(event, error) }
})
