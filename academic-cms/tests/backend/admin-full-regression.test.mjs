import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const source = relative => readFile(resolve(root, relative), 'utf8')

const expected = Object.freeze([
  ['dashboard', '/admin', 'explicit'],
  ['site_settings', '/admin/settings/site', 'explicit'],
  ['global_settings', '/admin/settings/global', 'explicit'],
  ['navigation_items', '/admin/navigation', 'explicit'],
  ['profiles', '/admin/profiles', 'generic'],
  ['research_interests', '/admin/research', 'generic'],
  ['students', '/admin/students', 'generic'],
  ['student_category_displays', '/admin/student-categories', 'generic'],
  ['publications', '/admin/publications', 'generic'],
  ['projects', '/admin/projects', 'generic'],
  ['patents', '/admin/patents', 'generic'],
  ['news', '/admin/news', 'explicit'],
  ['courses', '/admin/courses', 'generic'],
  ['messages', '/admin/messages', 'generic'],
  ['media_assets', '/admin/media', 'specialist'],
  ['translation_cache', '/admin/translation', 'specialist'],
  ['auth', '/admin/auth', 'specialist'],
  ['operation_logs', '/admin/logs', 'specialist'],
  ['import_export', '/admin/import-export', 'specialist'],
])

function registryRows(text) {
  return [...text.matchAll(/^\s*\{ module: '([^']+)',[^\n]+ path: '([^']+)',[^\n]+ implemented: true \},?$/gmu)]
    .map(match => [match[1], match[2]])
}

test('侧边栏唯一注册表完整覆盖 19 个正式模块且没有重复项', async () => {
  const registry = await source('shared/admin/registry.ts')
  const rows = registryRows(registry)
  assert.equal(rows.length, expected.length)
  assert.deepEqual(rows, expected.map(([module, path]) => [module, path]))
  assert.equal(new Set(rows.map(([module]) => module)).size, rows.length)
  assert.equal(new Set(rows.map(([, path]) => path)).size, rows.length)
})

test('19 个正式路径都由显式页面或通用内容工作台承接', async () => {
  const descriptors = await source('shared/admin/content-modules.ts')
  const catchAll = await source('app/pages/admin/[...path].vue')
  assert.match(catchAll, /AdminContentWorkspace\s+v-if="contentRoute"/u)
  assert.match(catchAll, /AdminModulePlaceholder\s+v-else-if="selected"/u)

  const explicitPages = new Map([
    ['/admin', 'app/pages/admin/index.vue'],
    ['/admin/settings/site', 'app/pages/admin/settings/site/index.vue'],
    ['/admin/settings/global', 'app/pages/admin/settings/global/index.vue'],
    ['/admin/navigation', 'app/pages/admin/navigation/index.vue'],
    ['/admin/news', 'app/pages/admin/news/index.vue'],
    ['/admin/media', 'app/pages/admin/media/index.vue'],
    ['/admin/translation', 'app/pages/admin/translation/index.vue'],
    ['/admin/auth', 'app/pages/admin/auth/index.vue'],
    ['/admin/logs', 'app/pages/admin/logs/index.vue'],
    ['/admin/import-export', 'app/pages/admin/import-export/index.vue'],
  ])
  for (const [module, path, kind] of expected) {
    if (kind !== 'generic') {
      await access(resolve(root, explicitPages.get(path)))
      continue
    }
    assert.match(descriptors, new RegExp(`module: '${module}'[\\s\\S]{0,180}path: '${path.replaceAll('/', '\\/')}'`, 'u'))
  }
})

test('列表、新建、编辑、删除、批量更新按钮均有服务端处理入口', async () => {
  const genericRoutes = [
    'server/routes/api/v1/admin/content/[module]/index.get.ts',
    'server/routes/api/v1/admin/content/[module]/index.post.ts',
    'server/routes/api/v1/admin/content/[module]/[uid].get.ts',
    'server/routes/api/v1/admin/content/[module]/[uid].patch.ts',
    'server/routes/api/v1/admin/content/[module]/[uid].delete.ts',
    'server/routes/api/v1/admin/content/[module]/batch.patch.ts',
  ]
  for (const route of genericRoutes) await access(resolve(root, route))

  const list = await source('app/components/admin/content/List.vue')
  const editor = await source('app/components/admin/content/Editor.vue')
  assert.match(list, /definition\.canCreate/u)
  assert.match(list, /\/api\/v1\/admin\/content\/\$\{props\.definition\.module\}/u)
  assert.match(list, /\/batch/u)
  assert.match(editor, /method:\s*'POST'/u)
  assert.match(editor, /method:\s*'PATCH'/u)
  assert.match(editor, /method:\s*'DELETE'/u)
})

test('显式资源页和五个专项页都挂载真实工作台及对应 API', async () => {
  const surfaces = [
    ['app/pages/admin/settings/site/index.vue', 'AdminCompleteResourceWorkspace', 'server/api/v1/admin/complete/resource/[resource]/index.get.ts'],
    ['app/pages/admin/settings/global/index.vue', 'AdminCompleteResourceWorkspace', 'server/api/v1/admin/complete/resource/[resource]/index.post.ts'],
    ['app/pages/admin/navigation/index.vue', 'AdminCompleteResourceWorkspace', 'server/api/v1/admin/complete/resource/[resource]/batch.patch.ts'],
    ['app/pages/admin/news/index.vue', 'AdminCompleteResourceWorkspace', 'server/api/v1/admin/complete/news/[uid]/rich-text.patch.ts'],
    ['app/pages/admin/media/index.vue', 'AdminCompleteMediaWorkspace', 'server/api/v1/admin/complete/media/stats.get.ts'],
    ['app/pages/admin/translation/index.vue', 'AdminCompleteTranslationWorkspace', 'server/api/v1/admin/complete/translation/overview.get.ts'],
    ['app/pages/admin/auth/index.vue', 'AdminCompleteAuthWorkspace', 'server/api/v1/admin/complete/auth/overview.get.ts'],
    ['app/pages/admin/logs/index.vue', 'AdminCompleteLogWorkspace', 'server/api/v1/admin/complete/logs/index.get.ts'],
    ['app/pages/admin/import-export/index.vue', 'AdminCompleteTransferWorkspace', 'server/api/v1/admin/complete/import-export/export.post.ts'],
  ]
  for (const [page, component, route] of surfaces) {
    assert.match(await source(page), new RegExp(component, 'u'), page)
    await access(resolve(root, route))
  }
})

