import { adminContentRoute } from '~~/shared/admin/content-modules'
import { adminModule, adminModuleForPath, hasAdminPermission, isAdminSpecialPath } from '~~/shared/admin/registry'
import type { AuthModule, PermissionAction } from '~~/shared/enums/auth'
import { safeAdminReturnPath } from '~~/shared/admin/paths'
function isAdminPath(path: string): boolean { return path === '/admin' || path.startsWith('/admin/') }
function leaveAdmin(path: string) { return navigateTo(path, { external: true, replace: true }) }
async function denyPermission(module: AuthModule, action: PermissionAction = 'view') {
  const selected = adminModule(module)
  const actionLabel = action === 'create' ? '新建' : action === 'edit' ? '编辑' : action === 'delete' ? '删除' : action === 'export' ? '导出' : '访问'
  const { showAdminPermissionDenied } = await import('../admin/permission-feedback')
  await showAdminPermissionDenied(undefined, `当前账号没有“${selected.title}”的${actionLabel}权限。`)
  return navigateTo({ path: '/admin/forbidden', query: { module, action } }, { replace: true })
}
export default defineNuxtRouteMiddleware(async (to) => {
  if (!isAdminPath(to.path) || import.meta.server) return
  if (to.path === '/admin/unavailable') return
  const nuxtApp = useNuxtApp()
  if (!nuxtApp.$adminRuntimeReady) return leaveAdmin(to.fullPath)
  const auth = useAuthSession()
  try { await auth.load() }
  catch { return navigateTo({ path: '/admin/unavailable', query: { next: safeAdminReturnPath(to.fullPath) } }, { replace: true }) }
  if (!auth.session.value.authenticated) return leaveAdmin(`/zh/login?next=${encodeURIComponent(safeAdminReturnPath(to.fullPath))}`)
  if (auth.session.value.user.mustChangePassword) return leaveAdmin(`/zh/account/password?next=${encodeURIComponent(safeAdminReturnPath(to.fullPath))}`)
  if (isAdminSpecialPath(to.path)) return
  if (to.path === '/admin/system-check') {
    if (!hasAdminPermission(auth.session.value.user, 'dashboard', 'view')) return denyPermission('dashboard')
    return
  }
  const selected = adminModuleForPath(to.path)
  if (!selected) return navigateTo('/admin/not-found', { replace: true })
  if (!hasAdminPermission(auth.session.value.user, selected.module, 'view')) return denyPermission(selected.module)
  const contentRoute = adminContentRoute(to.path)
  if (contentRoute?.mode === 'create' && !hasAdminPermission(auth.session.value.user, selected.module, 'create')) {
    return denyPermission(selected.module, 'create')
  }
})
