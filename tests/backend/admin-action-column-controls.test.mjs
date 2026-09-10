import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = path => readFile(resolve(root, path), 'utf8')

test('操作列由文字宽度决定单行或双行，并保持固定在最右侧', async () => {
  const [sizing, table, styles] = await Promise.all([
    read('app/admin/unified-list.ts'),
    read('app/components/admin/shared/AdminDataTable.vue'),
    read('app/assets/admin/base.css'),
  ])
  assert.match(sizing, /labels\.length > 3 && singleRowWidth > maxWidth/u)
  assert.match(sizing, /rows: useTwoRows \? 2 : 1/u)
  assert.match(sizing, /ADMIN_ACTION_COLUMN_MAX_WIDTH = 280/u)
  assert.match(table, /adminActionColumnLayout\(props\.actionLabels\)/u)
  assert.match(table, /props\.fixedActions \? 'right'/u)
  assert.match(table, /--admin-action-rows/u)
  assert.match(styles, /white-space:\s*nowrap/u)
})

test('内容列表为可删除资源提供编辑与删除，并为留言提供处理与复制邮箱', async () => {
  const source = await read('app/components/admin/content/List.vue')
  assert.match(source, /const canDelete = computed/u)
  assert.match(source, /primaryActionLabel/u)
  assert.match(source, /definition\.module === 'messages'/u)
  assert.match(source, /复制邮箱/u)
  assert.match(source, /navigator\.clipboard\.writeText\(email\)/u)
  assert.match(source, /method: 'DELETE'/u)
  assert.match(source, /expectedUpdatedAt: item\.updatedAt/u)
  assert.match(source, /ElMessageBox\.confirm/u)
})

test('只读日志和翻译缓存均提供至少两个有意义的直接动作', async () => {
  const [logs, translation] = await Promise.all([
    read('app/components/admin/complete/AdminCompleteLogWorkspace.vue'),
    read('app/components/admin/complete/AdminCompleteTranslationWorkspace.vue'),
  ])
  assert.match(logs, /:action-labels="\['查看', '复制标识'\]"/u)
  assert.match(logs, /navigator\.clipboard\.writeText\(identifier\)/u)
  assert.match(translation, /:action-labels="\['人工修订', '失效', '重试'\]"/u)
  assert.match(translation, /function invalidateRow/u)
  assert.match(translation, /translation\/invalidate/u)
  assert.match(translation, /type="danger"[^>]*@click="invalidateRow/u)
})

test('用户三个动作保持直接展示，角色保留编辑和删除', async () => {
  const source = await read('app/components/admin/complete/AdminCompleteAuthWorkspace.vue')
  assert.match(source, /:action-labels="\['编辑', '会话', '重置密码'\]"/u)
  assert.match(source, /:action-labels="\['编辑', '删除'\]"/u)
  assert.match(source, />重置密码<\/ElButton>/u)
  assert.match(source, />删除<\/ElButton>/u)
})
