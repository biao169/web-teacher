// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref, type App, type Ref } from 'vue'
import SiteHeader from '../../app/components/public/SiteHeader.vue'
import SiteFooter from '../../app/components/public/SiteFooter.vue'
import PageHero from '../../app/components/public/content/PageHero.vue'
import type { SessionView } from '../../shared/contracts/auth'
import type { PublicPageMeta } from '../../shared/contracts/public-content'
import Hero from '../../app/components/public/home/Hero.vue'
import { normalizePublicReadingMode, PUBLIC_READING_COOKIE, usePublicReadingMode } from '../../app/composables/usePublicReadingMode'
import { publicListHref } from '../../shared/utils/public-list-link'
import type { PublicHomeViewModel, PublicSiteLink } from '../../shared/contracts/public-site'

const state = vi.hoisted(() => ({ reading: null as Ref<unknown> | null, locale: null as Ref<unknown> | null, route: null as any, cookie: vi.fn(), session: null as Ref<SessionView> | null, pending: null as Ref<boolean> | null, load: vi.fn(), logout: vi.fn() }))
vi.mock('../../app/composables/useAuthSession', () => ({ useAuthSession: () => ({ session: state.session, pending: state.pending, load: state.load, logout: state.logout }) }))
vi.mock('#app/composables/cookie', () => ({ useCookie: (name: string, options: unknown) => { state.cookie(name, options); return name === 'academic-cms-reading' ? state.reading : state.locale } }))
vi.mock('#app/composables/router', () => ({ useRoute: () => state.route }))
vi.mock('#app/composables/url', () => ({ useRequestURL: () => new URL('https://example.test/zh') }))
vi.mock('#app/components/nuxt-link', async () => {
  const { h } = await import('vue')
  return { default: { props: ['to'], setup: (props: any, { slots }: any) => () => h('a', { href: typeof props.to === 'string' ? props.to : `${props.to.path}?${new URLSearchParams(props.to.query).toString()}` }, slots.default?.()) } }
})
let app: App | undefined
const media = { available: false as const, kind: 'image' as const, fallback: 'none' as const, alt: '' }
function links(location: 'header' | 'hero' | 'footer', count: number): PublicSiteLink[] {
  return Array.from({ length: count }, (_, i) => ({ uid: `${location}-${i}`, label: `${location} ${i}`, href: publicListHref('/zh/publications', { year: 2000 + i }), external: false, style: i % 3 === 0 ? 'primary' : i % 3 === 1 ? 'secondary' : 'default', location, icon: null }))
}
const model: PublicHomeViewModel = {
  schemaVersion: 1, locale: 'zh', homePath: '/zh', alternatePath: '/en', generatedAt: '2026-09-06T00:00:00.000Z',
  site: { uid: 'site', name: 'Test', heroTitle: 'Research', heroSubtitle: null, seoTitle: 'Research', seoDescription: '', keywords: [], footerText: '', logo: media, favicon: media, openGraphImage: media },
  navigation: { header: links('header', 14), hero: links('hero', 7), footer: links('footer', 13) },
  featuredProfile: null, publications: [], projects: [], news: [], researchInterests: [], sections: { research: false, publications: false, projects: false, news: false }, counts: { research: 0, publications: 0, projects: 0, news: 0 },
}
beforeEach(() => {
  state.session = ref<SessionView>({ authenticated: false }); state.pending = ref(false)
  state.load.mockReset().mockResolvedValue(undefined); state.logout.mockReset().mockImplementation(async () => { state.session!.value = { authenticated: false } })
  state.reading = ref(undefined); state.locale = ref(null); state.cookie.mockClear()
  state.route = reactive({ path: '/zh/publications', fullPath: '/zh/publications?year=2002', hash: '', query: { year: '2002' } })
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren() })
function mount(render: () => any) { const host = document.createElement('div'); document.body.append(host); app = createApp({ setup: () => render }); app.mount(host); return host }