test('权限导航、页面守卫和连通性接口复用正式注册表', async () => {
  const shell = await source('app/composables/useAdminShell.ts')
  const navigationApi = await source('server/api/v1/admin/navigation.get.ts')
  const middleware = await source('app/middleware/admin-auth.global.ts')
  const capabilities = await source('server/api/v1/admin/capabilities.get.ts')
  assert.match(shell, /visibleAdminNavigation/u)
  assert.match(navigationApi, /requireAdmin\(event, AUTH_MODULES, 'view'\)/u)
  assert.match(middleware, /adminModuleForPath/u)
  assert.match(middleware, /hasAdminPermission/u)
  assert.match(capabilities, /ADMIN_MODULES\.map/u)
  assert.match(capabilities, /requireAdmin\(event, \['dashboard'\], 'view'\)/u)
})

test('权限不足统一保留 403 并显示权限弹窗', async () => {
  const serverGuard = await source('server/utils/complete-admin/auth.ts')
  const parser = await source('app/admin/errors.ts')
  const feedback = await source('app/admin/permission-feedback.ts')
  const middleware = await source('app/middleware/admin-auth.global.ts')
  const api = await source('app/composables/useCompleteAdminApi.ts')
  const runtime = await source('app/plugins/admin-runtime.client.ts')
  assert.match(serverGuard, /fail\(event, 403, 'PERMISSION_DENIED'/u)
  assert.match(parser, /record\(payload\?\.data\)\?\.error/u)
  assert.match(feedback, /ElMessageBox\.alert\(message, '权限不足'/u)
  assert.match(middleware, /denyPermission\(selected\.module\)/u)
  assert.match(api, /status === 403.*showAdminPermissionDenied/u)
  assert.match(runtime, /detail\.status === 403[\s\S]{0,240}showAdminPermissionDenied/u)
})

test('Element Plus 模板组件全部使用 PascalCase 并显式导入', async () => {
  const appRoot = resolve(root, 'app')
  const files = (await readdir(appRoot, { recursive: true })).filter(file => file.endsWith('.vue'))
  for (const file of files) {
    const text = await readFile(resolve(appRoot, file), 'utf8')
    assert.doesNotMatch(text, /<\/?el-[a-z0-9-]+/u, `${file} 不能依赖未注册的小写 Element Plus 标签`)
    const tags = [...new Set([...text.matchAll(/<\/?(El[A-Z][A-Za-z0-9]*)\b/gu)].map(match => match[1]))]
    if (!tags.length) continue
    const imports = [...text.matchAll(/import\s*\{([\s\S]*?)\}\s*from '(?:element-plus|~\/admin\/element-plus-ts6)'/gu)].map(match => match[1]).join(',')
    for (const tag of tags) assert.match(imports, new RegExp(`\\b${tag}\\b`, 'u'), `${file} 缺少 ${tag} 显式导入`)
  }
})

test('历史兼容路由及归一化中间件已物理删除', async () => {
  const removed = ['site-settings','global-settings','navigation-items','media-library','translation-cache','translations','operation-logs','users','roles','permissions','backup','research-interests','student-category-displays']
  for (const name of removed) await assert.rejects(access(resolve(root, `app/pages/admin/${name}/index.vue`)))
  await assert.rejects(access(resolve(root, 'app/shared/admin/route-aliases.ts')))
  await assert.rejects(access(resolve(root, 'app/middleware/00-admin-canonical.global.ts')))
})

test('公开富文本不再通过 v-html 执行存储内容', async () => {
  const blocks = await source('app/components/public/content/ContentBlocks.vue')
  const renderer = await source('app/components/public/content/RichHtml.vue')
  assert.doesNotMatch(blocks, /\bv-html\b/u)
  assert.match(blocks, /PublicContentRichHtml/u)
  assert.match(renderer, /const TAGS = new Set/u)
  assert.match(renderer, /safeHref/u)
  assert.match(renderer, /safeImageSource/u)
  assert.doesNotMatch(renderer, /innerHTML|DOMParser|v-html/u)
})

test('完整后台数据库入口复用平台适配器且不会把原生 SQLite 打进 Worker', async () => {
  const database = await source('server/utils/complete-admin/db.ts')
  assert.match(database, /getPlatformDatabase/u)
  assert.match(database, /database\.execute\(read\(/u)
  assert.match(database, /database\.batch\(/u)
  assert.doesNotMatch(database, /better-sqlite3|node:fs|node:path|resolveD1|resolveSqlite/u)
})

test('H3 长错误说明使用 message 而不是 statusMessage', async () => {
  const files = [
    'server/utils/public-http.ts',
    'app/composables/usePublicResource.ts',
    'app/pages/zh/index.vue',
    'app/pages/en/index.vue',
  ]
  for (const file of files) {
    const text = await source(file)
    assert.doesNotMatch(text, /statusMessage:\s*['"](?:Public|Invalid)/u, file)
    assert.match(text, /(?:message\s*:|\{[^}]*\bmessage\b[^}]*\})/u, file)
  }
})
