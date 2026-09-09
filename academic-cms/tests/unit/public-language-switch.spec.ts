// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App, type Ref } from 'vue'
import SiteHeader from '../../app/components/public/SiteHeader.vue'
import { PUBLIC_LOCALE_COOKIE, PUBLIC_LOCALE_COOKIE_OPTIONS } from '../../shared/utils/public-locale'
import { publicListHref } from '../../shared/utils/public-list-link'

const state = vi.hoisted(() => ({ preference: null as Ref<string | null> | null, cookie: vi.fn(), route: { path: '/zh/news', fullPath: '', hash: '', query: {} } }))
vi.mock('../../app/composables/useAuthSession', () => ({ useAuthSession: () => ({ session: ref({ authenticated: false }), pending: ref(false), load: async () => undefined }) }))
vi.mock('#app/composables/cookie', () => ({ useCookie: (...args: unknown[]) => { state.cookie(...args); return state.preference } }))
vi.mock('#app/composables/router', () => ({ useRoute: () => state.route }))
vi.mock('#app/composables/url', () => ({ useRequestURL: () => new URL('https://site.example/zh/news') }))
vi.mock('#app/components/nuxt-link', async () => {
  const { h } = await import('vue')
  return { default: { props: ['to'], setup: (props: any, { slots }: any) => () => h('a', { href: props.to }, slots.default?.()) } }
})
let app: App | undefined
beforeEach(() => {
  state.cookie.mockClear(); state.preference = ref(null)
  state.route.fullPath = publicListHref('/zh/news', { category: '学术报告', q: '研究', page: 2 }, {}, '#results')
})
afterEach(() => { app?.unmount(); document.body.replaceChildren() })
describe('site language switch', () => {
  it.each(['zh', 'en'] as const)('remembers an intentional switch from %s and keeps the filtered destination', async locale => {
    state.route.fullPath = state.route.fullPath.replace('/zh/', `/${locale}/`)
    const host = document.createElement('div'); document.body.append(host)
    app = createApp({ render: () => h(SiteHeader, { model: null, locale, fallbackSiteName: 'Example' }) })
    app.mount(host); await nextTick()
    expect(state.preference!.value).toBeNull()
    expect(state.cookie).toHaveBeenCalledWith(PUBLIC_LOCALE_COOKIE, { ...PUBLIC_LOCALE_COOKIE_OPTIONS, secure: true })
    const link = host.querySelector<HTMLAnchorElement>('.public-language-link')!
    const target = locale === 'zh' ? 'en' : 'zh'
    expect(link.getAttribute('role')).toBe('switch')
    expect(link.getAttribute('aria-checked')).toBe(String(locale === 'en'))
    expect(link.querySelector('.public-language-switch__thumb')).not.toBeNull()
    expect(link.getAttribute('href')).toBe(state.route.fullPath.replace(`/${locale}/`, `/${target}/`))
    expect(decodeURIComponent(link.getAttribute('href')!)).toMatch(/^[\x20-\x7e]+$/u)
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await nextTick()
    expect(state.preference!.value).toBe(target)
    state.preference!.value = null
    link.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })); await nextTick()
    expect(state.preference!.value).toBe(target)
  })
})
