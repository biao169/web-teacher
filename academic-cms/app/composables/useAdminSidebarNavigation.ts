interface ConfiguredAdminNavigationItem {
  uid: string
  title: string
  path: string | null
  urlName: string | null
  sortOrder: number
}

export function useAdminSidebarNavigation() {
  const auth = useAuthSession()
  const items = useState<ConfiguredAdminNavigationItem[]>('configured-admin-sidebar-items', () => [])
  const pending = useState<boolean>('configured-admin-sidebar-pending', () => false)

  async function refresh(): Promise<void> {
    if (!import.meta.client || !auth.session.value.authenticated || pending.value) {
      if (!auth.session.value.authenticated) items.value = []
      return
    }
    pending.value = true
    try {
      const response = await $fetch<{ items?: ConfiguredAdminNavigationItem[] }>('/api/v1/admin/navigation')
      items.value = Array.isArray(response.items) ? response.items : []
    }
    catch { items.value = [] }
    finally { pending.value = false }
  }

  onMounted(() => void refresh())
  watch(() => auth.session.value.authenticated ? auth.session.value.user.uid : null, () => void refresh())
  return { items: readonly(items), pending: readonly(pending), refresh }
}
