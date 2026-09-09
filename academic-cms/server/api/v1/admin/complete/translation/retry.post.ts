import { CompleteAdminTranslationService } from '~~/server/services/complete-admin/translation-service'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['translation', 'translation_cache'], 'edit', { write: true })
    const body = await readBoundedJson(event, 64 * 1024) as { uids?: unknown }
    return await new CompleteAdminTranslationService(event, principal).retry(body.uids)
  } catch (error) { mapAdminError(event, error) }
})
