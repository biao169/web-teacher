// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref, type App, type Component } from 'vue'
import RecordRow from '../../app/components/public/content/RecordRow.vue'
import TeamList from '../../app/components/public/content/TeamList.vue'
import StudentsList from '../../app/components/public/content/StudentsList.vue'
import CoursesList from '../../app/components/public/content/CoursesList.vue'
import PatentsList from '../../app/components/public/content/PatentsList.vue'
import ProjectsList from '../../app/components/public/content/ProjectsList.vue'
import NewsList from '../../app/components/public/content/NewsList.vue'
import PublicationsList from '../../app/components/public/content/PublicationsList.vue'
import { serializePublicCopy } from '../../shared/utils/public-copy'
const mocks = vi.hoisted(() => ({ route: null as any, state: new Map<string, any>(), fetch: vi.fn() }))
vi.mock('#app/composables/state', () => ({ useState: (key: string, init: () => unknown) => { if (!mocks.state.has(key)) mocks.state.set(key, ref(init())); return mocks.state.get(key) } }))
vi.mock('#build/fetch.mjs', () => ({ $fetch: mocks.fetch }))
vi.mock('#app/composables/router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ push: vi.fn() }) }))
vi.mock('#app/components/nuxt-link', () => ({ default: { props: ['to'], setup: (props: any, { slots }: any) => () => h('a', { href: props.to }, slots.default?.()) } }))
let app: App | undefined
beforeEach(() => {
  mocks.state.clear(); mocks.fetch.mockReset()
  mocks.route = reactive({ path: '/zh/projects', fullPath: '/zh/projects', query: {}, hash: '' })
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })
function mount(render: () => any) { const host = document.createElement('div'); document.body.append(host); app = createApp({ setup: () => render }); app.mount(host); return host }
async function flush() { for (let i = 0; i < 5; i++) await nextTick() }
const modules: Record<string, Component> = { team: TeamList, students: StudentsList, courses: CoursesList, patents: PatentsList, projects: ProjectsList, news: NewsList, publications: PublicationsList }
const title = '完整长标题 Long academic title '.repeat(12)
const summary = '完整简介 Full biography. '.repeat(60)
const citation = { style: 'gbt', label: 'GB/T 7714', status: 'saved', text: '[7]  Author, A. ' + title + '\nJournal. KEEP-SPACES.', highlights: ['Author, A.'] }
const avatar = { available: true, kind: 'image', url: '/portrait.jpg', title: 'Portrait', alt: 'Teacher portrait', width: 600, height: 900 }
function fixture(module: string, locale: 'zh' | 'en') {
  const item = { uid: 'record-1', displayNumber: 73, title, name: title, role: '教师', organization: 'University', lab: 'Lab', biography: summary, summary, href: `/${locale}/${module}/record-1`, avatar,
    degree: '博士', category: '研究生', status: '在读', grade: '2026', direction: 'Computing', semester: '2026 Fall', audience: '本科生',
    country: 'CN', patentType: '发明专利', legalStatus: '已授权', inventors: 'Inventor A', applicationNumber: 'APP-1', grantNumber: 'GRANT-1', grantDate: '2026-09-01',
    source: '国家自然科学基金', fundName: '重点项目', projectNumber: 'P-1', principal: 'Principal A', periodLabel: '2024–2026',
    publicationType: '期刊论文', indexTypes: ['SCI', 'SCI'], tags: ['SCI'], citation, doi: '10.1000/test', externalUrl: 'https://example.invalid/paper',
    slug: 'record-1', cover: avatar, publishedLabel: '2026-09-01' }
  return { schemaVersion: 1, module, locale, revision: 'a'.repeat(64), totalPublic: 80, generatedAt: '', meta: { title: module, description: '', path: `/${locale}/${module}`, breadcrumbs: [] },
    query: { search: null, filters: {} }, filters: [], pagination: { page: 1, pageSize: 12, totalItems: 1, totalPages: 1, from: 1, to: 1, nextPage: null, previousPage: null }, items: [item] } as any
}
describe('shared record cards in both languages', () => {
  it.each(Object.keys(modules).flatMap(module => (['zh', 'en'] as const).map(locale => ({ module, locale }))))('$locale/$module preserves content, adjacent badges and selection capability without fetching all data', async ({ module, locale }) => {
    const model = fixture(module, locale)
    mocks.route.path = mocks.route.fullPath = `/${locale}/${module}`
    const citations = { style: 'gbt', revision: model.revision, entries: [{ uid: 'record-1', citation, pdf: { available: true, kind: 'pdf', url: '/paper.pdf', mimeType: 'application/pdf', disposition: 'attachment', alt: 'Paper' } }] }
    const host = mount(() => h(modules[module]!, { model, ...(module === 'publications' ? { citations, citationStatus: 'success', citationError: false } : {}) }))
    await flush()
    const card = host.querySelector<HTMLElement>('.public-compact-record')!
    const body = card.querySelector('.public-compact-record__body')!
    const heading = body.querySelector('.public-compact-record__heading')!
    const tags = [...(module === 'publications' ? body.querySelector('.public-compact-record__links')! : heading).querySelectorAll('.public-badge')]
    expect(card.querySelector('.public-record-number')?.textContent).toBe('73.')
    expect(heading.textContent).toContain(module === 'publications' ? citation.text : title)
    expect(tags.length).toBeGreaterThan(0)
    expect(new Set(tags.map(tag => tag.textContent)).size).toBe(tags.length)
    expect(tags.every(tag => !tag.hasAttribute('tabindex') && tag.tagName === 'SPAN')).toBe(true)
    expect(heading.firstElementChild?.className).not.toBe('public-record-tags')
    expect(mocks.fetch).not.toHaveBeenCalled()
    const selectable = !['team', 'news'].includes(module)
    expect(Boolean(card.querySelector('.public-record-checkbox'))).toBe(selectable)
    expect(Boolean(card.querySelector('.public-copy-record'))).toBe(selectable)
    if (selectable) {
      const rail = card.querySelector('.public-compact-record__rail')!
      const checkbox = rail.querySelector<HTMLInputElement>('.public-record-checkbox')!
      expect(checkbox.closest('label')).not.toBeNull()
      expect(rail.innerHTML.indexOf('public-record-checkbox')).toBeLessThan(rail.innerHTML.indexOf('public-copy-record'))
      body.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush()
      expect(card.hasAttribute('data-selected')).toBe(false)
      checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })); await flush()
      expect(card.getAttribute('data-selected')).toBe('true')
      expect(card.querySelector('.public-record-number')?.textContent).toBe('73.')
    }
    if (['team', 'students', 'courses'].includes(module)) {
      expect(body.querySelector('.public-compact-record__summary')?.textContent).toBe(summary)
      expect(body.innerHTML.indexOf('public-record-tags')).toBeLessThan(body.innerHTML.indexOf('public-compact-record__meta'))
      expect(body.innerHTML.indexOf('public-compact-record__meta')).toBeLessThan(body.innerHTML.indexOf('public-compact-record__summary'))
    }
    if (['team', 'students'].includes(module)) {
      expect(card.getAttribute('data-portrait')).toBe('true')
      const image = card.querySelector('img')!
      expect(image.getAttribute('loading')).toBe('lazy')
      expect(image.getAttribute('width')).toBe('600'); expect(image.getAttribute('height')).toBe('900')
      expect(body.querySelector('h2 a')?.getAttribute('href')).toContain(`/${locale}/${module}/record-1`)
    }
    if (module === 'projects') {
      expect(body.firstElementChild?.className).toBe('public-project-funding')
      expect(body.querySelectorAll('.public-project-funding strong')).toHaveLength(2)
      expect(heading.querySelector('.public-project-name')?.tagName).toBe('P')
      expect(body.querySelector('h2,a,.public-compact-record__summary')).toBeNull()
    }
    if (['projects', 'students', 'patents'].includes(module)) expect(heading.querySelector('.public-badge--accent')).not.toBeNull()
    if (module === 'courses') {
      expect(tags.map(tag => tag.textContent)).toEqual(['本科生'])
      expect(body.querySelector('.public-compact-record__meta')?.textContent).toBe('2026 Fall')
      const payload = serializePublicCopy('courses', locale, model.items)
      expect(payload.text.indexOf('2026 Fall')).toBeLessThan(payload.text.indexOf('本科生'))
      expect(payload.text).toContain(summary)
    }
    if (module === 'publications') {
      expect(heading.querySelector('.public-badge')).toBeNull()
      expect(body.querySelector('.public-citation-text')?.textContent).toBe(citation.text)
      expect(body.querySelector('.public-citation-text mark')?.textContent).toBe('Author, A.')
      expect(body.lastElementChild?.className).toBe('public-compact-record__links')
      const pdf = body.querySelector('.public-document-link')!
      expect(pdf.getAttribute('href')).toBe('/paper.pdf'); expect(pdf.hasAttribute('download')).toBe(true)
      const payload = serializePublicCopy('publications', locale, model.items, false, 'gbt')
      expect(payload.text).toBe(citation.text)
      expect(payload.text).not.toContain('SCI')
    }
  })
  it('normalizes duplicate/empty labels while keeping the first appearance and status tone after updates', async () => {
    const props = reactive({ uid: 'p', title: 'Title', displayNumber: 9, tags: [' SCI ', 'SCI', '', '在研'], statusTags: ['在研', '  '] })
    const host = mount(() => h(RecordRow, props))
    expect([...host.querySelectorAll('.public-badge')].map(tag => tag.textContent)).toEqual(['SCI', '在研'])
    expect(host.querySelector('.public-badge--accent')?.textContent).toBe('在研')
    props.tags = []; props.statusTags = []; await flush()
    expect(host.querySelector('.public-record-tags')).toBeNull()
    expect(host.querySelector('.public-compact-record__meta,.public-compact-record__summary,.public-compact-record__links')).toBeNull()
  })
  it('preserves full text and native partial copy events without inserting badges into citation content', () => {
    const host = mount(() => h(RecordRow, { uid: 'p', title, displayNumber: 9, summary, tags: ['SCI'] }))
    const paragraph = host.querySelector('.public-compact-record__summary')!
    const range = document.createRange(); range.setStart(paragraph.firstChild!, 0); range.setEnd(paragraph.firstChild!, 4)
    window.getSelection()!.addRange(range)
    const event = new Event('copy', { bubbles: true, cancelable: true }); paragraph.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(window.getSelection()!.toString()).toBe(summary.slice(0, 4))
    expect(paragraph.textContent).toBe(summary)
  })
  it('shows a stable portrait fallback after image failure and restores the image when its URL changes', async () => {
    const media = reactive({ ...avatar }) as any
    const host = mount(() => h(RecordRow, { uid: 'p', title: '王老师', displayNumber: 9, media, mediaFallback: '王', portrait: true }))
    host.querySelector('img')!.dispatchEvent(new Event('error')); await flush()
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('.public-media__initials')?.textContent).toBe('王')
    expect(host.querySelector('.public-media--portrait')).not.toBeNull()
    media.url = '/replacement.jpg'; await flush()
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/replacement.jpg')
  })
})
