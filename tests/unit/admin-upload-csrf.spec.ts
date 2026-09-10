import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAdminMediaUpload } from '../../app/composables/useAdminMediaUpload'

const csrfTokenForWrite = vi.hoisted(() => vi.fn())
vi.mock('../../app/composables/useCompleteAdminApi', () => ({ useCompleteAdminApi: () => ({ csrfTokenForWrite }) }))
afterEach(() => { vi.unstubAllGlobals(); csrfTokenForWrite.mockReset() })

describe('media upload authentication readiness', () => {
  it('waits for the shared CSRF refresh before starting a binary upload', async () => {
    let resolve!: (value: string) => void
    csrfTokenForWrite.mockReturnValue(new Promise<string>(done => { resolve = done }))
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ media: { objectKey: 'image.png' } }) }); vi.stubGlobal('fetch', fetch)
    const file = new File(['png'], 'image.png', { type: 'image/png' })
    const task = useAdminMediaUpload().uploadAdminMedia(file, { uid: 'media:test' })
    expect(fetch).not.toHaveBeenCalled()
    resolve('unit-test-csrf'); await task
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: file, headers: { 'content-type': 'image/png', 'x-csrf-token': 'unit-test-csrf' } }))
  })
  it('does not send an upload if the shared refresh cannot supply a CSRF token', async () => {
    csrfTokenForWrite.mockResolvedValue(''); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(useAdminMediaUpload().uploadAdminMedia(new File(['pdf'], 'a.pdf'), { uid: 'media:test' })).rejects.toThrow('安全令牌缺失')
    expect(fetch).not.toHaveBeenCalled()
  })
})
