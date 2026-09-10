import { describe, expect, it } from 'vitest'
import { publicDetailHref, safePublicReturn, publicDetailList } from '../../shared/utils/public-detail-link'
import { switchLocalePath } from '../../shared/utils/locale-path'
describe('detail return context', () => {
  it('preserves the record page and search through a language switch', () => {
    const from = '/zh/research?page=2&q=robots#results'
    const href = publicDetailHref('/zh/research/area-1', from)
    expect(new URL(href, 'https://test.invalid').searchParams.get('from')).toBe(from)
    const switched = new URL(switchLocalePath(href, 'en'), 'https://test.invalid')
    expect(switched.pathname).toBe('/en/research/area-1')
    expect(switched.searchParams.get('from')).toBe('/en/research?page=2&q=robots#results')
  })
  it.each(['https://evil.invalid', '//evil.invalid', '/zh/news?q=x', '/en/research', '/zh/research#unsafe', ['a','b'], '/zh/research\\evil'])('rejects invalid return %s', value => {
    expect(safePublicReturn('/zh/research/area-1', value)).toBeNull()
  })
  it('supports homepage sections and featured publications', () => {
    expect(safePublicReturn('/zh/research/a', '/zh#research')).toBe('/zh#research')
    expect(safePublicReturn('/en/publications/a', '/en/publications/featured?page=2')).toBe('/en/publications/featured?page=2#results')
    expect(publicDetailList('/zh/publications/featured')).toBeNull()
  })
  it('removes duplicate or unsafe nested return targets on language change', () => {
    expect(switchLocalePath('/zh/research/a?from=%2Fzh%2Fresearch&from=%2Fzh%2Fresearch', 'en')).toBe('/en/research/a')
    expect(switchLocalePath('/zh/research/a?from=https%3A%2F%2Fevil.invalid', 'en')).toBe('/en/research/a')
  })
})
