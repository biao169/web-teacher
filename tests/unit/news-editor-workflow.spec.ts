// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App, type Slots } from 'vue'
import { ElMessageBox } from 'element-plus'
import { RESOURCE_CATALOG } from '../../shared/complete-admin/core.mjs'
import type { CompleteResourceSchema } from '../../app/admin/complete-resource'
import RecordEditor from '../../app/components/admin/complete/AdminCompleteRecordEditor.vue'

const harness = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../app/composables/useCompleteAdminApi', () => ({ useCompleteAdminApi: () => ({ request: harness.request }) }))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn() }))
vi.mock('../../app/components/admin/shared/AdminEditorShell.vue', async () => {
  const { h } = await import('vue')
  return { default: { props: ['busy', 'saveDisabled'], emits: ['save', 'save-and-return'], setup: (props: { busy?: boolean; saveDisabled?: boolean }, { slots, emit }: { slots: Slots; emit: (event: string) => void }) => () => h('section', [
    slots.default?.(), slots['danger-actions']?.(),
    h('button', { 'data-save': '', disabled: props.busy || props.saveDisabled, onClick: () => emit('save') }, '保存'),
    h('button', { 'data-save-return': '', disabled: props.busy || props.saveDisabled, onClick: () => emit('save-and-return') }, '保存并返回'),
  ]) } }
})
vi.mock('../../app/components/admin/shared/AdminCheckedFormItem.vue', async () => {
  const { h } = await import('vue')
  return { default: { props: ['label', 'error'], setup: (props: any, { slots }: any) => () => h('div', [h('label', props.label), slots.default?.(), h('small', { class: 'field-error' }, props.error)]) } }
})
vi.mock('../../app/components/admin/shared/AdminIdentitySection.vue', () => ({ default: { render: () => null } }))
vi.mock('../../app/components/admin/shared/AdminFieldRenderer.vue', async () => {
  const { h } = await import('vue')
  return { default: { props: ['modelValue', 'descriptor'], emits: ['update:modelValue'], setup: (props: any, { emit }: any) => () => h(props.descriptor.key === 'content' ? 'textarea' : 'input', { 'data-field': props.descriptor.key, value: props.modelValue ?? '', onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value) }) } }
})

let app: App | undefined
let host: HTMLDivElement
const opened = vi.fn()
const saved = vi.fn()
const back = vi.fn()
const confirmDelete = vi.spyOn(ElMessageBox, 'confirm')
async function settle() { for (let index = 0; index < 5; index++) { await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)) } }
async function mount(uid?: string, canEditNews = true, canDelete = false) {
  host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => h(RecordEditor, { resource: RESOURCE_CATALOG.news as CompleteResourceSchema, uid, canEditNews, canDelete, onOpenRichText: opened, onSaved: saved, onBack: back }) })
  app.mount(host)
  await settle()
}
async function fill(field: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`[data-field="${field}"]`)!
  input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await settle()
}
async function openTool() {
  const button = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('富文本'))!
  button.click(); await settle()
}
const record = { uid: 'news:existing', title: '原标题', slug: 'existing', content: '原正文', content_format: 'plain', visibility: 'hidden', updated_at: '2026-09-05T00:00:00.000Z' }
beforeEach(() => {
  harness.request.mockReset(); opened.mockReset(); saved.mockReset(); back.mockReset(); confirmDelete.mockReset(); confirmDelete.mockResolvedValue('confirm')
  Element.prototype.scrollIntoView = vi.fn()
  harness.request.mockImplementation(async (_url: string, options?: any) => ({ record: options?.method ? { ...record, ...options.body, uid: options.body.uid || record.uid } : record }))
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren() })

describe('news record → rich-text handoff', () => {
  it('opens an existing clean record without a redundant save', async () => {
    await mount(record.uid); await openTool()
    expect(opened).toHaveBeenCalledWith(record.uid)
    expect(harness.request).toHaveBeenCalledTimes(1)
    expect(saved).not.toHaveBeenCalled()
  })
  it('saves edits with concurrency protection before opening, without starting a list refresh', async () => {
    await mount(record.uid); await fill('title', '新标题'); await openTool()
    expect(harness.request).toHaveBeenLastCalledWith(expect.stringContaining(encodeURIComponent(record.uid)), { method: 'PATCH', body: { title: '新标题', expectedUpdatedAt: record.updated_at } })
    expect(opened).toHaveBeenCalledWith(record.uid)
    expect(saved).not.toHaveBeenCalled()
  })
  it('validates a new record, then creates a hidden draft and opens its returned UID', async () => {
    await mount(); await openTool()
    expect(harness.request).not.toHaveBeenCalled()
    expect(opened).not.toHaveBeenCalled()
    await fill('title', '新建新闻'); await fill('slug', 'new-news'); await fill('content', '第一行\n第二行'); await openTool()
    const body = harness.request.mock.lastCall?.[1].body
    expect(body).toMatchObject({ title: '新建新闻', slug: 'new-news', content: '第一行\n第二行', content_format: 'plain', visibility: 'hidden' })
    expect(opened).toHaveBeenCalledWith(body.uid)
  })
  it('retains input when saving fails, and does not open the tool', async () => {
    await mount(record.uid); await fill('title', '不能丢失')
    harness.request.mockRejectedValueOnce({ data: { error: { message: '保存冲突', code: 'CONFLICT' } } })
    await openTool()
    expect(opened).not.toHaveBeenCalled()
    expect(host.querySelector<HTMLInputElement>('[data-field="title"]')!.value).toBe('不能丢失')
    expect(host.textContent).toContain('保存冲突')
  })
  it('opens existing HTML without exposing it to the ordinary content writer', async () => {
    harness.request.mockResolvedValue({ record: { ...record, content_format: 'html', content: '<p class="rich-align-center">正文</p>' } })
    await mount(record.uid); await openTool()
    expect(opened).toHaveBeenCalledWith(record.uid)
    expect(host.querySelector('[data-field="content"]')).toBeNull()
    expect(harness.request).toHaveBeenCalledTimes(1)
  })
  it('does not save or navigate when the account cannot edit news', async () => {
    await mount(record.uid, false); await openTool()
    expect(opened).not.toHaveBeenCalled()
    expect(harness.request).toHaveBeenCalledTimes(1)
  })
})

describe('record save completion and mutual exclusion', () => {
  it('emits one save-and-return completion without an overlapping back event', async () => {
    await mount(record.uid); await fill('title', '已更新标题')
    host.querySelector<HTMLButtonElement>('[data-save-return]')!.click(); await settle()
    expect(saved).toHaveBeenCalledTimes(1)
    expect(saved).toHaveBeenCalledWith(record.uid, true)
    expect(back).not.toHaveBeenCalled()
  })
  it('prevents rapid saves and delete from running together before the UI rerenders', async () => {
    await mount(record.uid, true, true); await fill('title', '进行中的保存')
    let resolve!: (result: { record: typeof record }) => void
    harness.request.mockImplementationOnce(() => new Promise(yes => { resolve = yes }))
    const saveButton = host.querySelector<HTMLButtonElement>('[data-save]')!
    saveButton.click(); saveButton.click()
    const remove = [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === '删除')!
    expect(remove).toBeDefined(); remove.click(); await settle()
    expect(harness.request).toHaveBeenCalledTimes(2)
    expect(confirmDelete).not.toHaveBeenCalled()
    resolve({ record: { ...record, title: '进行中的保存' } }); await settle()
    expect(saved).toHaveBeenCalledTimes(1)
  })
})
