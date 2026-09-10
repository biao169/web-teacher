import { getQuery, getRouterParam } from 'h3'
import { parsePublicLocaleQuery } from '../../../../../services/public/public-query'
import { handlePublicResult } from '../../../../../utils/public-http'
import { usePublicRuntime } from '../../../../../utils/public-runtime'

export default defineEventHandler(event => handlePublicResult(event, 'Public research detail request', () => {
  return usePublicRuntime(event).research.detail(parsePublicLocaleQuery(getQuery(event)), getRouterParam(event, 'uid', { decode: true }) ?? '')
}))
