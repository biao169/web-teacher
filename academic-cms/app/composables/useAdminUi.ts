import { getAdminPinia } from '~/admin/pinia'
import { useAdminUiStore } from '~/stores/admin-ui'
export function useAdminUi() {
  const store = useAdminUiStore(getAdminPinia())
  if (import.meta.client) store.hydrate()
  return store
}
