import { getQuery } from 'h3'
import { AdminContentService } from '../../../../../../services/admin/content-service'
import { projectAdminContentListMedia } from '../../../../../../services/admin/content-list-media'
import { parseAdminContentQuery } from '../../../../../../services/admin/content-query'
import { defineAdminContentReadHandler } from '../../../../../../utils/admin-content-handler'
import { useDatabase } from '../../../../../../utils/database'

export default defineAdminContentReadHandler('view', async (event, context) => {
  const database = useDatabase(event)
  const query = parseAdminContentQuery(context.definition, getQuery(event) as Record<string, unknown>)
  const view = await new AdminContentService(database.adapter, context.session.principal).list(context.module, query)
  return projectAdminContentListMedia(event, context.definition, view, context.session.principal)
})
