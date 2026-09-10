import { AdminContentService } from '../../../../../../services/admin/content-service'
import { ADMIN_CONTENT_BATCH_BODY_LIMIT, defineAdminContentWriteHandler } from '../../../../../../utils/admin-content-handler'
import { useDatabase } from '../../../../../../utils/database'

export default defineAdminContentWriteHandler('edit', async (event, context, body) => {
  const database = useDatabase(event)
  return new AdminContentService(database.adapter, context.session.principal).batchUpdate(context.module, body)
}, ADMIN_CONTENT_BATCH_BODY_LIMIT)
