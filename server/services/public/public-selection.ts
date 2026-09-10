import { isPublicCitationStyle } from '../../../shared/contracts/public-citation'
import type { PublicListViewModel } from '../../../shared/contracts/public-content'
import { PUBLIC_SELECTION_BATCH_SIZE, publicSelectableModule, type PublicSelectionBatch, type PublicSelectionItem, type PublicSelectionRequest } from '../../../shared/contracts/public-selection'
import { PublicSiteError } from './errors'
import { parsePublicLocale, type PublicListRequest } from './public-query'
import type { PublicServiceResult } from './public-result'
import { safeRecordIdentifier } from './public-values'

/** This read-only route accepts only a module, language and a small exact UID set. */
export function parsePublicSelectionRequest(query: Readonly<Record<string, unknown>>): PublicSelectionRequest {
  if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).some(key => !['module', 'locale', 'uid', 'citationStyle'].includes(key))) throw new PublicSiteError('PUBLIC_INPUT', 'Invalid selection request')
  const module = typeof query.module === 'string' ? publicSelectableModule(query.module) : null
  if (!module) throw new PublicSiteError('PUBLIC_INPUT', 'This module does not support selection')
  if (query.citationStyle !== undefined && (module !== 'publications' || !isPublicCitationStyle(query.citationStyle))) throw new PublicSiteError('PUBLIC_INPUT', 'Invalid citation style')
  const citationStyle = module === 'publications' ? (query.citationStyle ?? 'gbt') as 'gbt' | 'elsevier' | 'apa' | 'ieee' : undefined
  const locale = parsePublicLocale(query.locale)
  const values = Array.isArray(query.uid) ? query.uid : [query.uid]
  if (!values.length || values.length > PUBLIC_SELECTION_BATCH_SIZE) throw new PublicSiteError('PUBLIC_LIMIT', 'Selection batch is too large or empty')
  const uids = values.map(value => {
    if (typeof value !== 'string') throw new PublicSiteError('PUBLIC_INPUT', 'Invalid selected UID')
    return safeRecordIdentifier(value)
  })
  if (new Set(uids).size !== uids.length) throw new PublicSiteError('PUBLIC_INPUT', 'Repeated selected UID')
  return { module, locale, uids, ...(citationStyle ? { citationStyle } : {}) }
}

export async function readPublicSelection(
  request: PublicSelectionRequest,
  load: (query: PublicListRequest) => Promise<PublicServiceResult<PublicListViewModel<PublicSelectionItem>>>,
): Promise<PublicSelectionBatch> {
  // Revalidate even internal callers. No user filters or page offset may change the selected set.
  request = parsePublicSelectionRequest({ module: request.module, locale: request.locale, uid: request.uids, ...(request.citationStyle ? { citationStyle: request.citationStyle } : {}) })
  const result = await load({ locale: request.locale, page: 1, pageSize: 12, search: null, filters: {}, selectedUids: request.uids, ...(request.citationStyle ? { citationStyle: request.citationStyle } : {}) })
  const model = result.viewModel
  if (model.module !== request.module || model.locale !== request.locale) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Selection module mismatch')
  const requested = new Set(request.uids)
  const found = new Set(model.items.map(item => item.uid))
  if (found.size !== model.items.length || model.items.some(item => !requested.has(item.uid))) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Selection membership mismatch')
  return {
    schemaVersion: 1, ...request, generatedAt: model.generatedAt, revision: model.revision, totalPublic: model.totalPublic,
    items: model.items, unavailableUids: request.uids.filter(uid => !found.has(uid)),
  }
}
