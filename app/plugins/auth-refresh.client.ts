const REFRESH_INTERVAL_MS = 4 * 60 * 1000

export default defineNuxtPlugin(() => {
  const auth = useAuthSession()
  let inFlight = false
  const refresh = async (): Promise<void> => {
    if (inFlight || document.visibilityState !== 'visible' || !auth.session.value.authenticated) return
    inFlight = true
    try { await auth.refresh() }
    catch { /* Session state is normalized by the composable on authorization failures. */ }
    finally { inFlight = false }
  }
  const interval = window.setInterval(() => { void refresh() }, REFRESH_INTERVAL_MS)
  const onVisibility = (): void => { if (document.visibilityState === 'visible') void refresh() }
  document.addEventListener('visibilitychange', onVisibility)
  return { provide: { disposeAuthRefresh: () => {
    window.clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisibility)
  } } }
})
