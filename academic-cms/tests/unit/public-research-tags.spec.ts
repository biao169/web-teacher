// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref, shallowRef, type App } from 'vue'
import ResearchList from '../../app/components/public/content/ResearchList.vue'
import ResearchTag from '../../app/components/public/content/ResearchTag.vue'
import HomeResearch from '../../app/components/public/home/Research.vue'
import { publicListHref } from '../../shared/utils/public-list-link'
import { publicDetailHref } from '../../shared/utils/public-detail-link'
const mocks = vi.hoisted(() => ({ route: null as any, state: new Map<string, any>(), fetch: vi.fn() }))
vi.mock('#app/composables/state', () => ({ useState: (key: string, init: () => unknown) => { if (!mocks.state.has(key)) mocks.state.set(key, ref(init())); return mocks.state.get(key) } }))
vi.mock('#build/fetch.mjs', () => ({ $fetch: mocks.fetch }))
vi.mock('#app/composables/router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ push: vi.fn() }) }))
vi.mock('#app/components/nuxt-link', () => ({ default: { props: ['to'], setup: (props: any, { slots }: any) => () => h('a', { href: props.to }, slots.default?.()) } }))
let app: App | undefined
beforeEach(() => { mocks.state.clear(); mocks.fetch.mockReset(); mocks.route = reactive({ path: '/zh/research', fullPath: '/zh/research', query: {}, hash: '' }); vi.stubGlobal('IntersectionObserver', undefined) })
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })
function mount(render: () => any) { const host = document.createElement('div'); document.body.append(host); app = createApp({ setup: () => render }); app.mount(host); return host }
async function flush() { for (let i = 0; i < 10; i++) await nextTick() }
const description = 'Hidden overview description. '.repeat(40)
function page(locale: 'zh' | 'en' = 'zh', number = 1, query = '') {
  const path = publicListHref(`/${locale}/research`, { q: query || null, page: number === 1 ? null : String(number) })
  return { schemaVersion: 1, module: 'research', locale, revision: 'a'.repeat(64), totalPublic: 50, generatedAt: '', meta: { title: 'Research', description: '', path, breadcrumbs: [] }, query: { search: query || null, filters: {} }, filters: [],
    pagination: { page: number, pageSize: 12, totalItems: 24, totalPages: 2, from: (number - 1) * 12 + 1, to: number * 12, nextPage: number === 1 ? 2 : null, previousPage: number === 1 ? null : 1 },
    items: Array.from({ length: 12 }, (_, index) => ({ uid: `topic-${(number - 1) * 12 + index}`, displayNumber: 50 - (number - 1) * 12 - index, name: `${locale === 'zh' ? '研究方向' : 'Research topic'} ${(number - 1) * 12 + index}`, description, href: `/${locale}/research/topic-${(number - 1) * 12 + index}` })) } as any
}
describe('shared research name tags', () => {
  it.each(['home', 'list'].flatMap(surface => (['zh', 'en'] as const).map(locale => ({ surface, locale }))))('$locale/$surface renders only names with stable numbers and safe detail return links', async ({ surface, locale }) => {
    const model = page(locale), items = model.items.slice(0, surface === 'home' ? 6 : 12)
    const host = mount(() => surface === 'home' ? h(HomeResearch, { model: { locale, generatedAt: 'revision', researchInterests: items } as any }) : h(ResearchList, { model }))
    await flush()
    if (surface === 'home') {
      const cards = [...host.querySelectorAll('.public-home-research__card')]
      expect(cards).toHaveLength(items.length)
      expect(cards.map(card => card.textContent)).toEqual(items.map((item: { name: string }) => item.name))
      expect(cards[0]?.getAttribute('href')).toBe(items[0].href)
      expect(host.querySelector('input,button,textarea,.public-selection-toolbar,.public-copy-record,.public-record-number')).toBeNull()
      expect(host.textContent).not.toContain(description)
      expect(mocks.fetch).not.toHaveBeenCalled()
      return
    }
    const group = host.querySelector('.public-research-tags')!
    expect(group).not.toBeNull()
    expect(group.querySelectorAll('.public-research-tag')).toHaveLength(items.length)
    expect(group.querySelector('p,details,.public-compact-record,.public-compact-record__summary')).toBeNull()
    expect(group.textContent).not.toContain(description)
    expect([...group.querySelectorAll('.public-record-number')].map(el => el.textContent)).toEqual(items.map((item: any) => `${item.displayNumber}.`))
    const first = group.querySelector('.public-research-tag')!
    expect(first.querySelector('h2 a')?.textContent).toBe(items[0].name)
    expect(first.querySelector('h2 a')?.getAttribute('href')).toBe(publicDetailHref(items[0].href, surface === 'home' ? `/${locale}#research` : `${model.meta.path}#results`))
    expect(first.querySelector('input')?.getAttribute('aria-label')).toBe(items[0].name)
    expect(first.querySelector('.public-copy-record')?.getAttribute('aria-label')).toBe(`${locale === 'zh' ? '复制' : 'Copy'} ${items[0].name}`)
    expect(first.innerHTML.indexOf('public-record-checkbox')).toBeLessThan(first.innerHTML.indexOf('public-copy-record'))
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('appends a bounded next page without duplicating tags or changing selection and preserves each page return link', async () => {
    const model = page('zh', 1, '研究'), host = mount(() => h(ResearchList, { model }))
    const checkbox = host.querySelector<HTMLInputElement>('.public-record-checkbox')!
    checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })); await flush()
    mocks.fetch.mockResolvedValue(page('zh', 2, '研究'))
    host.querySelector<HTMLButtonElement>('.public-load-more button')!.click(); await flush()
    expect(mocks.fetch).toHaveBeenCalledOnce()
    expect(mocks.fetch.mock.calls[0]![1].query.page).toBe('2')
    const tags = [...host.querySelectorAll('.public-research-tag')]
    expect(tags).toHaveLength(24)
    expect(new Set(tags.map(tag => tag.getAttribute('data-uid'))).size).toBe(24)
    expect(host.querySelectorAll('.public-research-tag[data-selected]')).toHaveLength(1)
    expect(host.querySelectorAll('.public-record-checkbox:checked')).toHaveLength(1)
    expect(tags[12]!.querySelector('.public-record-number')?.textContent).toBe('38.')
    expect(tags[12]!.querySelector('a')?.getAttribute('href')).toBe(publicDetailHref('/zh/research/topic-12', page('zh', 2, '研究').meta.path + '#results'))
    expect(host.querySelector('.public-load-more button')).toBeNull()
    expect(host.querySelector('.public-research-tags')?.textContent).not.toContain(description)
  })
  it('discards a late research page after switching filters and language', async () => {
    const model = shallowRef(page()), host = mount(() => h(ResearchList, { model: model.value }))
    let finish!: (value: any) => void
    mocks.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    host.querySelector<HTMLButtonElement>('.public-load-more button')!.click(); await flush()
    const signal = mocks.fetch.mock.calls[0]![1].signal
    mocks.route.path = '/en/research'; mocks.route.query = { q: 'new' }; model.value = page('en', 1, 'new'); await flush()
    expect(signal.aborted).toBe(true)
    finish(page('zh', 2)); await flush()
    expect(host.querySelectorAll('.public-research-tag')).toHaveLength(12)
    expect(host.querySelectorAll('.public-research-tag a')[0]?.textContent).toBe('Research topic 0')
    expect(host.querySelector('[data-uid="topic-12"]')).toBeNull()
  })
  it('selects equal names by UID and respects the 200-item cap without selecting text clicks', async () => {
    const model = page(); model.items[1].name = model.items[0].name
    const host = mount(() => h(ResearchList, { model }))
    const names = host.querySelectorAll('.public-research-tag__name')
    names[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush()
    expect(host.querySelector('.public-research-tag[data-selected]')).toBeNull()
    const boxes = host.querySelectorAll<HTMLInputElement>('.public-record-checkbox')
    boxes[1]!.checked = true; boxes[1]!.dispatchEvent(new Event('change', { bubbles: true })); await flush()
    expect(host.querySelector('.public-research-tag[data-selected]')?.getAttribute('data-uid')).toBe('topic-1')
    mocks.state.get('public-selection:v1').value.research = Array.from({ length: 200 }, (_, index) => ({ uid: `old-${index}`, label: 'Old' }))
    await flush(); boxes[0]!.checked = true; boxes[0]!.dispatchEvent(new Event('change', { bubbles: true })); await flush()
    expect(boxes[0]!.checked).toBe(false)
    expect(host.querySelector('.public-research-tag[data-selected]')).toBeNull()
    expect(host.textContent).toContain('最多选择 200 条')
  })
  it('keeps complete copy data available on demand while removing descriptions from the tag itself', async () => {
    const model = page(), host = mount(() => h(ResearchList, { model }))
    const complete = 'Complete private-to-this-fixture public description. '.repeat(500)
    mocks.fetch.mockResolvedValue({ schemaVersion: 1, module: 'research', locale: 'zh', revision: model.revision, totalPublic: 50, uids: ['topic-0'], unavailableUids: [], items: [{ ...model.items[0], description: complete }] })
    const writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal('navigator', { clipboard: { writeText } })
    host.querySelector<HTMLButtonElement>('.public-copy-record')!.click(); await flush()
    expect(mocks.fetch.mock.calls[0]![1].query).toEqual({ module: 'research', locale: 'zh', uid: ['topic-0'] })
    expect(writeText).toHaveBeenCalledExactlyOnceWith('研究方向 0；' + complete)
    expect(host.querySelector('dialog,textarea')).toBeNull()
    expect(host.querySelector('.public-research-tag__name')?.textContent).not.toContain(complete)
    expect(host.querySelectorAll('.public-record-checkbox:checked')).toHaveLength(0)
  })
  it('shows the list empty state and omits an empty home section without fetching', async () => {
    const model = page(); model.items = []; model.pagination = { ...model.pagination, totalItems: 0, totalPages: 0, from: 0, to: 0, nextPage: null }
    const host = mount(() => h('div', [h(ResearchList, { model }), h(HomeResearch, { model: { locale: 'zh', generatedAt: '', researchInterests: [] } as any })]))
    await flush()
    expect(host.querySelector('.public-research-tag,.public-research-tags,#research')).toBeNull()
    expect(host.textContent).toContain('暂无研究方向')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('keeps a long name complete and escaped with native partial text selection', () => {
    const name = '<script>literal</script> 长研究方向 '.repeat(30)
    const host = mount(() => h(ResearchTag, { item: { ...page().items[0], name }, locale: 'zh' }))
    const link = host.querySelector('a')!
    expect(link.textContent).toBe(name)
    expect(host.querySelector('script,details,p,.public-record-checkbox')).toBeNull()
    window.getSelection()!.removeAllRanges()
    const range = document.createRange(); range.setStart(link.firstChild!, 0); range.setEnd(link.firstChild!, 8); window.getSelection()!.addRange(range)
    const event = new Event('copy', { bubbles: true, cancelable: true }); link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(window.getSelection()!.toString()).toBe(name.slice(0, 8))
  })
})
