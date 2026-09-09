import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const source = relative => readFile(resolve(root, relative), 'utf8')

test('后台面包屑由注册表集中生成并接收当前权限主体', async () => {
  const [registry, shell] = await Promise.all([
    source('shared/admin/registry.ts'),
    source('app/composables/useAdminShell.ts'),
  ])
  for (const path of ['/admin/settings/site', '/admin/profiles', '/admin/publications', '/admin/news', '/admin/media', '/admin/auth']) {
    assert.match(registry, new RegExp(`path: '${path.replaceAll('/', '\\/')}'`, 'u'), path)
  }
  assert.match(registry, /adminGroupLandingPath/u)
  assert.match(registry, /hasAdminPermission\(user, item\.module, 'view'\)/u)
  assert.match(shell, /adminBreadcrumbs\(route\.fullPath, user\.value\)/u)
})

test('专项子页与页内编辑状态均有独立的末级面包屑', async () => {
  const registry = await source('shared/admin/registry.ts')
  for (const path of ['/admin/publications/metadata', '/admin/patents/metadata', '/admin/translation/suggestions', '/admin/media/trash']) {
    assert.match(registry, new RegExp(`'${path.replaceAll('/', '\\/')}'`, 'u'), path)
  }
  assert.match(registry, /\/admin\\\/news\\\/editor/u)
  for (const label of ['元数据工具', '历史值建议', '回收站', '富文本编辑', '人工修订', '日志详情']) assert.match(registry, new RegExp(label, 'u'))
  assert.match(registry, /safeRouteRecordKey/u)
})

test('面包屑组件只给最后当前项设置 aria-current，中间项使用站内链接', async () => {
  const breadcrumbs = await source('app/components/admin/Breadcrumbs.vue')
  assert.match(breadcrumbs, /<NuxtLink v-if="item\.to" :to="item\.to">/u)
  assert.match(breadcrumbs, /<span v-else aria-current="page">/u)
  assert.doesNotMatch(breadcrumbs, /href="\/admin/u)
})
