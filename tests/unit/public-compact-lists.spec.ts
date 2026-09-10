// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref, type App } from 'vue'
import RecordRow from '../../app/components/public/content/RecordRow.vue'
import ProjectsList from '../../app/components/public/content/ProjectsList.vue'
import FilterPanel from '../../app/components/public/content/FilterPanel.vue'
import FilterGroup from '../../app/components/public/content/FilterGroup.vue'
import { publicListHref, unpackPublicListQuery } from '../../shared/utils/public-list-link'
const state = vi.hoisted(() => ({ route: null as any, push: vi.fn(), fetch: vi.fn(), selection: null as any, citationStyle: null as any }))
vi.mock('#app/composables/state', () => ({ useState: (key: string) => key === 'public-selection:v1' ? state.selection : key === 'public-copy-numbers:v1' ? ref(false) : state.citationStyle }))
vi.mock('#build/fetch.mjs', () => ({ $fetch: state.fetch }))
vi.mock('#app/composables/router', () => ({ useRoute: () => state.route, useRouter: () => ({ push: state.push }) }))
vi.mock('#app/components/nuxt-link', async () => {
  const { h } = await import('vue')
  return { default: { props: ['to'], setup: (props: any, { slots }: any) => () => h('a', { href: props.to }, slots.default?.()) } }
})
let app: App | undefined
beforeEach(() => {
  state.citationStyle = ref('gbt')
  state.selection = ref({ publications: [], projects: [], patents: [], students: [], research: [], courses: [] })
  state.route = reactive({ path: '/zh/projects', fullPath: '/zh/projects?page=3&pageSize=24', query: { page: '3', pageSize: '24' }, hash: '#results' })
  state.push.mockReset(); state.fetch.mockReset(); state.fetch.mockResolvedValue({ options: group.options, page: 1, hasMore: false }); vi.stubGlobal('$fetch', state.fetch)
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })
async function settle() { for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve() } }
function key(element: Element, value: string) { element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })) }
function mount(render: () => any) { const host = document.createElement('div'); document.body.append(host); app = createApp({ setup: () => render }); app.mount(host); return host }
const group = { key: 'source', label: '来源', options: [{ value: '国家基金', label: '国家基金', count: 7, selected: true }] }
describe('compact list behavior', () => {
  it('retains the API display number, full summary text and title link with a small complete image', () => {
    const summary = 'A long biography. '.repeat(40)
    const host = mount(() => h(RecordRow, { uid: 'teacher-c', displayNumber: 3, title: 'Teacher', href: '/zh/team/teacher-c', summary, tags: ['SCI', 'SCI'], media: { available: false, kind: 'image', fallback: 'initials', alt: 'Teacher' }, portrait: true }))
    expect(host.querySelector('.public-record-number')?.textContent).toBe('3.')
    expect(host.querySelector('.public-compact-record__summary')?.textContent).toBe(summary)
    expect(host.querySelectorAll('.public-record-tags span')).toHaveLength(1)
    expect(host.querySelector('.public-compact-record__media.is-portrait')).not.toBeNull()
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/zh/team/teacher-c')
  })
  it('shows project funding before a plain project name and omits its summary and detail action', () => {
    const model: any = { schemaVersion: 1, locale: 'zh', module: 'projects', totalPublic: 8, revision: 'x', generatedAt: '', meta: { title: '项目', description: '', breadcrumbs: [] }, query: { search: null, filters: {} }, filters: [], pagination: { page: 1, pageSize: 12, totalItems: 1, totalPages: 1, from: 1, to: 1, previousPage: null, nextPage: null }, items: [{ uid: 'p', displayNumber: 6, name: '普通项目名称', source: '国家自然科学基金', fundName: '重点项目', projectNumber: 'P001', principal: '王老师', role: '主持', periodLabel: '2024–2026', status: '在研', summary: 'THIS MUST NOT APPEAR', href: '/zh/projects/p' }] }
    const host = mount(() => h(ProjectsList, { model }))
    const row = host.querySelector('.public-compact-record')!
    expect(row.querySelector('.public-project-funding')?.textContent).toBe('国家自然科学基金 · 重点项目')
    expect(row.querySelector('.public-project-name')?.tagName).toBe('P')
    expect(row.textContent).toContain('P001')
    expect(row.textContent).not.toContain('THIS MUST NOT APPEAR')
    expect(row.querySelector('a,h2')).toBeNull()
    expect(host.querySelector('.public-result-summary')?.textContent).toContain('全部公开 8 项 · 符合筛选 1 项')
  })
  it('resets the page when choosing a filter and retains page size, hash and ASCII encoding', async () => {
    const host = mount(() => h(FilterGroup, { group, locale: 'zh' }))
    host.querySelector<HTMLButtonElement>('.public-filter-trigger')!.click(); await settle()
    host.querySelectorAll<HTMLElement>('[role=option]')[1]!.click(); await settle()
    expect(state.push).toHaveBeenCalledWith(publicListHref('/zh/projects', state.route.query, { source: '国家基金', page: null }, '#results'))
    const url = new URL(state.push.mock.calls[0]![0], 'https://test.invalid')
    expect(url.href).toMatch(/^[\x20-\x7e]+$/)
    expect(unpackPublicListQuery(Object.fromEntries(url.searchParams))).toEqual({ pageSize: '24', source: '国家基金' })
  })
  it('restores the search input from query changes and preserves page size when clearing', async () => {
    const query = reactive({ search: '旧词' as string | null, filters: { source: '国家基金' } })
    const host = mount(() => h(FilterPanel, { query, filters: [group], pageSize: 24, locale: 'zh' }))
    query.search = '后退恢复'; await nextTick()
    expect(host.querySelector<HTMLInputElement>('#public-list-search')?.value).toBe('后退恢复')
    host.querySelector<HTMLButtonElement>('.public-filter-reset')!.click(); await settle()
    expect(state.push).toHaveBeenCalledWith('/zh/projects?pageSize=24#results')
  })
  it('discards stale candidate responses after navigation', async () => {
    let resolve: (value: any) => void = () => {}
    state.fetch.mockImplementation(() => new Promise(ok => { resolve = ok }))
    const host = mount(() => h(FilterGroup, { group, locale: 'zh' }))
    host.querySelector<HTMLButtonElement>('.public-filter-trigger')!.click(); await settle()
    expect(state.fetch).toHaveBeenCalledOnce()
    state.route.fullPath = '/zh/projects?year=2026'; await nextTick()
    resolve({ options: [{ value: 'STALE', label: 'STALE', count: 1 }], page: 1, hasMore: false })
    await Promise.resolve(); await nextTick()
    expect(host.textContent).not.toContain('STALE')
  })
})

