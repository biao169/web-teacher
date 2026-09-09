import { getQuery, getRouterParam } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminAuthService } from '~~/server/services/complete-admin/auth-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['auth', 'auth_roles', 'roles'], 'edit', { write: true })
    await new CompleteAdminAuthService(event, principal).deleteRole(getRouterParam(event, 'uid'), getQuery(event).updatedAt)
    return { ok: true }
  } catch (error) { mapAdminError(event, error) }
})
