import { getQuery } from 'h3'
import { parsePublicNavigationRequest } from '../../../../services/public/public-navigation-scope'
import { useDatabase } from '../../../../utils/database'
import { handlePublicResult } from '../../../../utils/public-http'
import { usePublicRuntime } from '../../../../utils/public-runtime'

export default defineEventHandler(event => handlePublicResult(event, 'Public patents list request', async () =>
  usePublicRuntime(event).patents.list(await parsePublicNavigationRequest(useDatabase(event).adapter, 'patents', getQuery(event)))))
