import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const read = path => readFile(resolve(root, path), 'utf8')

test('媒体库与回收站由服务端强制分流', async () => {
  const [active, trash, resource] = await Promise.all([
    read('server/api/v1/admin/complete/media/index.get.ts'),
    read('server/api/v1/admin/complete/media/trash.get.ts'),
    read('server/services/complete-admin/resource-service.ts'),
  ])
  assert.match(active, /\.list\('media',\s*\{/u)
  assert.match(active, /\.\.\.getQuery\(event\)[\s\S]*f_status:\s*'active'/u)
  assert.match(trash, /\.\.\.getQuery\(event\)[\s\S]*f_status:\s*'trash'/u)
  assert.match(resource, /queryOverride \?\? getQuery\(this\.event\)/u)
})

test('回收站复用媒体工作区并只提供回收站动作', async () => {
  const [page, workspace] = await Promise.all([
    read('app/pages/admin/media/trash/index.vue'),
    read('app/components/admin/complete/AdminCompleteMediaWorkspace.vue'),
  ])
  assert.match(page, /mode="trash"/u)
  assert.match(workspace, /props\.mode === 'trash'/u)
  assert.match(workspace, />\u6062\u590d\u5a92\u4f53</u)
  assert.match(workspace, />\u6c38\u4e45\u6e05\u7406</u)
  assert.match(workspace, /v-if="!isTrash && canEdit"[\s\S]*\u79fb\u5165\u56de\u6536\u7ad9/u)
  assert.match(workspace, /:disabled="!canTrash/u)
})

test('使用位置只消费服务端生成的可信后台路径', async () => {
  const [service, workspace] = await Promise.all([
    read('server/services/complete-admin/media-service.ts'),
    read('app/components/admin/complete/AdminCompleteMediaWorkspace.vue'),
  ])
  for (const path of ['/admin/profiles/', '/admin/publications/', '/admin/patents/', '/admin/news/editor/']) assert.match(service, new RegExp(path, 'u'))
  assert.match(service, /adminPath:\s*usageAdminPath/u)
  assert.match(workspace, /path\.startsWith\('\/admin\/'\)/u)
  assert.match(workspace, /target="_blank"/u)
  assert.match(workspace, /rel="noopener noreferrer"/u)
})

test('编辑信息同时支持保存与保存后返回', async () => {
  const workspace = await read('app/components/admin/complete/AdminCompleteMediaWorkspace.vue')
  assert.match(workspace, /@save="saveMetadata\(false\)"/u)
  assert.match(workspace, /@save-and-return="saveMetadata\(true\)"/u)
  assert.match(workspace, /expectedUpdatedAt:\s*row\.updated_at/u)
  assert.match(workspace, /details\.code === 'SQL_EXPECTED_CHANGES'/u)
})
