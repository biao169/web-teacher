import { AdminContentService } from '../../../../../../services/admin/content-service'
import { adminContentUid, defineAdminContentWriteHandler } from '../../../../../../utils/admin-content-handler'
import { useDatabase } from '../../../../../../utils/database'

export default defineAdminContentWriteHandler('delete', async (event, context, body) => {
  const database = useDatabase(event)
  return new AdminContentService(database.adapter, context.session.principal).delete(context.module, adminContentUid(event), body)
})
