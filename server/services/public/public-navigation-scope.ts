import type { DatabaseAdapter } from '../../../db/contracts'
import { read } from '../../../db/query'
import { publicFilterKeys, publicListDefinition } from '../../../shared/utils/public-list-link'
import { resolvePublicNavigation } from '../../../shared/utils/public-path'
import { parsePublicListRequest, parsePublicLocale } from './public-query'
import { rowOptionalText, rowRequiredText } from './public-row'
import { PublicSiteError } from './errors'

export async function parsePublicNavigationRequest(adapter: DatabaseAdapter, module: string, input: Readonly<Record<string, unknown>>) {
  const { nav, ...query } = input
  const allowed = publicFilterKeys(module)
  const routeFilters: Readonly<Record<string, string>> = module === 'publications/featured' ? { featured: '1' } : {}
  if (nav === undefined) return parsePublicListRequest(query, allowed, { fixedFilters: routeFilters })
  if (typeof nav !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(nav)) throw new PublicSiteError('PUBLIC_INPUT', 'Invalid navigation scope')
  const locale = parsePublicLocale(query.locale)
  const result = await adapter.execute(read(`SELECT uid, updated_at, title, title_en, kind, url_name, path, fragment
    FROM navigation_items WHERE uid = ? AND visibility = 'public' AND enabled = 1 LIMIT 1`, [nav]))
  const row = result.rows[0]
  if (!row) throw new PublicSiteError('PUBLIC_NOT_FOUND', 'This navigation scope is no longer available')
  let target
  try {
    target = resolvePublicNavigation({ kind: rowOptionalText(row, 'kind', 128), urlName: rowOptionalText(row, 'url_name', 256),
      path: rowOptionalText(row, 'path', 2048), fragment: rowOptionalText(row, 'fragment', 128) }, locale)
  } catch { throw new PublicSiteError('PUBLIC_NOT_FOUND', 'This navigation scope is no longer available') }
  if (!target || target.external) throw new PublicSiteError('PUBLIC_INPUT', 'Navigation scope must be an internal list')
  const url = new URL(target.href, 'https://public.invalid')
  if (publicListDefinition(url.pathname)?.module !== module) throw new PublicSiteError('PUBLIC_INPUT', 'Navigation scope belongs to another list')
  const base = parsePublicListRequest({ ...Object.fromEntries(url.searchParams), locale }, allowed, { fixedFilters: routeFilters })
  if (!base.search && !Object.keys(base.filters).length) throw new PublicSiteError('PUBLIC_INPUT', 'Navigation does not define a filter scope')
  const request = parsePublicListRequest(query, allowed, { fixedFilters: base.filters })
  return { ...request, scope: {
    uid: nav, label: (locale === 'en' ? rowOptionalText(row, 'title_en', 2048) : null) || rowRequiredText(row, 'title', 2048),
    revision: rowRequiredText(row, 'updated_at', 128), filters: base.filters, search: base.search,
  } }
}
