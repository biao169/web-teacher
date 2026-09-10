// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useAdminEditorLifecycle } from '../../app/composables/useAdminEditorLifecycle'
import Shell from '../../app/components/admin/shared/AdminEditorShell.vue'

const confirm = vi.spyOn(ElMessageBox, 'confirm')
let app: App | undefined
let router: Router
let editor: ReturnType<typeof useAdminEditorLifecycle>
const dirty = ref(false)
const externalBusy = ref(false)
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function mountEditor() {
  const component = defineComponent({ setup() {
    editor = useAdminEditorLifecycle({ dirty: () => dirty.value, busy: () => externalBusy.value })
    return () => h('input', { value: dirty.value ? 'unsaved' : 'saved' })
  } })
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/admin/:module/:uid?', component },
    { path: '/outside', component: { render: () => h('p', 'outside') } },
  ] })
  await router.push('/admin/news?edit=record-a&page=3&q=filtered')
  app = createApp({ render: () => h(RouterView) }).use(router)
  app.mount(document.body.appendChild(document.createElement('div')))
  await nextTick()
}
beforeEach(() => { dirty.value = false; externalBusy.value = false; confirm.mockReset(); confirm.mockResolvedValue('confirm') })
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren() })

describe('shared editor navigation and persistence lifecycle', () => {
  it('cancelling a same-page object switch preserves the URL and dirty form', async () => {
    await mountEditor(); dirty.value = true; confirm.mockRejectedValue('cancel')
    await router.replace('/admin/news?edit=record-b&page=3&q=filtered')
    expect(router.currentRoute.value.query.edit).toBe('record-a')
    expect(dirty.value).toBe(true)
    expect(confirm).toHaveBeenCalledTimes(1)
  })
  it('confirms returning once and keeps the list page and filters', async () => {
    await mountEditor(); dirty.value = true
    await router.replace({ query: { ...router.currentRoute.value.query, edit: undefined } })
    expect(router.currentRoute.value.query).toEqual({ page: '3', q: 'filtered' })
    expect(confirm).toHaveBeenCalledTimes(1)
  })
  it('guards path changes and tab switches, but allows list-query normalization', async () => {
    await mountEditor(); dirty.value = true; confirm.mockRejectedValue('cancel')
    await router.replace({ query: { ...router.currentRoute.value.query, pageSize: '20' } })
    expect(confirm).not.toHaveBeenCalled()
    await router.push('/admin/students/student-b')
    await router.push('/admin/news?tab=roles')
    await router.push('/outside')
    expect(router.currentRoute.value.path).toBe('/admin/news')
    expect(confirm).toHaveBeenCalledTimes(3)
  })
  it('locks before a request or delete confirmation and blocks navigation even on a clean form', async () => {
    await mountEditor()
    const pending = deferred(); const duplicate = vi.fn()
    const first = editor.run(() => pending.promise)
    expect(editor.busy.value).toBe(true)
    await editor.run(duplicate)
    await router.push('/outside')
    expect(duplicate).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/admin/news')
    expect(confirm).not.toHaveBeenCalled()
    pending.resolve(); await first
    expect(editor.busy.value).toBe(false)
  })
  it('releases a failed operation without clearing the draft or granting navigation', async () => {
    await mountEditor(); dirty.value = true
    await expect(editor.run(async () => { throw new Error('version conflict') })).rejects.toThrow('version conflict')
    expect(dirty.value).toBe(true)
    expect(editor.busy.value).toBe(false)
    confirm.mockRejectedValue('cancel'); await router.push('/outside')
    expect(router.currentRoute.value.path).toBe('/admin/news')
  })
  it('allows save-and-return only after the successful write marks the form clean', async () => {
    await mountEditor(); dirty.value = true
    await editor.run(async () => {
      dirty.value = false; editor.commit()
      await router.replace({ query: { ...router.currentRoute.value.query, edit: undefined } })
    })
    expect(router.currentRoute.value.query.edit).toBeUndefined()
    expect(confirm).not.toHaveBeenCalled()
    dirty.value = true; confirm.mockRejectedValue('cancel')
    await router.push('/outside')
    expect(router.currentRoute.value.path).toBe('/admin/news')
  })
  it('blocks save while the rich-text media tool is working', async () => {
    await mountEditor(); externalBusy.value = true
    const write = vi.fn(); await editor.run(write)
    expect(write).not.toHaveBeenCalled()
  })
  it('shares one discard dialog and suppresses a save while navigation confirmation is pending', async () => {
    await mountEditor(); dirty.value = true
    const answer = deferred<'confirm'>(); confirm.mockReturnValue(answer.promise)
    const one = editor.confirmDiscard(); const two = editor.confirmDiscard()
    const write = vi.fn(); await editor.run(write)
    expect(confirm).toHaveBeenCalledTimes(1); expect(write).not.toHaveBeenCalled()
    answer.reject('close'); expect(await one).toBe(false); expect(await two).toBe(false)
  })
  it('expires stale record loads and removes unload protection when unmounted', async () => {
    await mountEditor()
    const old = editor.startLoad(); const latest = editor.startLoad()
    expect(old()).toBe(false); expect(latest()).toBe(true)
    dirty.value = true
    const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    app!.unmount(); app = undefined
    expect(latest()).toBe(false)
    const after = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })
})

describe('editor shell interaction boundary', () => {
  it('freezes fields, back and save shortcuts while an operation is pending, then unlocks', async () => {
    const busy = ref(true); const save = vi.fn(); const back = vi.fn()
    app = createApp({ render: () => h(Shell, { title: '编辑记录', busy: busy.value, onSave: save, onBack: back }, {
      default: () => h('input', { id: 'editor-input' }),
      'danger-actions': () => h('button', '删除'),
    }) })
    app.component('AdminPageHeader', { render: () => h('header') })
    app.mount(document.body.appendChild(document.createElement('div')))
    const boundary = document.querySelector('fieldset')!
    expect(boundary.disabled).toBe(true); expect(boundary.hasAttribute('inert')).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    expect(save).not.toHaveBeenCalled()
    for (const button of document.querySelectorAll<HTMLButtonElement>('footer .el-button')) expect(button.disabled).toBe(true)
    busy.value = false; await nextTick()
    expect(boundary.disabled).toBe(false); expect(boundary.hasAttribute('inert')).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }))
    expect(save).toHaveBeenCalledTimes(1)
  })
})
