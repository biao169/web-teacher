// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, type App } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import Preview from '../../app/components/admin/shared/AdminMediaPreview.vue'
import Picker from '../../app/components/admin/complete/AdminCompleteMediaPicker.vue'
import Workspace from '../../app/components/admin/complete/AdminCompleteMediaWorkspace.vue'
import type { AdminMediaList, AdminMediaRow } from '../../app/admin/media'
import type { AdminUploadedMedia } from '../../app/admin/media-upload'

const api = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn() }))
vi.mock('../../app/composables/useCompleteAdminApi', () => ({ useCompleteAdminApi: () => ({ request: api.request }) }))
vi.mock('../../app/composables/useAdminMediaUpload', () => ({ useAdminMediaUpload: () => ({ uploadAdminMedia: api.upload }) }))
vi.mock('../../app/composables/useAuthSession', () => ({ useAuthSession: () => ({ session: { value: { authenticated: true, user: {
  uid: 'admin:test', role: { uid: 'role:owner', level: 1000 }, permissions: { media_assets: { view: true, create: true, edit: true, delete: true } },
} } } }) }))
vi.mock('#app/composables/router', async () => {
  const { useRoute, useRouter } = await import('vue-router')
  return { useRoute, useRouter }
})
vi.mock('#app/components/nuxt-link', async () => ({ default: (await import('vue-router')).RouterLink }))
vi.mock('../../app/components/admin/shared/AdminCheckedFormItem.vue', () => ({ default: { render: () => null } }))

let app: App | undefined
let host: HTMLDivElement
const selected = vi.fn()
const row = (uid: string): AdminMediaRow => ({ uid, object_key: `${uid}.png`, title: uid, mime_type: 'image/png', category: 'admin', status: 'active', storage_kind: 'local', size: 12, updated_at: '2026-09-06T00:00:00Z' })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function settle() { for (let i = 0; i < 6; i++) { await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)) } }
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label)!
async function mount(component: typeof Preview | typeof Picker | typeof Workspace, props: Record<string, unknown> = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/media', component: { render: () => h(component, props) } }] })
  await router.push('/admin/media')
  host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => h(RouterView) }).use(router)
  app.component('AdminPageHeader', { render: () => h('header') })
  app.directive('loading', {})
  app.mount(host); await settle()
}
beforeEach(() => {
  api.request.mockReset(); api.upload.mockReset(); selected.mockReset()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  Element.prototype.scrollIntoView = vi.fn()
  api.request.mockImplementation(async (url: string) => {
    if (url.endsWith('/previews')) return { items: [] }
    if (url.endsWith('/usage-summary')) return { items: [] }
    if (url.endsWith('/stats')) return { totals: { total: 0, active: 0, trash: 0, bytes: 0 }, categories: [], policy: { effectiveMaxMb: 20, allowedExtensions: ['pdf', 'png'], trashRetentionDays: 30 } }
    return { rows: [], total: 0 }
  })
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); vi.restoreAllMocks() })

describe('media preview source transitions', () => {
  it('ignores a late response for the previous object key', async () => {
    const old = deferred<unknown>()
    api.request.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ items: [{ view: { available: true, url: '/new.png', mimeType: 'image/png' } }] })
    const props = reactive({ objectKey: 'old.png' }); await mount(Preview, props)
    props.objectKey = 'new.png'; await settle()
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/new.png')
    old.resolve({ items: [{ view: { available: true, url: '/old.png', mimeType: 'image/png' } }] }); await settle()
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/new.png')
  })
  it('resolves the managed object after a temporary local file is removed', async () => {
    api.request.mockResolvedValue({ items: [{ view: { available: true, url: '/managed.png', mimeType: 'image/png' } }] })
    const props = reactive<{ objectKey: string; file: File | null }>({ objectKey: 'managed.png', file: new File(['png'], 'local.png', { type: 'image/png' }) })
    await mount(Preview, props)
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:local-preview')
    expect(api.request).not.toHaveBeenCalled()
    props.file = null; await settle()
    expect(api.request).toHaveBeenCalledTimes(1)
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/managed.png')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview')
  })
  it('clears obsolete loading state when switching to a supplied URL, and supports retry', async () => {
    const pending = deferred<unknown>(); api.request.mockReturnValue(pending.promise)
    const props = reactive({ objectKey: 'old.png', src: '', mimeType: 'image/png' }); await mount(Preview, props)
    expect(host.textContent).toContain('载入中')
    props.src = '/direct.png'; await settle()
    host.querySelector('img')!.dispatchEvent(new Event('error')); await settle()
    expect(host.textContent).not.toContain('载入中')
    expect(button('重新载入').disabled).toBe(false)
    button('重新载入').click(); await settle()
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/direct.png')
    pending.reject(new Error('old failure')); await settle()
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/direct.png')
  })
})

