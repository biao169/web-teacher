// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, type App } from 'vue'
import { formatProjectAmount } from '../../shared/utils/project-amount'
import { scopedNavigationHref, unpackPublicListQuery } from '../../shared/utils/public-list-link'
import type { PublicStudentSummary, PublicNewsDetailViewModel, PublicNumberedRecord } from '../../shared/contracts/public-content'
import ProfileLinks from '../../app/components/public/ProfileLinks.vue'
import StudentGroups from '../../app/components/public/content/StudentGroups.vue'
import NewsRows from '../../app/components/public/content/NewsRows.vue'
import NewsBody from '../../app/components/public/content/NewsBody.vue'
import FilterPanel from '../../app/components/public/content/FilterPanel.vue'
import NavigationLink from '../../app/components/public/NavigationLink.vue'

const state = vi.hoisted(() => ({
  route: { path: '/zh/publications', fullPath: '/zh/publications', query: {} as Record<string, string>, hash: '' },
  fetch: vi.fn(), push: vi.fn(),
}))
vi.mock('#build/fetch.mjs', () => ({ $fetch: state.fetch }))
vi.mock('#app/composables/router', () => ({ useRoute: () => state.route, useRouter: () => ({ push: state.push }) }))
vi.mock('#app/components/nuxt-link', () => ({ default: { props: ['to'], setup: (props: { to: string }, { slots }: { slots: { default?: () => unknown } }) => () => h('a', { href: props.to }, slots.default?.() as []) } }))
let app: App | undefined
let callbacks: IntersectionObserverCallback[] = []
beforeEach(() => {
  state.route = reactive({ path: '/zh/publications', fullPath: '/zh/publications', query: {}, hash: '' })
  state.fetch.mockReset(); state.push.mockReset(); callbacks = []
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: IntersectionObserverCallback) { callbacks.push(callback) } observe() {} disconnect() {} })
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })
function mount(render: () => ReturnType<typeof h>) {
  const host = document.createElement('div'); document.body.append(host)
  app = createApp({ setup: () => render }); app.mount(host); return host
}
async function flush() { for (let i = 0; i < 8; i++) await nextTick() }
function enter(index = 0) { callbacks[index]!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver) }
const cover = { available: true as const, kind: 'image' as const, url: '/cover.jpg', alt: 'Cover', title: 'Cover', mimeType: 'image/jpeg', size: 10, width: 900, height: 600, disposition: 'inline' as const, downloadAllowed: false, cacheScope: 'public' as const, purpose: 'cover' as const }
function news(locale: 'zh' | 'en' = 'zh'): PublicNewsDetailViewModel {
  return { schemaVersion: 1, locale, module: 'news', generatedAt: 'now', meta: { title: 'News', description: '', path: `/${locale}/news/post`, alternatePath: '/en/news/post', breadcrumbs: [], image: null, type: 'article' }, item: {
    uid: 'post', slug: 'post', title: 'News', category: 'Research', publishedAt: '2026-09-01T00:00:00.000Z', publishedLabel: '2026-09-01', featured: true, href: `/${locale}/news/post`, cover,
    contentFormat: 'html', blocks: [{ type: 'rich', text: 'Rich body', html: '<p><strong>Rich body</strong><em> emphasis</em></p><ul><li>List item</li></ul>' }], related: [], commentsEnabled: false,
  } }
}

