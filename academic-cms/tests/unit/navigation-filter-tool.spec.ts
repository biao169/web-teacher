// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import Tool from '../../app/components/admin/shared/AdminNavigationFilterTool.vue'
import { publicListHref, unpackPublicListQuery } from '../../shared/utils/public-list-link'

let app: App | undefined
const applied = vi.fn()
const { fetch } = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('#build/fetch.mjs', () => ({ $fetch: fetch }))
async function settle() { for (let i = 0; i < 4; i++) { await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)) } }
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label)!
async function mount(props: Record<string, unknown> = {}) {
  const host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => h(Tool, { preset: 'news', ...props, onApply: applied }) })
  app.mount(host); await settle()
  button('配置筛选按钮').click(); await settle()
}
async function input(label: string, value: string) {
  const field = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); await settle()
}
beforeEach(() => {
  applied.mockReset(); fetch.mockReset()
  fetch.mockResolvedValue({ filters: [{ key: 'category', label: '分类', options: [{ value: '学术报告', label: '学术报告', count: 3, selected: false }] }] })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })

describe('navigation filter dialog', () => {
  it('loads existing candidates, applies an ASCII link, and previews both languages', async () => {
    await mount()
    expect(fetch).toHaveBeenCalledWith('/api/v1/public/news', expect.objectContaining({ query: { locale: 'zh' } }))
    await input('搜索关键词', '人工智能')
    document.querySelector<HTMLInputElement>('input[aria-label="分类"]')!.click(); await settle()
    const option = [...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(item => item.textContent === '学术报告')!
    option.click(); await settle()
    const previews = [...document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')].map(item => item.getAttribute('href'))
    expect(previews).toHaveLength(2)
    expect(previews[0]).toMatch(/^\/zh\/news\?f=[\w-]+$/u)
    expect(previews[1]).toBe(previews[0]!.replace('/zh/', '/en/'))
    button('应用到编辑区').click(); await settle()
    const path = applied.mock.lastCall![0]
    expect(unpackPublicListQuery(Object.fromEntries(new URL(path, 'https://test.example').searchParams))).toEqual({ q: '人工智能', category: '学术报告' })
  })
  it('reopens a persisted path, and cancel preserves it', async () => {
    const path = publicListHref('/students', { category: '博士生', q: '王', pageSize: '24' })
    await mount({ path })
    expect(fetch).toHaveBeenCalledWith('/api/v1/public/students', expect.anything())
    expect(document.querySelector<HTMLInputElement>('input[aria-label="搜索关键词"]')!.value).toBe('王')
    await input('搜索关键词', '未保存')
    button('取消').click(); await settle()
    expect(applied).not.toHaveBeenCalled()
    button('配置筛选按钮').click(); await settle()
    expect(document.querySelector<HTMLInputElement>('input[aria-label="搜索关键词"]')!.value).toBe('王')
    button('应用到编辑区').click(); await settle()
    expect(applied).toHaveBeenCalledWith(path)
  })
  it('keeps configuration usable when candidate loading fails, and blocks oversized links', async () => {
    fetch.mockRejectedValue(new Error('offline'))
    await mount()
    expect(document.body.textContent).toContain('现有候选项读取失败')
    await input('搜索关键词', '中'.repeat(86))
    expect(button('应用到编辑区').disabled).toBe(true)
    await input('搜索关键词', '有效关键词')
    button('应用到编辑区').click(); await settle()
    expect(applied).toHaveBeenCalledTimes(1)
  })
  it('does not open or fetch in read-only mode', async () => {
    await mount({ disabled: true })
    expect(button('配置筛选按钮').disabled).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
    expect(applied).not.toHaveBeenCalled()
  })
})
