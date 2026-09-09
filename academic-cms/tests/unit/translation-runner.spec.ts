import { describe, expect, it, vi } from 'vitest'
import { runTranslationQueue } from '../../app/admin/translation-runner'
const scanPage = { scanned: 10, needed: 10, refreshed: 0, invalidated: 0, suppressed: 0, truncated: false, nextCursor: null }
describe('sequential automatic translation', () => {
  it('finishes every scan page before consuming the complete queue', async () => {
    const order: string[] = []
    const scan = vi.fn().mockImplementationOnce(async () => { order.push('scan1'); return { ...scanPage, truncated: true, nextCursor: { entity: 1 } } }).mockImplementationOnce(async () => { order.push('scan2'); return scanPage })
    const run = vi.fn().mockImplementationOnce(async () => { order.push('run1'); return { processed: 1, completed: 1, continuation: { remaining: 1, nextRunAt: null } } }).mockImplementationOnce(async () => { order.push('run2'); return { processed: 1, completed: 1, status: 'completed', continuation: { remaining: 0, nextRunAt: null } } })
    expect(await runTranslationQueue({ signal: new AbortController().signal, scan, run, progress: vi.fn(), refresh: vi.fn() })).toBe('completed')
    expect(order).toEqual(['scan1', 'scan2', 'run1', 'run2'])
    expect(scan.mock.calls[1]).toEqual([{ entity: 1 }])
  })
  it('stops after the in-flight batch and never starts another request', async () => {
    const controller = new AbortController()
    const run = vi.fn(async () => { controller.abort(); return { processed: 1, completed: 1, continuation: { remaining: 20, nextRunAt: null } } })
    expect(await runTranslationQueue({ signal: controller.signal, scan: async () => scanPage, run, progress: vi.fn(), refresh: vi.fn() })).toBe('stopped')
    expect(run).toHaveBeenCalledOnce()
  })
  it('waits for the server retry deadline and can stop immediately while waiting', async () => {
    const controller = new AbortController()
    const run = vi.fn(async () => ({ processed: 0, continuation: { remaining: 1, nextRunAt: new Date(Date.now() + 60_000).toISOString() } }))
    expect(await runTranslationQueue({ signal: controller.signal, scan: async () => scanPage, run, progress: value => { if (value.phase === 'waiting') controller.abort() }, refresh: vi.fn() })).toBe('stopped')
    expect(run).toHaveBeenCalledOnce()
  })
})
