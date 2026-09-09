import { adminBreadcrumbs, adminModuleForPath, hasAdminPermission, visibleAdminNavigation } from '~~/shared/admin/registry'
export function useAdminShell() {
  const route = useRoute(); const auth = useAuthSession()
  const configured = useAdminSidebarNavigation()
  const activeModule = computed(() => adminModuleForPath(route.path))
  const user = computed(() => auth.session.value.authenticated ? auth.session.value.user : null)
  const navigation = computed(() => {
    const custom = new Map<string, { title: string; path: string; sortOrder: number }>()
    for (const item of configured.items.value) {
      const path = item.urlName === 'admin' || item.urlName === 'login' ? '/admin' : item.path
      if (!path) continue
      const module = adminModuleForPath(path)
      if (!module || !hasAdminPermission(user.value, module.module, 'view') || custom.has(module.module)) continue
      const title = item.title.trim().slice(0, 200)
      if (title) custom.set(module.module, { title, path, sortOrder: item.sortOrder })
    }
    return visibleAdminNavigation(user.value).map(group => ({
      ...group,
      modules: group.modules.map(module => {
        const item = custom.get(module.module)
        return item ? { ...module, title: item.title, shortTitle: item.title, path: item.path, order: item.sortOrder } : module
      }).sort((left, right) => {
        const leftCustom = custom.has(left.module), rightCustom = custom.has(right.module)
        if (leftCustom !== rightCustom) return leftCustom ? -1 : 1
        return left.order - right.order
      }),
    }))
  })
  const breadcrumbs = computed(() => adminBreadcrumbs(route.fullPath, user.value))
  const pageTitle = computed(() => activeModule.value?.title ?? (route.path === '/admin/forbidden' ? '无权访问' : route.path === '/admin/not-found' ? '页面不存在' : route.path === '/admin/unavailable' ? '服务暂不可用' : '管理后台'))
  return { activeModule, user, navigation, breadcrumbs, pageTitle, refreshNavigation: configured.refresh }
}
