import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const exists = (relative) => fs.existsSync(path.join(root, relative))
const walk = (dir) => {
  const absolute = path.join(root, dir)
  if (!fs.existsSync(absolute)) return []
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(child) : [child]
  })
}

const features = [
  ['dashboard', '/admin', 'dashboard', null],
  ['site-settings', '/admin/settings/site', 'site_settings', 'site_settings'],
  ['global-settings', '/admin/settings/global', 'global_settings', 'global_settings'],
  ['navigation', '/admin/navigation', 'navigation_items', 'navigation_items'],
  ['profiles', '/admin/profiles', 'profiles', 'profiles'],
  ['research', '/admin/research', 'research_interests', 'research_interests'],
  ['publications', '/admin/publications', 'publications', 'publications'],
  ['projects', '/admin/projects', 'projects', 'projects'],
  ['patents', '/admin/patents', 'patents', 'patents'],
  ['students', '/admin/students', 'students', 'students'],
  ['student-categories', '/admin/student-categories', 'student_category_displays', 'student_category_displays'],
  ['news', '/admin/news', 'news', 'news'],
  ['courses', '/admin/courses', 'courses', 'courses'],
  ['messages', '/admin/messages', 'messages', 'messages'],
  ['media', '/admin/media', 'media_assets', 'media_assets'],
  ['translation', '/admin/translation', 'translation_cache', 'translation_cache'],
  ['auth', '/admin/auth', 'auth', 'auth_users'],
  ['logs', '/admin/logs', 'operation_logs', 'operation_logs'],
  ['import-export', '/admin/import-export', 'import_export', null],
]

const appSources = walk('app').filter((file) => /\.(vue|ts|tsx|js|mjs)$/.test(file))
const serverSources = walk('server').filter((file) => /\.(ts|js|mjs)$/.test(file))
const migrationSources = walk('migrations').filter((file) => file.endsWith('.sql'))
const appText = appSources.map(read).join('\n')
const serverText = serverSources.map(read).join('\n')
const migrationText = migrationSources.map(read).join('\n')

function routeEvidence(route) {
  if (route === '/admin') return exists('app/pages/admin/index.vue')
  const rel = route.slice('/admin/'.length)
  return exists(`app/pages/admin/${rel}.vue`)
    || exists(`app/pages/admin/${rel}/index.vue`)
    || exists('app/pages/admin/[...path].vue')
}

function apiEvidence(key) {
  if (['dashboard', 'import-export'].includes(key)) {
    return serverText.includes(key === 'dashboard' ? 'dashboard' : 'import-export')
      || serverText.includes(key === 'dashboard' ? 'Dashboard' : 'backup')
  }
  if (['media','translation','auth','logs'].includes(key)) return serverText.includes(key)
  return serverText.includes('admin/content') || serverText.includes('AdminContent')
}

test('每个后台功能具有页面、权限和 API 证据', () => {
  for (const [key, route, permission, table] of features) {
    assert.equal(routeEvidence(route), true, `${key}: missing page route`)
    assert.equal(appText.includes(permission) || serverText.includes(permission), true, `${key}: missing permission mapping`)
    assert.equal(apiEvidence(key), true, `${key}: missing API/service evidence`)
    if (table) assert.equal(migrationText.includes(table), true, `${key}: missing database table evidence`)
  }
})

test('后台正式页面不包含未接通占位内容', () => {
  const allowed = new Set([
    'app/pages/admin/not-found.vue',
    'app/pages/admin/unavailable.vue',
  ])
  const pattern = /(功能待补充|尚未实现|coming\s+soon|TODO:\s*implement|空页面)/i
  for (const file of appSources.filter((file) => file.startsWith('app/pages/admin/'))) {
    if (allowed.has(file)) continue
    assert.equal(pattern.test(read(file)), false, `${file}: placeholder copy`)
  }
})

test('后台仅保留正式路由，不再提供历史兼容页面', () => {
  for (const alias of ['translations','media-library','users','backup','site-settings','global-settings','navigation-items']) {
    assert.equal(exists(`app/pages/admin/${alias}/index.vue`), false, alias)
  }
  assert.equal(exists('app/middleware/00-admin-canonical.global.ts'), false)
  assert.equal(exists('app/shared/admin/route-aliases.ts'), false)
})

test('翻译建议响应同时支持 values 与兼容字段', () => {
  const suggestionSources = [...appSources, ...serverSources]
    .filter((file) => /suggest/i.test(file))
    .map(read)
    .join('\n')
  assert.match(suggestionSources, /values/)
  assert.match(suggestionSources, /(items|suggestions)/)
})

test('0008 完整性迁移存在且包含三项唯一约束', () => {
  const sql = read('migrations/0008_complete_admin_integrity.sql')
  assert.match(sql, /auth_permissions\(role_uid, module\)/)
  assert.match(sql, /auth_users\(username COLLATE NOCASE\)/)
  assert.match(sql, /site_settings\(is_active\)/)
})

test('后台 Vue 页面不使用不受控 v-html', () => {
  for (const file of appSources.filter((file) => file.startsWith('app/pages/admin/') || file.startsWith('app/components/admin/'))) {
    assert.equal(read(file).includes('v-html'), false, `${file}: v-html is forbidden`)
  }
})
