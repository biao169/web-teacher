import { localizePublicReturnLink } from './public-detail-link'
import { normalizePublicListHref } from './public-list-link'

export type SupportedLocale = 'zh' | 'en'

const LOCALIZED_PREFIX = /^\/(?:zh|en)(?=\/|$|\?|#)/

export function switchLocalePath(path: string, targetLocale: SupportedLocale): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (LOCALIZED_PREFIX.test(normalizedPath)) {
    const switched = normalizedPath.replace(LOCALIZED_PREFIX, `/${targetLocale}`)
    return localizePublicReturnLink(normalizePublicListHref(switched === `/${targetLocale}/` ? `/${targetLocale}` : switched), targetLocale)
  }

  const suffixIndex = normalizedPath.search(/[?#]/)
  const suffix = suffixIndex >= 0 ? normalizedPath.slice(suffixIndex) : ''
  return `/${targetLocale}${suffix}`
}