describe('single row filter toolbar and paged dropdown', () => {
  it('shows every field immediately with one trigger, reset and page size, without loading options before opening', () => {
    const filters = ['year', 'source', 'status', 'role', 'fundName'].map(key => ({ key, label: key, options: [{ value: 'value', label: 'value', count: 1, selected: false }] }))
    const host = mount(() => h(FilterPanel, { query: { search: null, filters: {} }, filters, pageSize: 24, locale: 'en' }))
    expect([...host.querySelectorAll('.public-filter-trigger')].map(button => button.textContent)).toEqual(filters.map(item => item.label))
    expect(host.querySelectorAll('select')).toHaveLength(1)
    expect(host.querySelectorAll('details,.public-candidate-browser,.public-filter-mobile-toggle')).toHaveLength(0)
    expect(host.querySelectorAll('.public-filter-toolbar > .public-filter-dropdown')).toHaveLength(5)
    expect(host.querySelector<HTMLButtonElement>('.public-filter-reset')?.disabled).toBe(true)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('allows only one popup and cancels the previous field request when another opens', async () => {
    state.fetch.mockImplementation(() => new Promise(() => {}))
    const host = mount(() => h(FilterPanel, { query: { search: null, filters: {} }, filters: [group, { ...group, key: 'year', label: '年份' }], pageSize: 24, locale: 'zh' }))
    const buttons = host.querySelectorAll<HTMLButtonElement>('.public-filter-trigger')
    buttons[0]!.click(); await settle()
    const signal = state.fetch.mock.calls[0]![1].signal
    buttons[1]!.click(); await settle()
    expect(host.querySelectorAll('[role=dialog]')).toHaveLength(1)
    expect(buttons[0]!.getAttribute('aria-expanded')).toBe('false')
    expect(buttons[1]!.getAttribute('aria-expanded')).toBe('true')
    expect(signal.aborted).toBe(true)
    expect(state.fetch).toHaveBeenCalledTimes(2)
  })
  it('supports keyboard opening, list navigation, selection and Escape focus return', async () => {
    const host = mount(() => h(FilterGroup, { group, locale: 'zh' }))
    const trigger = host.querySelector<HTMLButtonElement>('.public-filter-trigger')!
    trigger.focus(); key(trigger, 'ArrowDown'); await settle()
    const list = host.querySelector<HTMLElement>('[role=listbox]')!
    expect(document.activeElement).toBe(list)
    expect(document.getElementById(list.getAttribute('aria-activedescendant')!)?.textContent).toContain('国家基金')
    key(list, 'Home'); await settle()
    expect(document.getElementById(list.getAttribute('aria-activedescendant')!)?.textContent).toContain('全部')
    key(list, 'End'); key(list, 'Enter'); await settle()
    expect(state.push).toHaveBeenCalledWith(publicListHref('/zh/projects', state.route.query, { source: '国家基金', page: null }, '#results'))
    expect(document.activeElement).toBe(trigger)
    trigger.click(); await settle()
    const input = host.querySelector('input')!
    expect(document.activeElement).toBe(input)
    key(input, 'Escape'); await settle()
    expect(document.activeElement).toBe(trigger)
    expect(host.querySelector('[role=dialog]')).toBeNull()
  })
  it('closes on outside pointer and focus without trapping Tab or stealing outside focus', async () => {
    const host = mount(() => h(FilterGroup, { group, locale: 'zh' }))
    const trigger = host.querySelector<HTMLButtonElement>('.public-filter-trigger')!
    trigger.click(); await settle()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); await settle()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    trigger.click(); await settle()
    const outside = document.createElement('button'); document.body.append(outside); outside.focus(); await settle()
    expect(host.querySelector('[role=dialog]')).toBeNull()
    expect(document.activeElement).toBe(outside)
  })
  it('debounces candidate search, cancels stale requests and retains the selected label when no options match', async () => {
    vi.useFakeTimers()
    const pending: ((value: any) => void)[] = []
    state.route.query.q = '研究'
    state.fetch.mockImplementation(() => new Promise(ok => pending.push(ok)))
    const host = mount(() => h(FilterGroup, { group, locale: 'zh' }))
    host.querySelector<HTMLButtonElement>('.public-filter-trigger')!.click(); await settle()
    const firstSignal = state.fetch.mock.calls[0]![1].signal
    const input = host.querySelector<HTMLInputElement>('input')!
    input.value = '未匹配'; input.dispatchEvent(new Event('input', { bubbles: true })); await settle()
    expect(firstSignal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(250); await settle()
    expect(state.fetch).toHaveBeenCalledTimes(2)
    expect(state.fetch.mock.calls[1]![1].query).toMatchObject({ pageSize: '24', q: '研究', locale: 'zh', module: 'projects', field: 'source', candidate: '未匹配', candidatePage: 1 })
    pending[1]!({ options: [], page: 1, hasMore: false }); await settle()
    pending[0]!({ options: [{ value: 'STALE', label: 'STALE', count: 1 }], page: 1, hasMore: false }); await settle()
    expect(host.textContent).not.toContain('STALE')
    expect(host.textContent).toContain('没有匹配选项')
    expect(host.querySelector('.public-filter-current')?.textContent).toContain('国家基金')
    expect(host.querySelectorAll('[role=option]')).toHaveLength(1)
    host.querySelector<HTMLElement>('[role=option]')!.click(); await settle()
    expect(state.push).toHaveBeenCalledWith(publicListHref('/zh/projects', state.route.query, { source: null, page: null }, '#results'))
  })
  it('replaces each bounded options page, keeps full long labels and retries the failed page', async () => {
    const long = 'A very long funding programme '.repeat(20)
    const page = (number: number) => ({ options: Array.from({ length: 20 }, (_, i) => ({ value: `${number}-${i}`, label: i ? `${number}-${i}` : long, count: i + 1 })), page: number, hasMore: number === 1 })
    state.fetch.mockResolvedValueOnce(page(1)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page(2))
    const host = mount(() => h(FilterGroup, { group, locale: 'en' }))
    host.querySelector<HTMLButtonElement>('.public-filter-trigger')!.click(); await settle()
    expect(host.querySelectorAll('[role=option]')).toHaveLength(21)
    expect(host.querySelectorAll('[role=option]')[1]!.textContent).toContain(long)
    host.querySelectorAll<HTMLButtonElement>('.public-filter-option-pages button')[1]!.click(); await settle()
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Could not load options')
    host.querySelector<HTMLButtonElement>('[role=alert] button')!.click(); await settle()
    expect(state.fetch.mock.calls[2]![1].query).toMatchObject({ candidatePage: 2, candidate: '', locale: 'en' })
    expect(host.querySelectorAll('[role=option]')).toHaveLength(21)
    expect(host.querySelector('[role=listbox]')?.textContent).not.toContain('1-19')
    expect(host.querySelector('[role=listbox]')?.textContent).toContain('2-19')
    expect(host.querySelectorAll<HTMLButtonElement>('.public-filter-option-pages button')[1]!.disabled).toBe(true)
  })
  it('aborts pending work when closing or unmounting and never reopens on late responses', async () => {
    let resolve: (value: any) => void = () => {}
    state.fetch.mockImplementation(() => new Promise(ok => { resolve = ok }))
    const host = mount(() => h(FilterGroup, { group, locale: 'zh' }))
    const trigger = host.querySelector<HTMLButtonElement>('.public-filter-trigger')!
    trigger.click(); await settle()
    const first = state.fetch.mock.calls[0]![1].signal
    trigger.click(); await settle(); expect(first.aborted).toBe(true)
    resolve({ options: [], page: 1, hasMore: false }); await settle()
    expect(host.querySelector('[role=dialog]')).toBeNull()
    trigger.click(); await settle()
    const second = state.fetch.mock.calls[1]![1].signal
    app!.unmount(); app = undefined
    expect(second.aborted).toBe(true)
  })
  it('keeps popup positioning inside a narrow viewport and flips above a low trigger', async () => {
    vi.stubGlobal('innerWidth', 360); vi.stubGlobal('innerHeight', 640)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return (this.classList.contains('public-filter-trigger') ? { left: 300, top: 600, bottom: 636, width: 48, height: 36 } : { left: 0, top: 0, bottom: 600, width: 336, height: 600 }) as DOMRect
    })
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(600)
    const host = mount(() => h(FilterGroup, { group, locale: 'zh' }))
    host.querySelector<HTMLButtonElement>('.public-filter-trigger')!.click(); await settle()
    const popup = host.querySelector<HTMLElement>('[role=dialog]')!
    expect(popup.style.left).toBe('12px')
    expect(popup.style.top).toBe('12px')
    expect(popup.style.maxHeight).toBe('582px')
  })
  it('preserves other filters and page size when searching, and starts each page-size change at page one', async () => {
    state.route.query.source = '国家基金'
    const host = mount(() => h(FilterPanel, { query: { search: null, filters: { source: '国家基金' } }, filters: [group], pageSize: 24, locale: 'zh' }))
    const input = host.querySelector<HTMLInputElement>('#public-list-search')!
    input.value = '  项目  '; input.dispatchEvent(new Event('input', { bubbles: true }))
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle()
    expect(state.push).toHaveBeenLastCalledWith(publicListHref('/zh/projects', state.route.query, { q: '项目', page: null }, '#results'))
    const select = host.querySelector<HTMLSelectElement>('.public-page-size select')!
    select.value = '36'; select.dispatchEvent(new Event('change', { bubbles: true })); await settle()
    expect(state.push).toHaveBeenLastCalledWith(publicListHref('/zh/projects', state.route.query, { pageSize: '36', page: null }, '#results'))
  })
})
