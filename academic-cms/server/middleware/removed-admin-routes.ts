import { createError, getRequestURL } from 'h3'

const REMOVED_ADMIN_ROUTES = new Set([
  '/admin/site-settings',
  '/admin/global-settings',
  '/admin/navigation-items',
  '/admin/media-library',
  '/admin/translation-cache',
  '/admin/translations',
  '/admin/operation-logs',
  '/admin/users',
  '/admin/roles',
  '/admin/permissions',
  '/admin/backup',
  '/admin/research-interests',
  '/admin/student-category-displays',
])

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/u, '') || '/'
  const removedNewsEditor = pathname.startsWith('/admin/news/') && !/^\/admin\/news\/editor\/[^/]+$/u.test(pathname)
  if (!REMOVED_ADMIN_ROUTES.has(pathname) && !removedNewsEditor) return
  throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '该旧版后台入口已删除，请使用当前侧边栏中的正式入口。' })
})
