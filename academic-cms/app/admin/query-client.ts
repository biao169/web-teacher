import { MutationCache, QueryCache, QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { adminErrorDetails } from './errors'
let queryClient: QueryClient | undefined
let failureHandler: ((error: unknown) => void) | undefined
function shouldRetry(failureCount: number, error: unknown): boolean {
  const { status } = adminErrorDetails(error)
  if ([400, 401, 403, 404, 409, 413, 415, 422, 429].includes(status)) return false
  return failureCount < 1
}
export function getAdminQueryClient(onFailure?: (error: unknown) => void): QueryClient {
  if (onFailure) failureHandler = onFailure
  queryClient ??= new QueryClient({
    queryCache: new QueryCache({ onError: error => failureHandler?.(error) }),
    mutationCache: new MutationCache({ onError: error => failureHandler?.(error) }),
    defaultOptions: {
      queries: { staleTime: 20_000, gcTime: 600_000, retry: shouldRetry, retryDelay: attempt => Math.min(750 * 2 ** attempt, 4_000), refetchOnWindowFocus: false, refetchOnReconnect: true },
      mutations: { retry: false },
    },
  })
  return queryClient
}
export { VueQueryPlugin }
export const adminQueryKeys = Object.freeze({
  root: ['admin'] as const,
  dashboard: ['admin', 'dashboard'] as const,
  list: (module: string, query: unknown) => ['admin', 'list', module, query] as const,
  detail: (module: string, uid: string) => ['admin', 'detail', module, uid] as const,
  suggestions: (module: string, field: string, query: string) => ['admin', 'suggestions', module, field, query] as const,
})
