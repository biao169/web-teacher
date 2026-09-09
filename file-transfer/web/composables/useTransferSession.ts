import { ref, onMounted, onBeforeUnmount, watch, useAuthSession } from '#imports'
import type { ToolSession } from '../../shared/client'

/** Client-only identity; tokens remain on the server. */
export function useTransferSession() {
  const auth = useAuthSession()
  const session = ref<ToolSession | null>(null)
  const pending = ref(false)
  const error = ref('')
  let timer: ReturnType<typeof setInterval> | undefined
  let mounted = false
  let generation = 0
  let controller: AbortController | undefined
  async function refresh() {
    if (!mounted) return
    const run = ++generation
    controller?.abort(); controller = new AbortController()
    pending.value = true
    try {
      const value = await $fetch<ToolSession>('/transfer-api/v1/session', { signal: controller.signal, retry: 0, timeout: 3500 })
      if (run === generation) { session.value = value; error.value = '' }
    } catch (cause: unknown) {
      if (run === generation) {
        session.value = null
        const c = cause as { data?: { error?: { code?: string } } }
        error.value = c?.data?.error?.code || 'FT_SERVICE_UNAVAILABLE'
      }
    } finally { if (run === generation) pending.value = false }
  }
  function foreground() { if (document.visibilityState === 'visible') void refresh() }
  watch(() => auth.session.value, () => { session.value = null; if (mounted) void refresh() })
  onMounted(() => {
    mounted = true
    void auth.load().then(refresh).catch(() => { session.value = null; error.value = 'FT_HOST_AUTH_UNAVAILABLE' })
    timer = setInterval(foreground, 30000)
    document.addEventListener('visibilitychange', foreground)
    window.addEventListener('focus', foreground)
    window.addEventListener('ft-usage-changed', refresh)
  })
  onBeforeUnmount(() => {
    mounted = false; ++generation; controller?.abort()
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', foreground)
    window.removeEventListener('focus', foreground)
    window.removeEventListener('ft-usage-changed', refresh)
  })
  return { session, pending, error, refresh, auth }
}
