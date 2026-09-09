// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, type App } from 'vue'
import type { PublicShellViewModel } from '../../shared/contracts/public-site'
import { publicContentBlocks, publicFooterHtml, richTextMediaReferencesFromHtml } from '../../server/services/public/public-content-blocks'
import Footer from '../../app/components/public/SiteFooter.vue'
import BackToTop from '../../app/components/public/BackToTop.vue'
import PdfDocument from '../../app/components/public/content/PdfDocument.vue'
import RichHtml from '../../app/components/public/content/RichHtml.vue'
const mocks = vi.hoisted(() => ({ open: vi.fn(), destroy: vi.fn() }))
vi.mock('../../app/utils/pdf-document', () => ({ openPdfDocument: mocks.open }))
vi.mock('../../app/components/public/content/PdfPage.vue', () => ({ default: { props: ['page'], emits: ['ready'], setup: (props: { page: number }, context: { emit: (event: 'ready') => void }) => () => h('button', { class: 'pdf-page-fixture', onClick: () => context.emit('ready') }, String(props.page)) } }))
let app: App | undefined
let observers: Array<{ callback: IntersectionObserverCallback; target?: Element; disconnected: boolean }> = []
beforeEach(() => {
  mocks.open.mockReset(); mocks.destroy.mockReset(); observers = []
  vi.stubGlobal('IntersectionObserver', class {
    item: typeof observers[number]
    constructor(callback: IntersectionObserverCallback) { this.item = { callback, disconnected: false }; observers.push(this.item) }
    observe(target: Element) { this.item.target = target; this.item.disconnected = false }
    disconnect() { this.item.disconnected = true }
  })
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function mount(render: () => ReturnType<typeof h>) { const host = document.createElement('div'); document.body.append(host); app = createApp({ setup: () => render }); app.mount(host); return host }
async function flush() { for (let i = 0; i < 12; i++) await nextTick() }
function enter(className: string) { const observer = observers.findLast(item => !item.disconnected && item.target?.classList.contains(className)); expect(observer).toBeTruthy(); observer!.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver) }
describe('footer settings and back to top', () => {
  it('renders configured HTML once, removes injected code, and keeps plain-text line breaks', () => {
    const source = '<div style="text-align:center" onclick="bad()">© 2026 智能系统与可信计算实验室</div><p>本页面内容均为开发演示数据。</p><a href="https://example.org/icp">备案</a><script>alert(1)</script><iframe src="https://example.org"></iframe><a href="javascript:bad()">危险</a>'
    const html = publicFooterHtml(source)!
    expect(html).not.toMatch(/onclick|script|iframe|alert\(1\)/u)
    const model = { site: { footerHtml: html, footerText: 'legacy text', name: 'Lab' }, navigation: { footer: [] } } as unknown as PublicShellViewModel
    const host = mount(() => h(Footer, { model, locale: 'zh', fallbackSiteName: 'Fallback' }))
    expect(host.textContent?.match(/© 2026/g)).toHaveLength(1)
    expect(host.textContent?.match(/本页面内容均为开发演示数据。/g)).toHaveLength(1)
    expect(host.textContent).not.toMatch(/Academic CMS|Fallback|legacy text/u)
    expect(host.querySelector('a')?.href).toBe('https://example.org/icp')
    expect(host.querySelector('.rich-align-center')).not.toBeNull()
    expect(publicFooterHtml('Line 1\nLine 2')).toBe('Line 1<br>Line 2')
  })
  it('hides an empty footer without inserting fallback copyright or demo text', () => {
    const host = mount(() => h(Footer, { model: null, locale: 'en', fallbackSiteName: 'Lab' }))
    expect(host.querySelector('footer')).toBeNull()
    expect(publicFooterHtml('  ')).toBeNull()
  })
  it('shows the floating button after scrolling and honors reduced motion', async () => {
    const position = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0)
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const host = mount(() => h(BackToTop, { locale: 'en' }))
    expect(host.querySelector('button')).toBeNull()
    position.mockReturnValue(500); window.dispatchEvent(new Event('scroll')); await flush()
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Back to top')
    host.querySelector('button')!.click(); expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
    position.mockReturnValue(0); window.dispatchEvent(new Event('scroll')); await flush()
    expect(host.querySelector('button')).toBeNull()
  })
})
describe('seamless PDF body', () => {
  it('only projects managed PDF references, with no native viewer or arbitrary embed URL', () => {
    const source = '<p>前文</p><figure data-type="pdf" data-object-key="uploads/report.pdf" data-title="报告"></figure><p>后文</p><iframe src="https://evil.org/doc.pdf"></iframe>'
    expect(richTextMediaReferencesFromHtml(source)).toEqual([{ objectKey: 'uploads/report.pdf', kind: 'pdf' }])
    const block = publicContentBlocks(source, 'html', new Map(), new Map([['uploads/report.pdf', '/api/v1/public/news/post/pdf?key=uploads%2Freport.pdf']]))[0]!
    expect(block.type).toBe('rich')
    if (block.type !== 'rich') return
    expect(block.html).toContain('data-pdf-src=')
    expect(block.html).not.toMatch(/iframe|evil\.org/u)
    const host = mount(() => h(RichHtml, { html: block.html }))
    expect(host.querySelectorAll('.public-pdf-document')).toHaveLength(1)
    expect(host.textContent).toContain('前文'); expect(host.textContent).toContain('后文')
    expect(mocks.open).not.toHaveBeenCalled()
  })
  it('loads one PDF page at a time near the viewport, grows naturally, and cleans up on source change', async () => {
    mocks.open.mockResolvedValue({ promise: Promise.resolve({ numPages: 30 }), destroy: mocks.destroy })
    const props = reactive({ src: '/api/v1/public/news/post/pdf?key=report.pdf', locale: 'zh' as const })
    const host = mount(() => h(PdfDocument, props))
    expect(mocks.open).not.toHaveBeenCalled()
    enter('public-pdf-document'); await flush()
    expect(mocks.open).toHaveBeenCalledOnce()
    expect(host.querySelectorAll('.pdf-page-fixture')).toHaveLength(1)
    host.querySelector<HTMLButtonElement>('.pdf-page-fixture')!.click(); await flush()
    enter('public-pdf-next'); await flush()
    expect(host.querySelectorAll('.pdf-page-fixture')).toHaveLength(2)
    expect(host.querySelector('iframe')).toBeNull()
    expect(host.querySelector('section')?.style.height).toBe('')
    props.src = '/api/v1/public/news/next/pdf?key=next.pdf'; await flush()
    expect(mocks.destroy).toHaveBeenCalledOnce()
    expect(host.querySelectorAll('.pdf-page-fixture')).toHaveLength(0)
  })
})
