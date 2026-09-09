import { useQuery } from '@tanstack/vue-query'
import { adminQueryKeys, getAdminQueryClient } from '~/admin/query-client'
import type { AdminDashboardView } from '~~/shared/contracts/admin'
export function useAdminDashboard() {
  const api = useAdminApi()
  return useQuery({ queryKey: adminQueryKeys.dashboard, queryFn: () => api.request<AdminDashboardView>('/api/v1/admin/dashboard') }, getAdminQueryClient())
}
