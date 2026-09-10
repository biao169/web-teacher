import { adminErrorDetails } from '~/admin/errors'
import { getAdminQueryClient } from '~/admin/query-client'
import { safeAdminReturnPath } from '~~/shared/admin/paths'
export interface AdminRequestOptions {
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>; headers?: Record<string, string>
}
let redirectInFlight = false
export function useAdminApi() {
  const auth = useAuthSession(); const route = useRoute(); const ui = useAdminUi()
  function redirectForAuthentication(code: string): void {
    if (redirectInFlight) return
    redirectInFlight = true
    const next = safeAdminReturnPath(route.fullPath, '/admin')
    getAdminQueryClient().clear(); ui.resetTransient()
    if (code !== 'AUTH_PASSWORD_CHANGE_REQUIRED') auth.clear()
    const destination = code === 'AUTH_PASSWORD_CHANGE_REQUIRED' ? '/zh/account/password' : '/zh/login'
    window.location.replace(`${destination}?next=${encodeURIComponent(next)}`)
  }
  async function request<T>(url: string, options: AdminRequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET'; const headers = { ...(options.headers ?? {}) }
    if (!['GET', 'HEAD'].includes(method) && auth.session.value.authenticated) headers['x-csrf-token'] = auth.session.value.csrfToken
    try {
      return await $fetch<T>(url, { method, ...(options.body === undefined ? {} : { body: options.body }), ...(options.query === undefined ? {} : { query: options.query }), ...(Object.keys(headers).length ? { headers } : {}) }) as unknown as T
    }
    catch (error) {
      const details = adminErrorDetails(error)
      if (details.status === 401 || ['AUTH_REQUIRED', 'AUTH_SESSION_INVALID', 'AUTH_SESSION_EXPIRED'].includes(details.code)) redirectForAuthentication('AUTH_REQUIRED')
      else if (details.code === 'AUTH_PASSWORD_CHANGE_REQUIRED') redirectForAuthentication(details.code)
      throw error
    }
  }
  return { request }
}