describe('shared public shell controls', () => {
  it.each([undefined, null, 'huge', { mode: 'large' }, ['large'], 22])('rejects malformed reading preferences: %j', value => {
    expect(normalizePublicReadingMode(value)).toBe('standard')
  })
  it.each(['standard', 'comfortable', 'large'] as const)('keeps valid preference %s', mode => {
    expect(normalizePublicReadingMode(mode)).toBe(mode)
  })
  it('renders every header, hero and footer entry with its configured style and order', () => {
    const host = mount(() => h('div', [h(SiteHeader, { model, locale: 'zh', fallbackSiteName: 'Test' }), h(Hero, { model }), h(SiteFooter, { model, locale: 'zh', fallbackSiteName: 'Test' })]))
    for (const [selector, location] of [['.public-nav', 'header'], ['.public-actions', 'hero'], ['.public-footer__nav', 'footer']] as const) {
      const anchors = [...host.querySelectorAll<HTMLAnchorElement>(`${selector} .public-navigation-link`)]
      expect(anchors.map(a => a.textContent?.trim())).toEqual(model.navigation[location].map(l => l.label))
      expect(anchors.map(a => a.getAttribute('href'))).toEqual(model.navigation[location].map(l => l.href))
      expect(anchors[0]?.classList.contains('public-navigation-link--primary')).toBe(true)
      expect(anchors[1]?.classList.contains('public-navigation-link--secondary')).toBe(true)
    }
    expect(host.querySelectorAll('.public-nav > .public-navigation-link')).toHaveLength(14)
    expect(host.querySelector('.public-nav-more')).toBeNull()
    expect(host.querySelectorAll('.public-nav .public-navigation-link[aria-current="page"]')).toHaveLength(1)
  })
  it('keeps reading and language controls below and outside the collapsible navigation', () => {
    const host = mount(() => h(SiteHeader, { model, locale: 'zh', fallbackSiteName: 'Test' }))
    const navigation = host.querySelector('#public-primary-navigation')!
    const toolbar = host.querySelector('.public-header__toolbar')!
    expect(navigation.contains(host.querySelector('.public-reading-controls'))).toBe(false)
    expect(toolbar.querySelector('.public-reading-controls')).not.toBeNull()
    expect(toolbar.querySelector('.public-language-switch')?.getAttribute('href')).toBe('/en/publications?year=2002')
    expect(navigation.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('closes the mobile menu with Escape and restores focus; route changes close it too', async () => {
    const host = mount(() => h(SiteHeader, { model, locale: 'zh', fallbackSiteName: 'Test' }))
    const button = host.querySelector<HTMLButtonElement>('.public-menu-button')!
    button.click(); await nextTick()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await nextTick()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
    button.click(); await nextTick()
    state.route.path = '/zh/patents'; state.route.fullPath = '/zh/patents'; await nextTick()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelectorAll('.public-nav > a')).toHaveLength(14)
  })
  it.each(['/zh/patents', '/zh/patents/', '/zh/patents?year=2026', '/zh/patents/patent-1?from=%2Fzh%2Fpatents'])('highlights the patent section at %s', async path => {
    const navigation = [{ ...links('header', 1)[0]!, href: '/zh', label: '首页' }, { ...links('header', 2)[1]!, href: '/zh/patents/', label: '专利与软著' }]
    const host = mount(() => h(SiteHeader, { model: { ...model, navigation: { ...model.navigation, header: navigation } }, locale: 'zh', fallbackSiteName: 'Test' }))
    state.route.path = path.split('?')[0]; state.route.fullPath = path; await nextTick()
    const active = host.querySelectorAll('.public-nav .is-current')
    expect(active).toHaveLength(1)
    expect(active[0]?.textContent).toBe('专利与软著')
  })
  it('survives malformed visitor filters without losing configured navigation', async () => {
    state.route.fullPath = '/zh/publications?f=invalid'
    const host = mount(() => h(SiteHeader, { model, locale: 'zh', fallbackSiteName: 'Test' }))
    expect(host.querySelectorAll('.public-nav > a')).toHaveLength(14)
    expect(host.querySelectorAll('.public-nav .is-current')).toHaveLength(0)
  })
  it('honors new empty navigation instead of restoring disabled entries', async () => {
    const current = ref(model)
    const host = mount(() => h(SiteHeader, { model: current.value, locale: 'zh', fallbackSiteName: 'Test' }))
    current.value = { ...model, navigation: { header: [], hero: [], footer: [] } }; await nextTick()
    expect(host.querySelectorAll('.public-nav > a')).toHaveLength(0)
    expect(host.querySelector('.public-language-switch')).not.toBeNull()
  })
  it('keeps breadcrumbs and a semantic heading on compact lists while preserving detail headings', async () => {
    const compact = ref(true)
    const meta: PublicPageMeta = { title: '专利与软件著作', description: '查看专利与法律状态。', path: '/zh/patents', alternatePath: '/en/patents', image: null, type: 'website', breadcrumbs: [{ label: '首页', href: '/zh' }, { label: '专利与软件著作', href: '/zh/patents' }] }
    const host = mount(() => h(PageHero, { meta, compact: compact.value, locale: 'zh' }))
    expect(host.querySelector('h1')?.textContent).toBe(meta.title)
    expect(host.querySelector('h1')?.classList.contains('public-sr-only')).toBe(true)
    expect(host.querySelector('.public-breadcrumbs')?.textContent).toContain(meta.title)
    expect(host.querySelector('.public-page-hero__description')).toBeNull()
    compact.value = false; await nextTick()
    expect(host.querySelector('h1')?.classList.contains('public-sr-only')).toBe(false)
    expect(host.querySelector('.public-page-hero__description')?.textContent).toBe(meta.description)
  })
  it.each(['zh', 'en'] as const)('renders the complete %s biography safely and only configured action buttons', async locale => {
    const biography = 'First paragraph\n\n' + '研究  Teaching.\n'.repeat(1200) + '<img src=x onerror=alert(1)>\n\nFinal paragraph'
    const profile = { uid: 'teacher', name: '教师 Teacher', role: '教授', title: null, organization: 'University', lab: null, biography, contact: null, href: `/${locale}/team/teacher`, avatar: media }
    const current = ref<PublicHomeViewModel>({ ...model, locale, featuredProfile: profile })
    const host = mount(() => h(Hero, { model: current.value }))
    expect(host.querySelector('.public-home-profile__biography')?.textContent).toBe(biography)
    expect(host.querySelector('.public-home-profile__biography img')).toBeNull()
    expect(host.querySelector('.public-home-profile__name')?.getAttribute('href')).toContain(`/${locale}/team/teacher?from=`)
    expect(host.querySelectorAll('.public-home-shortcuts a')).toHaveLength(7)
    expect(host.querySelector('.public-home-metrics')).toBeNull()
    current.value = { ...current.value, navigation: { header: [], hero: [], footer: [] } }; await nextTick()
    expect(host.querySelector('.public-home-shortcuts')).toBeNull()
    expect([...host.querySelectorAll('a')].map(a => a.textContent)).toEqual(['教师 Teacher'])
  })
  it('updates one cookie-owned reading state and retains it across a locale change', async () => {
    state.reading!.value = 'large'
    const host = document.createElement('div'); document.body.append(host)
    app = createApp({ setup() {
      const mode = usePublicReadingMode()
      return () => h('div', { 'data-reading': mode.value }, [h(SiteHeader, { model: null, locale: state.route.path.startsWith('/en') ? 'en' : 'zh', fallbackSiteName: 'Test', readingMode: mode.value, 'onUpdate:readingMode': value => { mode.value = value } })])
    } })
    app.mount(host); await nextTick()
    expect(host.firstElementChild?.getAttribute('data-reading')).toBe('large')
    expect(state.cookie).toHaveBeenCalledWith(PUBLIC_READING_COOKIE, { path: '/', sameSite: 'lax', maxAge: 31536000, secure: true })
    const buttons = host.querySelectorAll<HTMLButtonElement>('.public-reading-controls button')
    buttons[1]!.click(); await nextTick()
    expect(state.reading!.value).toBe('comfortable')
    expect(host.firstElementChild?.getAttribute('data-reading')).toBe('comfortable')
    state.route.path = '/en/publications'; state.route.fullPath = '/en/publications?year=2002'; await nextTick()
    expect(host.querySelector('.public-reading-controls button[aria-pressed="true"]')?.textContent).toBe('Comfort')
    expect(state.reading!.value).toBe('comfortable')
  })
})


const viewPermission = { view: true, create: false, edit: false, delete: false, export: false }
function account(overrides: Partial<Extract<SessionView, { authenticated: true }>['user']> = {}): SessionView {
  return { authenticated: true, csrfToken: 'test-only', expiresAt: '2027-01-01', idleExpiresAt: '2027-01-01', user: {
    uid: 'user:test', username: 'teacher', displayName: '陈老师', email: null, permissions: {}, mustChangePassword: false,
    role: { uid: 'role:test', name: 'Member', level: 1000, isSystem: false }, visibilityScopes: ['public'], ...overrides,
  } }
}
async function flushAccount() { for (let i = 0; i < 10; i++) await nextTick() }
describe('account placement in the existing header', () => {
  it('puts login in the top navigation and keeps it outside the lower toolbar and mobile menu', async () => {
    const host = mount(() => h(SiteHeader, { model, locale: 'zh', fallbackSiteName: 'Test' })); await flushAccount()
    const top = host.querySelector('.public-header__inner')!
    const action = top.querySelector<HTMLAnchorElement>('.public-header__auth a')!
    expect(action.textContent).toContain('登录')
    expect(new URL(action.href).searchParams.get('next')).toBe(state.route.fullPath)
    expect(host.querySelector('.public-header__toolbar')!.contains(action)).toBe(false)
    expect(host.querySelector('#public-primary-navigation')!.contains(action)).toBe(false)
    expect(host.querySelector('.public-header__username')).toBeNull()
    expect(top.querySelector('a[href^="/admin"]')).toBeNull()
  })
  it('shows name only in the lower toolbar while logout and permitted admin stay on top', async () => {
    const host = mount(() => h(SiteHeader, { model, locale: 'zh', fallbackSiteName: 'Test' })); await flushAccount()
    state.session!.value = account({ permissions: { news: viewPermission } }); await flushAccount()
    const top = host.querySelector('.public-header__auth')!
    expect(top.textContent).toContain('退出'); expect(top.textContent).toContain('后台')
    expect(top.textContent).not.toContain('陈老师'); expect(top.querySelector('a')?.getAttribute('href')).toBe('/admin/news')
    const lower = host.querySelector('.public-header__toolbar')!
    expect(lower.querySelector('.public-header__username')?.textContent).toContain('陈老师')
    expect(lower.querySelector('.public-header__username')?.getAttribute('href')).toBe('/zh/account')
    expect(lower.querySelector('a[href^="/admin"]')).toBeNull()
    expect(lower.querySelector('.public-reading-controls')).not.toBeNull(); expect(lower.querySelector('.public-language-switch')).not.toBeNull()
  })
  it('does not grant admin access by role level, and hides it while a password change is required', async () => {
    state.session!.value = account()
    const host = mount(() => h(SiteHeader, { model, locale: 'en', fallbackSiteName: 'Test' })); await flushAccount()
    const top = host.querySelector('.public-header__auth')!
    expect(top.textContent).toContain('Sign out'); expect(top.querySelector('a')).toBeNull()
    state.session!.value = account({ permissions: { dashboard: viewPermission } }); await flushAccount()
    expect(top.querySelector('a')?.getAttribute('href')).toBe('/admin')
    state.session!.value = account({ mustChangePassword: true, permissions: { dashboard: viewPermission } }); await flushAccount()
    expect(top.querySelector('a')).toBeNull()
  })
  it('sends logout once, then clears the name and admin entry without leaving the page', async () => {
    state.session!.value = account({ permissions: { dashboard: viewPermission } })
    let finish!: () => void
    state.logout.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve }); state.session!.value = { authenticated: false } })
    const host = mount(() => h(SiteHeader, { model, locale: 'zh', fallbackSiteName: 'Test' })); await flushAccount()
    const button = host.querySelector<HTMLButtonElement>('.public-header__auth button')!
    button.click(); button.click(); await flushAccount(); expect(button.disabled).toBe(true); expect(state.logout).toHaveBeenCalledOnce()
    finish(); await flushAccount()
    expect(host.querySelector('.public-header__username')).toBeNull()
    expect(host.querySelector('.public-header__auth')?.textContent).toContain('登录')
    expect(host.querySelector('.public-header__auth a[href^="/admin"]')).toBeNull()
  })
  it('keeps the account after failed logout and offers a retry', async () => {
    state.session!.value = account(); state.logout.mockRejectedValueOnce(new Error('network'))
    const host = mount(() => h(SiteHeader, { model, locale: 'en', fallbackSiteName: 'Test' })); await flushAccount()
    host.querySelector<HTMLButtonElement>('.public-header__auth button')!.click(); await flushAccount()
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Sign-out failed')
    expect(host.querySelector('.public-header__username')).not.toBeNull()
    host.querySelector<HTMLButtonElement>('.public-header__auth button')!.click(); await flushAccount()
    expect(host.querySelector('[role=alert]')).toBeNull(); expect(host.querySelector('.public-header__username')).toBeNull()
  })
})
