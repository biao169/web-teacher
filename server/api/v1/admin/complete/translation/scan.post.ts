import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminTranslationService } from '~~/server/services/complete-admin/translation-service'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'

interface TranslationScanBody { limit?: unknown; cursor?: unknown }

function scanBody(value: unknown): TranslationScanBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SCAN_REQUEST')
  return value as TranslationScanBody
}

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['translation', 'translation_cache'], 'edit', { write: true })
    const body = scanBody(await readBoundedJson(event, 16 * 1024))
    return await new CompleteAdminTranslationService(event, principal).scan(body.limit, body.cursor)
  } catch (error) {
    mapAdminError(event, error)
  }
})
