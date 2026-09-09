// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import AuthWorkspace from '../../app/components/admin/complete/AdminCompleteAuthWorkspace.vue'
import MediaWorkspace from '../../app/components/admin/complete/AdminCompleteMediaWorkspace.vue'
import TranslationWorkspace from '../../app/components/admin/complete/AdminCompleteTranslationWorkspace.vue'

const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../app/composables/useCompleteAdminApi', () => ({ useCompleteAdminApi: () => ({ request: api.request }) }))
vi.mock('#app/components/nuxt-link', async () => ({ default: (await import('vue-router')).RouterLink }))
vi.mock('#app/composables/router', async () => {
  const { useRoute, useRouter } = await import('vue-router')
  return { useRoute, useRouter }
})
vi.mock('../../app/composables/useAuthSession', () => ({ useAuthSession: () => ({ session: { value: {
  authenticated: true, user: { uid: 'admin:owner', role: { uid: 'role:owner', level: 1000 }, permissions: {
    auth: { view: true, create: true, edit: true, delete: true },
    news: { view: true, create: true, edit: true, delete: true, export: true },
    media_assets: { view: true, create: true, edit: true, delete: true },
    translation_cache: { view: true, edit: true },
  } },
} } }) }))
vi.mock('../../app/components/admin/shared/AdminIdentitySection.vue', () => ({ default: { render: () => null } }))
vi.mock('../../app/components/admin/complete/AdminCompleteSuggestionField.vue', () => ({ default: { render: () => null } }))

const confirmation = vi.spyOn(ElMessageBox, 'confirm')
let app: App | undefined
let router: Router
let host: HTMLDivElement
const stamp = '2026-09-06T00:00:00.000Z'
const latestStamp = '2026-09-06T01:00:00.000Z'
const media = { uid: 'media:a', title: '原媒体标题', category: 'news', status: 'active', updated_at: stamp, mime_type: 'application/pdf', object_key: 'paper.pdf', size: 32, storage_kind: 'local' }
const translation = { uid: 'translation:a', source_text: '中文', translated_text: 'Original translation', updated_at: stamp, is_current: 1, is_manual: 1, status: 'success', source_refs: '[]' }
let rejectWrite = true
let latest = false
type WriteOptions = { method?: string; body?: Record<string, unknown> }
async function settle() { for (let i = 0; i < 6; i++) { await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)) } }
function calls(method: string) { return api.request.mock.calls.filter(([, options]) => (options as WriteOptions | undefined)?.method === method) }
function button(label: string) { return [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label)! }
async function fill(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector)!
  expect(input).not.toBeNull(); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await settle()
}
async function mount(kind: 'media' | 'translation' | 'auth') {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/:module', component: kind === 'auth' ? AuthWorkspace : kind === 'media' ? MediaWorkspace : TranslationWorkspace }, { path: '/:pathMatch(.*)*', component: { render: () => null } }] })
  await router.push(kind === 'auth' ? '/admin/auth?tab=permissions' : `/admin/${kind}?edit=${kind}:a&page=4&q=kept`)
  host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => h(RouterView) }).use(router)
  app.component('AdminPageHeader', { render: () => h('header') })
  app.directive('loading', {})
  app.component('SharedMedia', { render: () => null })
  app.mount(host); await settle()
}
beforeEach(() => {
  latest = false; rejectWrite = true; api.request.mockReset(); confirmation.mockReset(); confirmation.mockResolvedValue('confirm')
  api.request.mockImplementation(async (url: string, options?: WriteOptions) => {
    if (url.endsWith('/auth/overview')) return {
      users: [], roles: [{ uid: 'role:a', name: '管理角色', level: 10, is_active: 1, is_system: 0, updated_at: latest ? latestStamp : stamp, user_count: 0 }],
      modules: [{ key: 'news', title: '新闻', description: '' }],
      permissions: [{ role_uid: 'role:a', module: 'news', can_view: 1, can_edit: latest ? 1 : 0 }], metrics: {},
    }
    if (options?.method === 'PUT') {
      if (rejectWrite) throw { data: { error: { code: 'AUTH_CONFLICT', message: '权限版本冲突' } } }
      latest = true
      return { updated: 1, roleUpdatedAt: latestStamp }
    }
    if (options?.method === 'PATCH') {
      if (rejectWrite) throw { data: { error: { code: url.includes('/translation/') ? 'TRANSLATION_EDIT_CONFLICT' : 'SQL_EXPECTED_CHANGES', message: '记录已被其他管理员更新' } } }
      if (url.includes('/translation/')) return { record: { ...translation, translated_text: options.body?.translatedText, updated_at: latestStamp } }
      return { ...options.body, updatedAt: latestStamp }
    }
    if (url.endsWith('/translation/overview')) return { state: {}, totals: {} }
    if (url.endsWith('/resource/translation')) return { rows: [translation], total: 1 }
    if (url.includes('/resource/translation/')) return { record: { ...translation, ...(latest ? { translated_text: 'Latest server translation', updated_at: latestStamp } : {}) } }
    if (url.includes('/resource/media/')) return { record: { ...media, ...(latest ? { title: '服务器新标题', updated_at: latestStamp } : {}) } }
    if (url.endsWith('/media')) return { rows: [media], total: 1 }
    if (url.endsWith('/media/usage-summary')) return { items: [{ uid: media.uid, total: 1 }] }
    if (url.endsWith('/media/previews')) return { items: [] }
    if (url.endsWith('/media/stats')) return { categories: [], policy: { allowedExtensions: [] } }
    throw new Error(`Unexpected API: ${url}`)
  })
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren() })

