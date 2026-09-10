import type { QueryClient } from '@tanstack/vue-query'
import { adminErrorDetails } from '../admin/errors'
import { safeAdminReturnPath } from '../../shared/admin/paths'
function isAdminLocation(): boolean { return window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/') }
function currentAdminPath(): string { return safeAdminReturnPath(`${window.location.pathname}${window.location.search}${window.location.hash}`, '/admin') }
export default defineNuxtPlugin({
  name: 'admin-runtime', enforce: 'pre',
  async setup(nuxtApp) {
    if (!isAdminLocation()) return { provide: { adminRuntimeReady: false, adminQueryClient: null as QueryClient | null } }
    const [{ getAdminPinia }, queryRuntime] = await Promise.all([import('../admin/pinia'), import('../admin/query-client')])
    const auth = useAuthSession(); let redirecting = false
    const redirectForFailure = (error: unknown): void => {
      if (redirecting || !isAdminLocation()) return
      const detail = adminErrorDetails(error); const next = currentAdminPath()
      if (detail.code === 'AUTH_PASSWORD_CHANGE_REQUIRED') {
        redirecting = true; queryClient.clear(); window.location.replace(`/zh/account/password?next=${encodeURIComponent(next)}`); return
      }
      if (detail.status === 401 || ['AUTH_REQUIRED', 'AUTH_SESSION_INVALID', 'AUTH_SESSION_EXPIRED'].includes(detail.code)) {
        redirecting = true; auth.clear(); queryClient.clear(); window.location.replace(`/zh/login?next=${encodeURIComponent(next)}`); return
      }
      if (detail.status === 403) {
        void import('../admin/permission-feedback').then(({ showAdminPermissionDenied }) => showAdminPermissionDenied(error, detail.message))
      }
    }
    const queryClient: QueryClient = queryRuntime.getAdminQueryClient(redirectForFailure)
    nuxtApp.vueApp.use(getAdminPinia())
    nuxtApp.vueApp.use(queryRuntime.VueQueryPlugin, { queryClient })
    let wasAuthenticated = auth.session.value.authenticated
    const stopWatch = watch(() => auth.session.value.authenticated, (authenticated) => {
      if (wasAuthenticated && !authenticated && isAdminLocation()) redirectForFailure({ statusCode: 401, data: { error: { code: 'AUTH_SESSION_EXPIRED' } } })
      wasAuthenticated = authenticated
    })
    const removeAfterEach = nuxtApp.$router.afterEach((to) => { redirecting = false; if (!to.path.startsWith('/admin')) queryClient.clear() })
    nuxtApp.vueApp.onUnmount(() => { stopWatch(); removeAfterEach(); queryClient.clear() })
    return { provide: { adminRuntimeReady: true, adminQueryClient: queryClient } }
  },
})
