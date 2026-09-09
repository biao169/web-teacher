import { AdminContentService } from '../../../../../../services/admin/content-service'
import { ADMIN_CONTENT_MUTATION_BODY_LIMIT, adminContentUid, defineAdminContentWriteHandler } from '../../../../../../utils/admin-content-handler'
import { useDatabase } from '../../../../../../utils/database'

export default defineAdminContentWriteHandler('edit', async (event, context, body) => {
  const database = useDatabase(event)
  return new AdminContentService(database.adapter, context.session.principal).update(context.module, adminContentUid(event), body)
}, ADMIN_CONTENT_MUTATION_BODY_LIMIT)
