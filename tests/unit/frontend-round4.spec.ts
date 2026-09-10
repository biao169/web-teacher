// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref, type App } from 'vue'
import ContactForm from '../../app/components/public/contact/ContactForm.vue'
import NewsMessages from '../../app/components/public/contact/NewsMessages.vue'
import NavigationLink from '../../app/components/public/NavigationLink.vue'
import { requestBackoffSeconds } from '../../app/utils/request-backoff'

const state = vi.hoisted(() => ({ fetch: vi.fn(), load: vi.fn(), route: { path: '/zh/news/post', fullPath: '/zh/news/post', query: {} }, session: {} as { value: { authenticated: boolean; csrfToken?: string } } }))
vi.mock('#build/fetch.mjs', () => ({ $fetch: state.fetch }))
vi.mock('../../app/composables/useAuthSession', () => ({ useAuthSession: () => ({ load: state.load, session: state.session }) }))
vi.mock('#app/composables/router', () => ({ useRoute: () => state.route }))
vi.mock('#app/components/nuxt-link', () => ({ default: { props: ['to'], setup: (props: { to: string }, { slots }: { slots: { default?: () => unknown } }) => () => h('a', { href: props.to }, slots.default?.() as []) } }))
let app: App | undefined
const availability = { enabled: true, authenticated: false, anonymousAllowed: true, attachmentsEnabled: false, messageTypes: ['other'], limits: { name: 120, email: 320, subject: 200, content: 10000 } }
beforeEach(() => {
  state.fetch.mockReset().mockResolvedValue(availability)
  state.load.mockReset().mockResolvedValue(undefined)
  state.session = ref({ authenticated: false })
  state.route = reactive({ path: '/zh/news/post', fullPath: '/zh/news/post', query: {} })
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); vi.useRealTimers() })
function mount(render: () => ReturnType<typeof h>) {
  const host = document.createElement('div'); document.body.append(host)
  app = createApp({ setup: () => render }); app.mount(host); return host
}
async function flush() { for (let i = 0; i < 12; i++) await nextTick() }
function fill(host: HTMLElement, text = 'A sufficiently long news message for the team.') {
  const values = ['Visitor', 'visitor@example.invalid', 'News inquiry']
  host.querySelectorAll<HTMLInputElement>('.public-field input').forEach((input, index) => { input.value = values[index]!; input.dispatchEvent(new Event('input')) })
  const body = host.querySelector('textarea')!; body.value = text; body.dispatchEvent(new Event('input'))
}
describe('public messages and rapid requests', () => {
  it('opens news messages on demand and preserves a draft when closed and reopened', async () => {
    const host = mount(() => h(NewsMessages, { locale: 'zh', news: { uid: 'news:one', title: 'Public news title' } }))
    expect(state.load).not.toHaveBeenCalled(); expect(state.fetch).not.toHaveBeenCalled()
    const button = host.querySelector<HTMLButtonElement>('.public-news-messages__toggle')!
    button.click(); await flush()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelectorAll('form')).toHaveLength(1)
    fill(host); await flush(); button.click(); await flush()
    expect(host.querySelector<HTMLElement>('[role=region]')!.style.display).toBe('none')
    button.click(); await flush()
    expect(host.querySelector('textarea')?.value).toContain('sufficiently long')
    expect(state.fetch).toHaveBeenCalledOnce()
  })
  it('posts one associated message during repeated submits, then displays a receipt', async () => {
    const host = mount(() => h(ContactForm, { locale: 'zh', news: { uid: 'news:one', title: 'Public news title' } })); await flush(); fill(host)
    let finish!: (value: unknown) => void
    state.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const form = host.querySelector('form')!
    form.dispatchEvent(new Event('submit', { cancelable: true })); form.dispatchEvent(new Event('submit', { cancelable: true })); await flush()
    expect(state.fetch).toHaveBeenCalledTimes(2)
    expect(state.fetch.mock.calls[1]![1]).toMatchObject({ method: 'POST', retry: 0, body: { newsUid: 'news:one', subject: 'News inquiry', messageType: 'other' } })
    expect(host.querySelector<HTMLButtonElement>('[type=submit]')?.disabled).toBe(true)
    finish({ accepted: true, reference: 'message:receipt-1' }); await flush()
    expect(host.textContent).toContain('message:receipt-1'); expect(host.querySelector('form')).toBeNull()
  })
  it('keeps content after 429 and waits for Retry-After without replaying the write', async () => {
    vi.useFakeTimers()
    const host = mount(() => h(ContactForm, { locale: 'en' })); await flush(); fill(host)
    state.fetch.mockRejectedValueOnce({ statusCode: 429, response: { headers: new Headers({ 'retry-after': '3' }) } })
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await flush()
    expect(host.textContent).toContain('3 seconds'); expect(host.querySelector('textarea')?.value).toContain('sufficiently long')
    expect(host.querySelector<HTMLButtonElement>('[type=submit]')?.disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(3000); await flush()
    expect(host.querySelector<HTMLButtonElement>('[type=submit]')?.disabled).toBe(false)
    expect(state.fetch).toHaveBeenCalledTimes(2)
  })
  it('contains session/settings failures inside the form and supports retry', async () => {
    state.load.mockRejectedValueOnce(new Error('network'))
    const host = mount(() => h(ContactForm, { locale: 'zh' })); await flush()
    expect(host.textContent).toContain('暂时无法读取'); expect(host.querySelector('form')).toBeNull()
    host.querySelector<HTMLButtonElement>('button')!.click(); await flush()
    expect(host.querySelector('form')).not.toBeNull()
  })
  it('shows the login handoff when anonymous messages are disabled', async () => {
    state.fetch.mockResolvedValueOnce({ ...availability, enabled: false, anonymousAllowed: false })
    const host = mount(() => h(ContactForm, { locale: 'zh' })); await flush()
    expect(host.textContent).toContain('请登录后提交'); expect(host.querySelector('form')).toBeNull()
  })
  it('keeps the header contact link pale at rest, and marks it only on contact pages', async () => {
    const host = mount(() => h(NavigationLink, { link: { uid: 'contact', label: '留言', href: '/zh/contact', location: 'header', external: false, icon: null, style: 'primary' } }))
    expect(host.querySelector('a')?.classList.contains('public-navigation-link--primary')).toBe(false)
    expect(host.querySelector('a')?.getAttribute('aria-current')).toBeNull()
    state.route.path = '/zh/contact'; state.route.fullPath = '/zh/contact'; await flush()
    expect(host.querySelector('a')?.getAttribute('aria-current')).toBe('page')
  })
  it('reads both server cooldown header formats and ignores unrelated errors', () => {
    const now = Date.now()
    expect(requestBackoffSeconds({ statusCode: 429, response: { headers: new Headers({ 'x-ratelimit-reset': String(now + 4500) }) } }, now)).toBe(5)
    expect(requestBackoffSeconds({ statusCode: 429 })).toBe(60)
    expect(requestBackoffSeconds({ statusCode: 503 })).toBe(0)
  })
})
