import { parsePublicNavigationRequest } from '../../../../services/public/public-navigation-scope'
import { getQuery, setHeader } from 'h3'
import { publicListDefinition } from '../../../../../shared/utils/public-list-link'
import { PublicContentStore } from '../../../../services/public/public-content-store'
import { parsePublicListRequest } from '../../../../services/public/public-query'
import { PublicSiteError } from '../../../../services/public/errors'
import { publicHttpFailure } from '../../../../utils/public-http'
import { useDatabase } from '../../../../utils/database'

export default defineEventHandler(async event => {
  try {
    const { module, field, candidate, candidatePage, ...query } = getQuery(event)
    if (typeof module !== 'string' || !publicListDefinition(module) || typeof field !== 'string') throw new PublicSiteError('PUBLIC_INPUT', 'Invalid candidate target')
    const controls = parsePublicListRequest({ locale: query.locale, q: candidate, page: candidatePage, pageSize: 12 }, [])
    if (controls.page > 501) throw new PublicSiteError('PUBLIC_LIMIT', 'Candidate page is too deep')
    const request = await parsePublicNavigationRequest(useDatabase(event).adapter, module, query)
    // Candidate search is interaction-only: never cache across public content changes.
    setHeader(event, 'cache-control', 'no-store')
    return await new PublicContentStore(useDatabase(event).adapter).filterOptions(module, request, field, controls.search, controls.page, new Date().toISOString())
  } catch (error) { return publicHttpFailure(event, 'Public filter candidate request', error) }
})
