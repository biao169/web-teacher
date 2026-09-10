import { getQuery, setHeader } from 'h3'
import { parsePublicSelectionRequest, readPublicSelection } from '../../../../services/public/public-selection'
import { publicHttpFailure } from '../../../../utils/public-http'
import { usePublicRuntime } from '../../../../utils/public-runtime'

export default defineEventHandler(async event => {
  setHeader(event, 'cache-control', 'private, no-store, max-age=0')
  setHeader(event, 'x-content-type-options', 'nosniff')
  try {
    const request = parsePublicSelectionRequest(getQuery(event))
    const service = usePublicRuntime(event)[request.module]
    return await readPublicSelection(request, query => service.list(query))
  } catch (error) { return publicHttpFailure(event, 'Public selection request', error) }
})
