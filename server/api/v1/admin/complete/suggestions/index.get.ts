import { getQuery } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminTranslationService } from '~~/server/services/complete-admin/translation-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

const PERMISSION_MODULES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  profiles: ['profiles'],
  publications: ['publications'],
  projects: ['projects'],
  patents: ['patents'],
  students: ['students'],
  student_category_displays: ['student_category_displays'],
  news: ['news'],
  courses: ['courses'],
  media_assets: ['media_assets', 'media'],
})

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const module = String(query.module ?? '')
    const permissions = PERMISSION_MODULES[module]
    if (!permissions) throw new Error('SUGGESTION_FIELD_NOT_ALLOWED')
    const principal = await requireAdmin(event, permissions, 'view')
    return await new CompleteAdminTranslationService(event, principal).suggestions(module, query.field, query.q)
  }
  catch (error) { mapAdminError(event, error) }
})
