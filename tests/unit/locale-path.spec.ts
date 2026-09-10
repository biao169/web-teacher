import { describe, expect, it } from 'vitest'
import { switchLocalePath } from '../../shared/utils/locale-path'

describe('switchLocalePath', () => {
  it.each([
    ['/zh', 'en', '/en'],
    ['/zh/', 'en', '/en'],
    ['/zh/publications', 'en', '/en/publications'],
    ['/en/team/member', 'zh', '/zh/team/member'],
    ['en/news', 'zh', '/zh/news'],
    ['/zh?year=2026#result', 'en', '/en?year=2026#result'],
  ] as const)('maps %s to %s', (path, locale, expected) => {
    expect(switchLocalePath(path, locale)).toBe(expected)
  })

  it('falls back to the target locale root and preserves URL suffixes', () => {
    expect(switchLocalePath('/admin', 'en')).toBe('/en')
    expect(switchLocalePath('/admin?from=nav#top', 'en')).toBe('/en?from=nav#top')
  })
})
