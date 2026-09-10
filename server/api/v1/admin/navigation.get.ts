import { AUTH_MODULES } from '~~/shared/enums/auth'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { resolveAdminDatabase } from '~~/server/utils/complete-admin/db'
import { mapAdminError } from '~~/server/utils/complete-admin/api'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, AUTH_MODULES, 'view')
    const db = await resolveAdminDatabase(event)
    const rows = await db.all<Record<string, unknown>>(`SELECT uid, title, path, url_name, sort_order
      FROM navigation_items
      WHERE location = 'admin-sidebar' AND enabled = 1 AND visibility IN ('public', 'authenticated', 'staff')
      ORDER BY sort_order ASC, id ASC LIMIT 50`)
    return {
      items: rows.map(row => ({
        uid: String(row.uid ?? ''),
        title: String(row.title ?? ''),
        path: row.path == null ? null : String(row.path),
        urlName: row.url_name == null ? null : String(row.url_name),
        sortOrder: Number(row.sort_order ?? 0),
      })),
    }
  }
  catch (error) { mapAdminError(event, error) }
})
