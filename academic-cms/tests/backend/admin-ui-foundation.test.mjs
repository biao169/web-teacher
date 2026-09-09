import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = path => readFile(resolve(root, path), 'utf8')

const foundationFiles = [
  'app/admin/formatters.ts',
  'app/admin/complete-resource.ts',
  'app/admin/unified-list.ts',
  'app/composables/useAdminTablePreferences.ts',
  'app/components/admin/shared/AdminListShell.vue',
  'app/components/admin/shared/AdminListToolbar.vue',
  'app/components/admin/shared/AdminDataTable.vue',
  'app/components/admin/shared/AdminRowActions.vue',
  'app/components/admin/shared/AdminQuickField.vue',
  'app/components/admin/shared/AdminSelectOption.vue',
  'app/components/admin/shared/AdminEditorShell.vue',
]

test('统一后台列表与编辑器基础文件完整存在', async () => {
  await Promise.all(foundationFiles.map(path => access(resolve(root, path))))
})

test('导航与按钮经通用资源工作台接入统一列表底座', async () => {
  const [page, workspace] = await Promise.all([
    read('app/pages/admin/navigation/index.vue'),
    read('app/components/admin/complete/AdminCompleteResourceWorkspace.vue'),
  ])
  assert.match(page, /AdminCompleteResourceWorkspace/u)
  assert.match(page, /resource-key="navigation"/u)
  for (const component of ['AdminListShell', 'AdminListToolbar', 'AdminDataTable', 'AdminRowActions']) assert.match(workspace, new RegExp(component, 'u'))
  assert.doesNotMatch(workspace, /<ElTable(?:Column)?\b/u)
  assert.match(workspace, /\/api\/v1\/admin\/complete\/resource\//u)
  assert.match(workspace, /hasAdminPermission/u)
})

test('统一表格保留选择、排序、列宽拖动和横向滚动基础能力', async () => {
  const [table, styles, preferences] = await Promise.all([
    read('app/components/admin/shared/AdminDataTable.vue'),
    read('app/assets/admin/base.css'),
    read('app/composables/useAdminTablePreferences.ts'),
  ])
  assert.match(table, /type="selection"/u)
  assert.match(table, /sortable=.*custom/u)
  assert.match(table, /@header-dragend="resized"/u)
  assert.match(styles, /\.admin-unified-table-panel[^}]*overflow-x:\s*auto/su)
  assert.match(preferences, /localStorage/u)
  assert.match(preferences, /setColumnWidth/u)
})

test('内容工作台和完整资源工作台共同复用时间格式函数', async () => {
  const [contentUtilities, editor, completeWorkspace] = await Promise.all([
    read('app/admin/content-utils.ts'),
    read('app/components/admin/content/Editor.vue'),
    read('app/components/admin/complete/AdminCompleteResourceWorkspace.vue'),
  ])
  assert.match(contentUtilities, /formatAdminDateTime/u)
  assert.match(editor, /formatAdminDateTime/u)
  assert.match(completeWorkspace, /formatAdminDateTime/u)
  assert.doesNotMatch(completeWorkspace, /new Intl\.DateTimeFormat/u)
})
