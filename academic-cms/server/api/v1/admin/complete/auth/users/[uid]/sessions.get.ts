import { getRouterParam } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminAuthService } from '~~/server/services/complete-admin/auth-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['auth', 'auth_users', 'users'], 'view')
    return await new CompleteAdminAuthService(event, principal).sessions(getRouterParam(event, 'uid'))
  } catch (error) { mapAdminError(event, error) }
})
