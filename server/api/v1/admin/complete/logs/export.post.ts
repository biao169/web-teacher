import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminLogService } from '~~/server/services/complete-admin/log-service'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['operation_logs', 'logs'], 'export', { write: true })
    return await new CompleteAdminLogService(event, principal).export(await readBoundedJson(event, 64 * 1024))
  } catch (error) { mapAdminError(event, error) }
})
