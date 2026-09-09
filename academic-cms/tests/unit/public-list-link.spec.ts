import { describe, expect, it } from 'vitest'
import { PUBLIC_LIST_TARGETS, encodePublicListQuery, normalizePublicListHref, publicFilterKeys, publicListHref, publicListRedirect, unpackPublicListQuery } from '../../shared/utils/public-list-link'
import { resolvePublicNavigation } from '../../shared/utils/public-path'
import { switchLocalePath } from '../../shared/utils/locale-path'
import { canonicalListResource, parsePublicListRequest, publicListPath } from '../../server/services/public/public-query'

const queryOf = (path: string) => Object.fromEntries(new URL(path, 'https://test.example').searchParams)
const parsed = (path: string, module: string, locale = 'zh') => parsePublicListRequest({ ...queryOf(path), locale }, publicFilterKeys(module))
const envelope = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

describe('shared public filter links', () => {
  it('does not redirect equivalent colon encodings after Vue Router reconstructs a scoped route', () => {
    const path = publicListHref('/zh/news', { nav: 'navigation:filter-acceptance', category: '筛选验收分类' })
    expect(publicListRedirect(path)).toBeNull()
    expect(publicListRedirect(path.replace('%3A', ':'))).toBeNull()
    expect(publicListRedirect(path.replace('%3A', '%3a'))).toBeNull()
  })
  it('still canonicalizes legacy Chinese parameters and default pagination with a navigation scope', () => {
    const old = '/zh/news?nav=navigation:filter-acceptance&category=筛选验收分类&page=1'
    const canonical = publicListHref('/zh/news', { nav: 'navigation:filter-acceptance', category: '筛选验收分类' })
    expect(publicListRedirect(old)).toBe(canonical)
    expect(publicListRedirect(canonical)).toBeNull()
    expect(() => publicListRedirect('/zh/news?nav=a&nav=b')).toThrow()
  })
  for (const target of PUBLIC_LIST_TARGETS) {
    it(`${target.module}: round-trips Chinese filters, search and pagination in both languages`, () => {
      const filters = Object.fromEntries(Object.keys(target.filters).map(key => [key, key === 'featured' ? '1' : '中英;分类；é😀']))
      const href = publicListHref(`/zh/${target.module}`, { ...filters, q: '中文 & a+b/#?', page: 2, pageSize: 24 }, {}, '#results')
      expect(decodeURIComponent(href)).toMatch(/^[\x20-\x7e]+$/u)
      const en = switchLocalePath(href, 'en')
      expect(en).toBe(href.replace('/zh/', '/en/'))
      expect(parsed(en, target.module, 'en')).toMatchObject({ locale: 'en', page: 2, pageSize: 24, search: '中文 & a+b/#?', filters })
      expect(normalizePublicListHref(href)).toBe(href)
      const next = publicListHref(new URL(en, 'https://test.example').pathname, queryOf(en), { page: 3 })
      expect(parsed(next, target.module, 'en')).toMatchObject({ page: 3, filters, search: '中文 & a+b/#?' })
    })
  }
  it('canonicalizes legacy links and navigation button targets without double encoding', () => {
    const legacy = '/zh/publications?publicationType=期刊&year=2026&q=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD#results'
    const href = normalizePublicListHref(legacy)
    expect(href).not.toContain('%E')
    expect(resolvePublicNavigation({ kind: 'button', path: legacy, location: 'hero' }, 'en')?.href).toBe(switchLocalePath(href, 'en'))
    const request = parsed(href, 'publications')
    expect(request).toMatchObject({ search: '人工智能', filters: { publicationType: '期刊', year: '2026' } })
    expect(canonicalListResource('publications', request)).toBe(canonicalListResource('publications', parsePublicListRequest({ locale: 'zh', publicationType: '期刊', year: '2026', q: '人工智能' }, publicFilterKeys('publications'))))
    expect(publicListPath('publications', request)).toBe(href.replace('#results', ''))
  })
  it('changes or clears one filter without losing other conditions and resets the page', () => {
    const old = publicListHref('/zh/students', { category: '博士生', direction: '可靠系统', q: '王', page: 4 })
    const updated = publicListHref('/zh/students', queryOf(old), { category: '硕士生', page: null })
    const cleared = publicListHref('/zh/students', queryOf(updated), { category: null })
    expect(parsed(updated, 'students')).toMatchObject({ page: 1, search: '王', filters: { category: '硕士生', direction: '可靠系统' } })
    expect(parsed(cleared, 'students').filters).toEqual({ direction: '可靠系统' })
    expect(normalizePublicListHref('/en/news?page=1&pageSize=12')).toBe('/en/news')
  })
  it('retains featured-page filters in canonical and alternate links', () => {
    const request = parsePublicListRequest({ locale: 'zh', q: '论文', year: '2026', page: '2' }, publicFilterKeys('publications/featured'), { fixedFilters: { featured: '1' } })
    const href = publicListPath('publications/featured', request, 'en')
    expect(href).toContain('/en/publications/featured?')
    expect(parsed(href, 'publications/featured', 'en')).toMatchObject({ search: '论文', filters: { year: '2026' }, page: 2 })
    expect(() => publicListHref('/zh/publications/featured', { featured: '0' })).toThrow()
  })
  it('keeps ASCII filters readable and distinct from an envelope-looking literal', () => {
    expect(encodePublicListQuery({ year: 2026, featured: 1 })).toBe('featured=1&year=2026')
    const value = 'eyJxIjoi5Lit5paHIn0'
    expect(unpackPublicListQuery(queryOf(publicListHref('/zh/news', { q: value })))).toEqual({ q: value })
    expect(normalizePublicListHref('/admin/navigation?q=中文')).toBe('/admin/navigation?q=中文')
  })
  it.each([
    { f: 'not!base64' }, { f: ['a', 'b'] }, { f: 'a'.repeat(8193) },
    { f: envelope([]) }, { f: envelope({ category: ['x'] }) },
    { f: envelope({ locale: 'en' }) }, { f: envelope({ page: '2' }) },
    { f: envelope({ unknown: '中文' }) }, { f: envelope({ category: '中文' }), category: '另一类' },
    { f: envelope({ category: '\u0000' }) }, { f: envelope({ category: '中'.repeat(65) }) },
    { f: envelope({ q: '\ud800' }) }, { f: '_w' }, { category: ['x', 'y'] },
  ])('rejects malformed, ambiguous, oversized or unsupported query %j', query => {
    expect(() => parsePublicListRequest({ ...query, locale: 'zh' }, ['category'])).toThrow()
  })
  it('rejects repeated legacy parameters and prototype names', () => {
    expect(() => normalizePublicListHref('/zh/news?category=a&category=b')).toThrow()
    expect(() => normalizePublicListHref('/zh/news?__proto__=x')).toThrow()
    expect(() => unpackPublicListQuery({ f: Buffer.from('{"__proto__":"x"}').toString('base64url') })).toThrow()
  })
})
