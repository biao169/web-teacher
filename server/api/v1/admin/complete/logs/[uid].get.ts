import { getRouterParam } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminLogService } from '~~/server/services/complete-admin/log-service'
import { adminError, mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['operation_logs', 'logs'], 'view')
    const record = await new CompleteAdminLogService(event, principal).get(String(getRouterParam(event, 'uid') ?? ''))
    if (!record) throw adminError(404, 'RECORD_NOT_FOUND', '操作日志不存在')
    return { record }
  } catch (error) { mapAdminError(event, error) }
})
