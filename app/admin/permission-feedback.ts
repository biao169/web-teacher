import { ElMessageBox } from 'element-plus'

const handledErrors = new WeakSet<object>()
let activeDialog: Promise<void> | null = null

/**
 * Display one permission dialog even when a failed request is observed by both
 * a composable and Vue Query's global error cache.
 */
export function showAdminPermissionDenied(error?: unknown, message = '当前账号没有访问该后台功能的权限。'): Promise<void> {
  if (!import.meta.client) return Promise.resolve()
  if (error && typeof error === 'object') {
    if (handledErrors.has(error)) return activeDialog ?? Promise.resolve()
    handledErrors.add(error)
  }
  if (activeDialog) return activeDialog

  const dialog = ElMessageBox.alert(message, '权限不足', {
    type: 'warning',
    confirmButtonText: '我知道了',
    closeOnClickModal: false,
    closeOnPressEscape: true,
    showClose: true,
  }).then(() => undefined).catch(() => undefined)
  activeDialog = dialog
  void dialog.finally(() => {
    if (activeDialog === dialog) activeDialog = null
  })
  return dialog
}
