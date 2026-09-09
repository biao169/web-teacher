import { getQuery } from 'h3'
import { parsePublicNavigationRequest } from '../../../../services/public/public-navigation-scope'
import { useDatabase } from '../../../../utils/database'
import { handlePublicResult } from '../../../../utils/public-http'
import { usePublicRuntime } from '../../../../utils/public-runtime'

export default defineEventHandler(event => handlePublicResult(event, 'Public publications list request', async () =>
  usePublicRuntime(event).publications.list(await parsePublicNavigationRequest(useDatabase(event).adapter, 'publications', getQuery(event)))))
