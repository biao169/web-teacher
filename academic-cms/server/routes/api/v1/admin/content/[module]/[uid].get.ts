import { AdminContentService } from '../../../../../../services/admin/content-service'
import { adminContentUid, defineAdminContentReadHandler } from '../../../../../../utils/admin-content-handler'
import { useDatabase } from '../../../../../../utils/database'

export default defineAdminContentReadHandler('view', async (event, context) => {
  const database = useDatabase(event)
  return new AdminContentService(database.adapter, context.session.principal).detail(context.module, adminContentUid(event))
})