// These multi-step Element Plus workflows render full workspaces in happy-dom.
// Keep all assertions; allow bounded headroom beyond the default 5s on shared CI.
describe('specialist editor concurrency recovery', { timeout: 15000 }, () => {
  it.each(['media', 'translation'] as const)('%s keeps local input and the old version until explicit reload', async kind => {
    await mount(kind)
    const selector = kind === 'media' ? '#media-editor-info input' : '#manual-translation'
    await fill(selector, 'My pending changes')
    button('保存').click(); await settle()
    expect(calls('PATCH')).toHaveLength(1)
    expect((calls('PATCH')[0]![1] as WriteOptions).body?.expectedUpdatedAt).toBe(stamp)
    expect(host.querySelector<HTMLInputElement>(selector)!.value).toBe('My pending changes')
    expect(button('保存').disabled).toBe(true)
    const beforeReload = api.request.mock.calls.length
    confirmation.mockRejectedValueOnce('close')
    button('加载最新版本').click(); await settle()
    expect(api.request.mock.calls.length).toBe(beforeReload)
    expect(host.querySelector<HTMLInputElement>(selector)!.value).toBe('My pending changes')
    latest = true
    button('加载最新版本').click(); await settle()
    expect(host.querySelector<HTMLInputElement>(selector)!.value).toBe(kind === 'media' ? '服务器新标题' : 'Latest server translation')
    await fill(selector, 'Reconciled changes'); rejectWrite = false
    button('保存并返回').click(); await settle()
    expect(calls('PATCH')).toHaveLength(2)
    expect((calls('PATCH')[1]![1] as WriteOptions).body?.expectedUpdatedAt).toBe(latestStamp)
    expect(router.currentRoute.value.query).toEqual({ page: '4', q: 'kept' })
    expect(confirmation).toHaveBeenCalledTimes(2)
  })
  it('keeps referenced media unavailable for recycling in the edit footer', async () => {
    await mount('media')
    expect(button('已被引用（1）').disabled).toBe(true)
    button('已被引用（1）').click(); await settle()
    expect(calls('PATCH')).toHaveLength(0)
  })
})

describe('permission matrix state', { timeout: 15000 }, () => {
  it('retains both the selected tab and permission edits when leaving is cancelled', async () => {
    await mount('auth')
    const edit = host.querySelectorAll<HTMLInputElement>('.permission-table tbody input[type="checkbox"]')[3]!
    expect(edit).toBeDefined(); edit.click(); await settle()
    expect(button('保存权限矩阵').disabled).toBe(false)
    confirmation.mockRejectedValueOnce('cancel')
    host.querySelector<HTMLButtonElement>('#tab-roles')!.click(); await settle()
    expect(router.currentRoute.value.query.tab).toBe('permissions')
    expect(host.querySelector('#tab-permissions')!.getAttribute('aria-selected')).toBe('true')
    expect(edit.checked).toBe(true)
    expect(confirmation).toHaveBeenCalledTimes(1)
    button('保存权限矩阵').click(); await settle()
    expect(calls('PUT')).toHaveLength(1)
    expect((calls('PUT')[0]![1] as WriteOptions).body?.expectedUpdatedAt).toBe(stamp)
    expect(button('保存权限矩阵').disabled).toBe(false)
    rejectWrite = false; button('保存权限矩阵').click(); await settle()
    expect(calls('PUT')).toHaveLength(2)
    expect((calls('PUT')[1]![1] as WriteOptions).body?.expectedUpdatedAt).toBe(stamp)
    expect(button('保存权限矩阵').disabled).toBe(true)
  })
})
