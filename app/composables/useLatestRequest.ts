import { onBeforeUnmount } from 'vue'

/** Keep one independent stream of reads current, including after component disposal. */
export function useLatestRequest() {
  let version = 0
  let disposed = false
  function invalidate(): void { version++ }
  function start(): () => boolean {
    const current = ++version
    return () => !disposed && current === version
  }
  onBeforeUnmount(() => { disposed = true; invalidate() })
  return { start, invalidate }
}
