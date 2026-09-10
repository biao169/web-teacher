import { getQuery, getRouterParam } from 'h3'
import { parsePublicLocaleQuery } from '../../../../../services/public/public-query'
import { handlePublicResult } from '../../../../../utils/public-http'
import { usePublicRuntime } from '../../../../../utils/public-runtime'

export default defineEventHandler(event => handlePublicResult(event, 'Public courses detail request', () => {
  return usePublicRuntime(event).courses.detail(parsePublicLocaleQuery(getQuery(event)), getRouterParam(event, 'uid', { decode: true }) ?? '')
}))
