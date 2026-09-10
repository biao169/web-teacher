import { normalizePublicListHref, publicListDefinition } from './public-list-link'
const detail = /^\/(zh|en)\/(team|publications|projects|patents|students|research|news|courses)\/[^/?#]+$/u
export function publicDetailList(path: unknown): string | null {
  if (typeof path !== 'string' || publicListDefinition(path.split('?')[0]!)) return null
  const match = detail.exec(path.split(/[?#]/u)[0]!)
  return match ? `/${match[1]}/${match[2]}` : null
}
/** Only the same module's list or a known homepage section can be a return target. */
export function safePublicReturn(detailPath: string, value: unknown): string | null {
  const list = publicDetailList(detailPath)
  if (!list || typeof value !== 'string' || value.length > 4096 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/u.test(value)) return null
  try {
    const url = new URL(value, 'https://public.invalid'), locale = list.split('/')[1]
    if (url.origin !== 'https://public.invalid') return null
    if (url.pathname === `/${locale}` && !url.search && /^#(?:profile|research|publications|projects|news|contact)?$/u.test(url.hash || '#')) return url.pathname + url.hash
    if (url.pathname !== list && !(list.endsWith('/publications') && url.pathname === `${list}/featured`)) return null
    if (url.hash && url.hash !== '#results') return null
    return normalizePublicListHref(url.pathname + url.search + '#results')
  } catch { return null }
}
export function publicDetailHref(href: string, from: string): string {
  const safe = safePublicReturn(href, from)
  if (!safe) return href
  const url = new URL(href, 'https://public.invalid'); url.searchParams.set('from', safe)
  return url.pathname + url.search + url.hash
}
export function localizePublicReturnLink(path: string, locale: 'zh' | 'en'): string {
  const list = publicDetailList(path)
  if (!list) return path
  const url = new URL(path, 'https://public.invalid'), values = url.searchParams.getAll('from')
  if (!values.length) return path
  const sourceLocale = /^\/(zh|en)(?:[/?#]|$)/u.exec(values[0] ?? '')?.[1]
  const sourceDetail = url.pathname.replace(/^\/(zh|en)/u, `/${sourceLocale ?? locale}`)
  const from = values.length === 1 ? safePublicReturn(sourceDetail, values[0]) : null
  if (from) url.searchParams.set('from', from.replace(/^\/(zh|en)/u, `/${locale}`))
  else url.searchParams.delete('from')
  return url.pathname + url.search + url.hash
}
