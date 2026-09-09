import { getQuery } from 'h3'
import { parsePublicLocaleQuery } from '../../../../services/public/public-query'
import { handlePublicResult } from '../../../../utils/public-http'
import { usePublicRuntime } from '../../../../utils/public-runtime'

export default defineEventHandler(event => handlePublicResult(event, 'Public shell request', () => {
  return usePublicRuntime(event).shell.shell(parsePublicLocaleQuery(getQuery(event)))
}))
