import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminTranslationService } from '~~/server/services/complete-admin/translation-service'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['translation', 'translation_cache'], 'edit', { write: true })
    await readBoundedJson(event, 1024)
    return await new CompleteAdminTranslationService(event, principal).testConfiguration()
  } catch (error) { mapAdminError(event, error) }
})
