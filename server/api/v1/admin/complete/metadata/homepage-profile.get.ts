import { CompleteAdminMetadataService } from '~~/server/services/complete-admin/metadata-service'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, ['publications'], 'edit')
    return await new CompleteAdminMetadataService(event).homepageProfile()
  }
  catch (error) { mapAdminError(event, error) }
})
