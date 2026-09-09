import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminTranslationService } from '~~/server/services/complete-admin/translation-service'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['translation', 'translation_cache'], 'edit', { write: true })
    return await new CompleteAdminTranslationService(event, principal).run(await readBoundedJson(event, 64 * 1024))
  } catch (error) { mapAdminError(event, error) }
})
