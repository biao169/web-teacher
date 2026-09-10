import { publicListDefinition, unpackPublicListQuery } from './public-list-link'

/** Deployment configuration is authoritative; never derive indexing URLs from request headers. */
export function configuredPublicOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value !== value.trim()) return null
  try {
    const url = new URL(value)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null
    return url.origin.length <= 512 ? url.origin : null
  }
  catch { return null }
}

export function publicAbsoluteUrl(origin: string | null, path: string): string | null {
  if (/^https:\/\//u.test(path)) return path
  return origin && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? new URL(path, origin).toString() : null
}

export function publicLanguageAlternates(path: string, alternatePath: string) {
  const zh = path.startsWith('/zh') ? path : alternatePath
  const en = path.startsWith('/en') ? path : alternatePath
  return [
    { hreflang: 'zh-CN', path: zh },
    { hreflang: 'en', path: en },
    // Only the homepage has a language-negotiating entry point. Inner pages
    // fall back to their English counterpart, retaining the current resource.
    { hreflang: 'x-default', path: zh === '/zh' && en === '/en' ? '/' : en },
  ]
}

export function publicSeoLinks(origin: string | null, path: string, alternatePath: string) {
  if (!origin) return []
  return [
    { rel: 'canonical' as const, href: publicAbsoluteUrl(origin, path)! },
    ...publicLanguageAlternates(path, alternatePath).map(item => ({
      rel: 'alternate' as const, hreflang: item.hreflang, href: publicAbsoluteUrl(origin, item.path)!,
    })),
  ]
}

/** Ordinary pagination is indexable; ad-hoc search/filter combinations are not. */
export function publicPageRobots(path: string): string {
  const url = new URL(path, 'https://public.invalid')
  if (publicListDefinition(url.pathname)) {
    try {
      const query = unpackPublicListQuery(Object.fromEntries(url.searchParams))
      if (Object.keys(query).some(key => key !== 'page')) return 'noindex,follow'
    }
    catch { return 'noindex,follow' }
  }
  return 'index,follow,max-image-preview:large'
}
