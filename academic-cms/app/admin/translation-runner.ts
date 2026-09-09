export interface TranslationScanPage {
  scanned: number; needed: number; refreshed: number; invalidated: number; suppressed: number
  truncated: boolean; nextCursor?: unknown; state?: { status?: string }
}
export interface TranslationRunPage {
  processed?: number; completed?: number; failed?: number; stale?: number; status?: string
  continuation?: { remaining: number; nextRunAt: string | null }
  failures?: Array<{ provider: string | null; code: string; message: string; count: number }>
}
export interface TranslationProgress {
  phase: 'scan' | 'translate' | 'waiting'; scanned: number; batches: number; completed: number; stale: number; nextRunAt: string | null
}
function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve()
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, milliseconds)
    signal.addEventListener('abort', finish, { once: true })
  })
}
/** One request at a time. Stopping lets the in-flight batch commit, then stops scheduling. */
export async function runTranslationQueue(options: {
  signal: AbortSignal
  scan: (cursor?: unknown) => Promise<TranslationScanPage>
  run: () => Promise<TranslationRunPage>
  progress: (value: TranslationProgress, result?: TranslationRunPage) => void
  refresh: () => Promise<unknown>
}): Promise<'completed' | 'failed' | 'paused' | 'stopped'> {
  const progress: TranslationProgress = { phase: 'scan', scanned: 0, batches: 0, completed: 0, stale: 0, nextRunAt: null }
  let cursor: unknown
  do {
    if (options.signal.aborted) return 'stopped'
    options.progress({ ...progress })
    const page = await options.scan(cursor)
    progress.scanned += page.scanned
    if (options.signal.aborted) return 'stopped'
    if (page.state?.status === 'paused') return 'paused'
    const next = page.nextCursor
    if (page.truncated && (!next || JSON.stringify(next) === JSON.stringify(cursor))) throw new Error('扫描游标未前进，已停止自动运行。')
    cursor = next
  } while (cursor)
  await options.refresh()
  while (!options.signal.aborted) {
    progress.phase = 'translate'; progress.nextRunAt = null; options.progress({ ...progress })
    const result = await options.run()
    progress.batches++; progress.completed += result.completed ?? 0; progress.stale += result.stale ?? 0
    options.progress({ ...progress }, result)
    if (options.signal.aborted) return 'stopped'
    await options.refresh()
    if (result.status === 'paused') return 'paused'
    if (!result.continuation) throw new Error('服务端未返回队列进度，请刷新页面后重试。')
    if (result.continuation.remaining === 0) return result.status === 'failed' || progress.stale > 0 ? 'failed' : 'completed'
    const next = result.continuation.nextRunAt
    if (next && Date.parse(next) > Date.now()) {
      progress.phase = 'waiting'; progress.nextRunAt = next; options.progress({ ...progress })
      await wait(Math.min(2_147_483_647, Date.parse(next) - Date.now()), options.signal)
    } else if (!result.processed) throw new Error('队列暂时无法前进，已停止自动运行；请刷新后核对失败原因或其他管理员正在执行的任务。')
  }
  return 'stopped'
}
