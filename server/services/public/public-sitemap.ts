import type { DatabaseAdapter } from '../../../db/contracts'
import { publicRecordPath } from '../../../shared/utils/public-path'
import { publicLanguageAlternates } from '../../../shared/utils/public-seo'
import { PublicSiteError } from './errors'
import { isPublicSitemapModule, PUBLIC_SITEMAP_MAX_PAGE, PublicContentStore, type PublicSitemapShard } from './public-content-store'

const STATIC_PAGES = ['', 'team', 'research', 'publications', 'publications/featured', 'projects', 'patents', 'students', 'news', 'courses', 'contact'] as const
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n'
const XML_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9'
type SitemapRequest = { section: 'index' } | { section: 'static' } | ({ section: 'content' } & PublicSitemapShard)

export function parseSitemapRequest(query: Record<string, unknown>): SitemapRequest {
  if (!Object.keys(query).length) return { section: 'index' }
  if (Object.keys(query).some(key => key !== 'section' && key !== 'page')) throw new PublicSiteError('PUBLIC_INPUT', 'Invalid sitemap query')
  if (query.section === 'static' && query.page === undefined) return { section: 'static' }
  if (!isPublicSitemapModule(query.section) || typeof query.page !== 'string' || !/^[1-9]\d{0,12}$/u.test(query.page)) {
    throw new PublicSiteError('PUBLIC_INPUT', 'Invalid sitemap query')
  }
  const page = Number(query.page)
  if (!Number.isSafeInteger(page) || page > PUBLIC_SITEMAP_MAX_PAGE) throw new PublicSiteError('PUBLIC_INPUT', 'Invalid sitemap page')
  return { section: 'content', module: query.section, page }
}

function xml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;')
}

function localizedEntries(origin: string, zh: string, en: string): string {
  const alternate = publicLanguageAlternates(zh, en).map(item =>
    `<xhtml:link rel="alternate" hreflang="${item.hreflang}" href="${xml(new URL(item.path, origin).href)}"/>`).join('')
  return [zh, en].map(path => `<url><loc>${xml(new URL(path, origin).href)}</loc>${alternate}</url>`).join('\n')
}

/** Lightweight projection only: no translations, media grants, sessions or application cache. */
export async function publicSitemap(adapter: DatabaseAdapter, origin: string, request: SitemapRequest, now = new Date().toISOString()): Promise<string> {
  const store = new PublicContentStore(adapter)
  if (request.section === 'index') {
    const shards = await store.sitemapShards(now)
    const paths = ['/sitemap.xml?section=static', ...shards.map(shard => `/sitemap.xml?section=${shard.module}&page=${shard.page}`)]
    return XML_HEADER + `<sitemapindex xmlns="${XML_NAMESPACE}">\n` + paths.map(path => `<sitemap><loc>${xml(new URL(path, origin).href)}</loc></sitemap>`).join('\n') + '\n</sitemapindex>'
  }
  let entries: string[]
  if (request.section === 'static') {
    entries = STATIC_PAGES.map(page => localizedEntries(origin, `/zh${page ? `/${page}` : ''}`, `/en${page ? `/${page}` : ''}`))
  }
  else {
    const records = await store.sitemapRecords(request.module, request.page, now)
    if (!records.length) throw new PublicSiteError('PUBLIC_NOT_FOUND', 'Sitemap shard is empty')
    const module = request.module === 'team' ? 'profiles' : request.module
    entries = records.map(record => localizedEntries(origin,
      publicRecordPath('zh', module, record.identifier), publicRecordPath('en', module, record.identifier)))
  }
  // lastmod is intentionally omitted: record timestamps do not include later
  // translation/media changes, and generating a timestamp now would be misleading.
  return XML_HEADER + `<urlset xmlns="${XML_NAMESPACE}" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` + entries.join('\n') + '\n</urlset>'
}

export function publicRobots(origin: string | null): string {
  // Keep HTML crawlable so engines can observe noindex on account/admin pages.
  return 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /health\n'
    + '# Account, setup and admin documents send noindex HTTP headers.\n'
    + (origin ? `Sitemap: ${new URL('/sitemap.xml', origin).href}\n` : '')
}
