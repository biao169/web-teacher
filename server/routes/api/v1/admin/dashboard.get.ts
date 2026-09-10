import { useRuntimeConfig } from '#imports'
import type { AdminDashboardView, AdminRuntimeView } from '../../../../../shared/contracts/admin'
import { AdminDashboardStore } from '../../../../services/admin/dashboard-store'
import { defineAdminReadHandler } from '../../../../utils/admin-read-handler'
import { useDatabase } from '../../../../utils/database'
function runtime(value: unknown, version: unknown): AdminRuntimeView { return { kind: value === 'node' || value === 'cloudflare' ? value : 'unknown', version: typeof version === 'string' && version.trim() && version.length <= 64 ? version : 'unknown' } }
export default defineAdminReadHandler({ module: 'dashboard', action: 'view' }, async (event, session): Promise<AdminDashboardView> => {
  const config=useRuntimeConfig(event); const database=useDatabase(event); const data=await new AdminDashboardStore(database.adapter).read(session.principal)
  return { generatedAt: new Date().toISOString(), runtime: runtime(config.runtimeKind, config.appVersion), pendingMessages: data.pendingMessages, recentOperations: data.recentOperations }
})
