import { getQuery, getRouterParam } from 'h3'
import { parsePublicLocaleQuery } from '../../../../../services/public/public-query'
import { handlePublicResult } from '../../../../../utils/public-http'
import { usePublicRuntime } from '../../../../../utils/public-runtime'

export default defineEventHandler(event => handlePublicResult(event, 'Public publications detail request', () => {
  return usePublicRuntime(event).publications.detail(parsePublicLocaleQuery(getQuery(event)), getRouterParam(event, 'uid', { decode: true }) ?? '')
}))
