import { describe, expect, it } from 'vitest'
import { publicListHref } from '../../shared/utils/public-list-link'
import { configuredPublicOrigin, publicAbsoluteUrl, publicPageRobots, publicSeoLinks } from '../../shared/utils/public-seo'
import { parseSitemapRequest, publicRobots } from '../../server/services/public/public-sitemap'

describe('shared public SEO policy', () => {
  it.each(['', undefined, ' https://site.example', 'https://site.example/path', 'https://user:pass@site.example', 'https://site.example?q=1', 'https://site.example#x', 'http://site.example', '//site.example', `https://${'a'.repeat(513)}.example`])('omits untrusted or incomplete origins: %s', input => {
    expect(configuredPublicOrigin(input)).toBeNull()
    expect(publicSeoLinks(configuredPublicOrigin(input), '/zh', '/en')).toEqual([])
    expect(publicRobots(configuredPublicOrigin(input))).not.toContain('Sitemap:')
  })
  it.each(['https://site.example', 'http://localhost:3000', 'http://127.0.0.1:8080', 'http://[::1]:3000'])('accepts a canonical deployment origin: %s', input => {
    expect(configuredPublicOrigin(input + '/')).toBe(input)
    expect(publicRobots(input)).toContain(`Sitemap: ${input}/sitemap.xml`)
  })
  it('uses reciprocal absolute language links and the negotiating root only on homepages', () => {
    const zh = publicSeoLinks('https://site.example', '/zh', '/en')
    const en = publicSeoLinks('https://site.example', '/en', '/zh')
    expect(zh[0]).toEqual({ rel: 'canonical', href: 'https://site.example/zh' })
    expect(zh.slice(1)).toEqual(en.slice(1))
    expect(zh.at(-1)?.href).toBe('https://site.example/')
    expect(publicSeoLinks('https://site.example', '/zh/news/test', '/en/news/test').at(-1)?.href).toBe('https://site.example/en/news/test')
  })
  it('keeps public media URLs while rejecting network-path and backslash escapes', () => {
    expect(publicAbsoluteUrl(null, 'https://media.example/image.png')).toBe('https://media.example/image.png')
    expect(publicAbsoluteUrl(null, '/media/image.png')).toBeNull()
    expect(publicAbsoluteUrl('https://site.example', '//attacker.example')).toBeNull()
    expect(publicAbsoluteUrl('https://site.example', '/\\attacker.example')).toBeNull()
  })
  it('retains self-canonical pagination without indexing search and filter combinations', () => {
    expect(publicPageRobots('/en/publications/featured')).toContain('index,follow')
    expect(publicPageRobots('/en/news?page=2')).toBe('index,follow,max-image-preview:large')
    const path = publicListHref('/zh/news', { category: '学术报告', q: '人工智能', page: '2' })
    expect(publicPageRobots(path)).toBe('noindex,follow')
    expect(publicPageRobots('/en/publications?year=2026')).toBe('noindex,follow')
    expect(publicPageRobots('/zh/news?pageSize=24')).toBe('noindex,follow')
    expect(publicSeoLinks('https://site.example', path, path.replace('/zh/', '/en/'))[0]?.href).toBe(`https://site.example${path}`)
  })
})

describe('sitemap input boundaries', () => {
  it('accepts only the index, static pages and an explicit content shard', () => {
    expect(parseSitemapRequest({})).toEqual({ section: 'index' })
    expect(parseSitemapRequest({ section: 'static' })).toEqual({ section: 'static' })
    expect(parseSitemapRequest({ section: 'news', page: '2' })).toEqual({ section: 'content', module: 'news', page: 2 })
  })
  it.each([
    { section: 'admin', page: '1' }, { section: 'static', page: '1' }, { section: 'news' },
    { section: 'news', page: '0' }, { section: 'news', page: '01' }, { section: 'news', page: '1.5' },
    { section: 'news', page: '-1' }, { section: 'news', page: '9999999999999' },
    { section: ['news', 'team'], page: '1' }, { section: 'news', page: ['1', '2'] },
    { section: 'news', page: '1', host: 'attacker.example' }, { section: '__proto__', page: '1' },
  ])('rejects ambiguous or unsupported requests: %j', query => {
    expect(() => parseSitemapRequest(query)).toThrow()
  })
})