describe('media picker and library request ordering', () => {
  it('keeps a read-only media field from opening the picker or starting requests', async () => {
    await mount(Picker, { disabled: true })
    expect(button('选择媒体').disabled).toBe(true)
    button('选择媒体').click(); await settle()
    expect(document.querySelector('.admin-media-grid')).toBeNull()
    expect(api.request).not.toHaveBeenCalled()
    expect(api.upload).not.toHaveBeenCalled()
  })
  it('keeps the latest search results when the first search finishes last', async () => {
    const first = deferred<AdminMediaList>()
    api.request.mockReturnValueOnce(first.promise)
    await mount(Picker); button('选择媒体').click(); await settle()
    api.request.mockResolvedValueOnce({ rows: [row('new-result')], total: 1 })
    const search = document.querySelector<HTMLInputElement>('.admin-media-toolbar input')!
    search.value = 'new'; search.dispatchEvent(new Event('input', { bubbles: true }))
    search.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })); await settle()
    expect(document.querySelector('.admin-media-grid')?.textContent).toContain('new-result')
    first.resolve({ rows: [row('old-result')], total: 1 }); await settle()
    expect(document.querySelector('.admin-media-grid')?.textContent).not.toContain('old-result')
  })
  it('keeps a new upload visible despite an old list response and locks close while uploading', async () => {
    const first = deferred<AdminMediaList>(); const upload = deferred<AdminUploadedMedia>()
    api.request.mockReturnValueOnce(first.promise); api.upload.mockReturnValue(upload.promise)
    await mount(Picker, { onSelected: selected }); button('选择媒体').click(); await settle()
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { value: [new File(['%PDF'], 'new.pdf', { type: 'application/pdf' })] })
    input.dispatchEvent(new Event('change')); await settle()
    expect(button('关闭').disabled).toBe(true)
    expect(button('搜索').disabled).toBe(true)
    upload.resolve({ uid: 'media:uploaded', objectKey: 'new.pdf', title: 'new.pdf', category: 'admin', mimeType: 'application/pdf', size: 4, storageKind: 'local', status: 'active', checksum: 'fixture', updatedAt: '2026-09-06T00:00:00Z' }); await settle()
    expect(selected).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.admin-media-grid')?.textContent).toContain('new.pdf')
    first.resolve({ rows: [], total: 0 }); await settle()
    expect(document.querySelector('.admin-media-grid')?.textContent).toContain('new.pdf')
    expect(button('关闭').disabled).toBe(false)
  })
  it('ignores obsolete library results and never enables recycling for an unreported usage count', async () => {
    const old = deferred<AdminMediaList>(); api.request.mockReturnValueOnce(old.promise)
    await mount(Workspace)
    api.request.mockResolvedValueOnce({ rows: [row('current-media')], total: 1 })
    button('搜索').click(); await settle()
    expect(host.querySelector('[data-media-edit-uid="current-media"]')).not.toBeNull()
    expect(button('移入回收站').disabled).toBe(true)
    old.resolve({ rows: [row('obsolete-media')], total: 1 }); await settle()
    expect(host.querySelector('[data-media-edit-uid="current-media"]')).not.toBeNull()
    expect(host.querySelector('[data-media-edit-uid="obsolete-media"]')).toBeNull()
  })
})
