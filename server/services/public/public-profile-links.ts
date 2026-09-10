import type { RawRow } from '../../../db/contracts'
import type { PublicAcademicLink } from '../../../shared/contracts/public-content'
import { rowInteger, rowOptionalText } from './public-row'
import { safeExternalUrl } from './public-values'

export { PUBLIC_PROFILE_LINK_COLUMNS } from '../../../db/public-content-rules'

export function readPublicProfileLinks(row: RawRow): PublicAcademicLink[] {
  const links: PublicAcademicLink[] = []
  const platforms = [
    ['orcid', 'orcid', 'ORCID'], ['personal_homepage', 'homepage', 'Homepage'],
    ['google_scholar', 'google-scholar', 'Google Scholar'], ['dblp', 'dblp', 'DBLP'],
    ['github', 'github', 'GitHub'], ['cnki', 'cnki', 'CNKI'],
  ] as const
  for (const [field, kind, label] of platforms) {
    const raw = rowOptionalText(row, field, 2048)
    const orcid = kind === 'orcid' ? raw?.replace(/^https:\/\/orcid\.org\//iu, '') : null
    const href = kind === 'orcid'
      ? orcid && /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/u.test(orcid) ? `https://orcid.org/${orcid}` : null
      : safeExternalUrl(raw)
    if (!href) continue
    const value = rowInteger(row, `${field}_value`, 0, Number.MAX_SAFE_INTEGER, true)
    links.push({ kind, label, href, value: value === null ? null : String(value) })
  }
  return links
}

export function localizedProfileLinks(links: readonly PublicAcademicLink[], locale: 'zh' | 'en'): PublicAcademicLink[] {
  return links.map(link => ({ ...link, label: link.kind === 'homepage' && locale === 'zh' ? '个人主页' : link.label }))
}
