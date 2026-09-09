import { getQuery } from 'h3'
import { parsePublicNavigationRequest } from '../../../../services/public/public-navigation-scope'
import { useDatabase } from '../../../../utils/database'
import { handlePublicResult } from '../../../../utils/public-http'
import { usePublicRuntime } from '../../../../utils/public-runtime'

export default defineEventHandler(event => handlePublicResult(event, 'Public projects list request', async () =>
  usePublicRuntime(event).projects.list(await parsePublicNavigationRequest(useDatabase(event).adapter, 'projects', getQuery(event)))))
