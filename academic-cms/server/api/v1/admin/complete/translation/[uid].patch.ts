import { getRouterParam } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminTranslationService } from '~~/server/services/complete-admin/translation-service'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'

interface ManualTranslationBody {
  translatedText?: unknown
  expectedUpdatedAt?: unknown
}

function manualBody(value: unknown): ManualTranslationBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_MANUAL_TRANSLATION_REQUEST')
  return value as ManualTranslationBody
}

export default defineEventHandler(async (event) => {
  try {
    const principal = await requireAdmin(event, ['translation', 'translation_cache'], 'edit', { write: true })
    const body = manualBody(await readBoundedJson(event))
    const record = await new CompleteAdminTranslationService(event, principal).manual(
      getRouterParam(event, 'uid'), body.translatedText, body.expectedUpdatedAt,
    )
    return { record }
  } catch (error) {
    mapAdminError(event, error)
  }
})
