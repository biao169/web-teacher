import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminTranslationService } from '~~/server/services/complete-admin/translation-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'
export default defineEventHandler(async (event) => { try { const p = await requireAdmin(event, ['translation','translation_cache'], 'view'); return await new CompleteAdminTranslationService(event,p).overview() } catch (error) { mapAdminError(event,error) } })