describe('second frontend refinement', () => {
  it.each([['12.5000', '12.5 万元', 'CNY 125,000'], ['0', '0 万元', 'CNY 0'], ['0.0001', '0.0001 万元', 'CNY 1'], ['999999999999999999.9999', '999999999999999999.9999 万元', 'CNY 9,999,999,999,999,999,999,999']])('formats %s exactly without exchange conversion', (value, zh, en) => {
    expect(formatProjectAmount(value, 'zh')).toBe(zh); expect(formatProjectAmount(value, 'en')).toBe(en)
    expect(formatProjectAmount(null, 'zh')).toBeNull(); expect(formatProjectAmount('12e3', 'en')).toBeNull()
  })
  it('shows configured platform icons and values including zero, and hides missing values', () => {
    const host = mount(() => h(ProfileLinks, { locale: 'zh', links: [
      { kind: 'google-scholar', label: 'Google Scholar', href: 'https://example.org/scholar', value: '1234' },
      { kind: 'github', label: 'GitHub', href: 'https://example.org/git', value: '0' },
      { kind: 'dblp', label: 'DBLP', href: 'https://example.org/dblp', value: null },
    ] }))
    expect(host.querySelectorAll('a svg')).toHaveLength(3)
    expect([...host.querySelectorAll('.public-profile-links__value')].map(item => item.textContent)).toEqual(['1234', '0'])
  })
  it('retains configured scope through reset, additional search and locale-safe links, hiding locked filters', async () => {
    state.route.query = { nav: 'nav:2026', year: '2026', venue: 'Journal', q: 'Vision', page: '2' }
    const scope = { uid: 'nav:2026', label: '2026年论文', revision: 'r', filters: { year: '2026' }, search: null }
    const filters = ['year', 'venue'].map(key => ({ key, label: key, options: [] }))
    const host = mount(() => h(FilterPanel, { locale: 'zh', pageSize: 24, query: { search: 'Vision', filters: { year: '2026', venue: 'Journal' }, scope }, filters }))
    expect(host.querySelector('[data-filter="year"]')).toBeNull(); expect(host.querySelector('[data-filter="venue"]')).not.toBeNull()
    host.querySelector<HTMLButtonElement>('.public-filter-reset')!.click(); await flush()
    let url = new URL(state.push.mock.calls[0]![0], 'https://fixture.invalid')
    expect(Object.fromEntries(url.searchParams)).toEqual({ nav: 'nav:2026', pageSize: '24', year: '2026' })
    const input = host.querySelector<HTMLInputElement>('input[type=search]')!; input.value = 'Learning'; input.dispatchEvent(new Event('input'))
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await flush()
    url = new URL(state.push.mock.calls.at(-1)![0], 'https://fixture.invalid')
    expect(url.searchParams.get('year')).toBe('2026'); expect(url.searchParams.get('nav')).toBe('nav:2026'); expect(url.searchParams.get('q')).toBe('Learning'); expect(url.searchParams.has('page')).toBe(false)
    const link = scopedNavigationHref('/en/publications?year=2026&q=Robotics', 'nav:2026')
    expect(unpackPublicListQuery(Object.fromEntries(new URL(link, 'https://fixture.invalid').searchParams))).toEqual({ nav: 'nav:2026', year: '2026' })
  })
  it('highlights only the originating filter button after further search and on a detail return path', async () => {
    state.route.query = { nav: 'nav:2026', year: '2026', q: 'Vision' }
    const links = [{ uid: 'all', label: 'All', href: '/zh/publications' }, { uid: 'nav:2026', label: '2026', href: '/zh/publications?nav=nav%3A2026&year=2026' }].map(link => ({ ...link, external: false, style: 'default' as const, location: 'header' as const, icon: null }))
    const host = mount(() => h('nav', links.map(link => h(NavigationLink, { link }))))
    expect([...host.querySelectorAll('[aria-current=page]')].map(item => item.textContent)).toEqual(['2026'])
    state.route.path = '/zh/publications/paper'; state.route.query = { from: '/zh/publications?nav=nav%3A2026&year=2026#results' }; await flush()
    expect([...host.querySelectorAll('[aria-current=page]')].map(item => item.textContent)).toEqual(['2026'])
  })
  it('groups loaded students in configured category order and appends into existing sections without duplicate UIDs', async () => {
    const student = (uid: string, categoryKey: string, category: string, displayNumber: number): PublicStudentSummary & PublicNumberedRecord => ({ uid, name: uid, categoryKey, category, displayNumber, degree: null, grade: null, direction: null, status: null, biography: null, featured: false, href: `/zh/students/${uid}`, avatar: { available: false, kind: 'image', alt: uid, fallback: 'initials' } })
    const items = reactive([student('master1', 'master', '硕士生', 10), student('doctor1', 'doctoral', '博士生', 9)])
    const host = mount(() => h(StudentGroups, { items, locale: 'zh', categories: [{ key: 'doctoral', label: '博士生' }, { key: 'master', label: '硕士生' }] }))
    items.push(student('doctor2', 'doctoral', '博士生', 8), student('other', '', '', 7)); await flush()
    expect([...host.querySelectorAll('.public-student-group')].map(item => item.getAttribute('data-category'))).toEqual(['doctoral', 'master', ''])
    expect(host.querySelector('[data-category=doctoral]')?.querySelectorAll('.public-compact-record')).toHaveLength(2)
    expect(host.querySelectorAll('[data-uid]')).toHaveLength(4)
    expect([...host.querySelectorAll('.public-record-number')].map(item => item.textContent)).toEqual(['9.', '8.', '10.', '7.'])
  })
  it('news rows show title and metadata without requesting or rendering the detail body', async () => {
    const model = news(); state.fetch.mockResolvedValue(model)
    const host = mount(() => h(NewsRows, { items: [{ ...model.item, displayNumber: 3 }], locale: 'zh', revision: 'r1' }))
    await flush()
    expect(state.fetch).not.toHaveBeenCalled()
    expect(callbacks).toHaveLength(0)
    expect(host.querySelector('.public-news-body')).toBeNull()
    expect(host.textContent).not.toContain('Rich body')
    expect(host.textContent).toContain('2026-09-01')
    expect(host.querySelector('h2 a')?.getAttribute('href')).toBe('/zh/news/post')
  })
  it('retries failed article reads and ignores a late body after changing language', async () => {
    const props = reactive({ slug: 'post', locale: 'zh' as 'zh' | 'en', revision: 'r1' })
    state.fetch.mockRejectedValueOnce(new Error('offline'))
    const host = mount(() => h(NewsBody, props)); enter(); await flush()
    expect(host.querySelector('[role=alert]')).not.toBeNull()
    let complete!: (value: PublicNewsDetailViewModel) => void
    state.fetch.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    host.querySelector<HTMLButtonElement>('button')!.click(); await flush()
    const signal = state.fetch.mock.calls.at(-1)![1].signal
    props.locale = 'en'; await flush(); expect(signal.aborted).toBe(true)
    complete(news()); await flush(); expect(host.querySelector('strong')).toBeNull()
    state.fetch.mockResolvedValue(news('en')); enter(callbacks.length - 1); await flush()
    expect(host.querySelector('strong')?.textContent).toBe('Rich body')
  })
})
