import { ADMIN_MODULES } from '~~/shared/admin/registry'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event, ['dashboard'], 'view')
  setHeader(event, 'Cache-Control', 'private, no-store')
  return {
    status: 'ok',
    capabilities: ADMIN_MODULES.map(({ module, path, implemented }) => ({ module, path, connected: implemented })),
  }
})
