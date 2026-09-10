import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = path => readFile(resolve(root, path), 'utf8')

const primaryLists = [
  'app/components/admin/content/List.vue',
  'app/components/admin/complete/AdminCompleteResourceWorkspace.vue',
  'app/components/admin/complete/AdminCompleteMediaWorkspace.vue',
  'app/components/admin/complete/AdminCompleteTranslationWorkspace.vue',
  'app/components/admin/complete/AdminCompleteAuthWorkspace.vue',
  'app/components/admin/complete/AdminCompleteLogWorkspace.vue',
]

test('公共表格集中提供列头筛选、排序、多选、展开和列宽记忆', async () => {
  const table = await read('app/components/admin/shared/AdminDataTable.vue')
  assert.match(table, /@sort-change="sorted"/u)
  assert.match(table, /type="selection"/u)
  assert.match(table, /type="expand"/u)
  assert.match(table, /@header-dragend="resized"/u)
  assert.match(table, /AdminSelectOption/u)
  assert.match(table, /filter-change/u)
  assert.match(table, /admin-column-filter-trigger/u)
})

test('所有主要概览列表复用公共表格和紧凑工具栏', async () => {
  const sources = await Promise.all(primaryLists.map(read))
  for (const source of sources) {
    assert.match(source, /AdminDataTable/u)
    assert.match(source, /AdminListToolbar/u)
    assert.doesNotMatch(source, /class="admin-list-toolbar"/u)
    assert.doesNotMatch(source, /class="filters"/u)
    assert.doesNotMatch(source, /class="toolbar"/u)
  }
})

test('顶部查询区只保留一个模糊搜索输入，不再重复放置列筛选', async () => {
  const toolbar = await read('app/components/admin/shared/AdminListToolbar.vue')
  assert.equal((toolbar.match(/<ElInput\b/gu) ?? []).length, 1)
  assert.doesNotMatch(toolbar, /<ElSelect\b|filters\??:|filterValues|admin-unified-toolbar__filters/u)
  assert.match(toolbar, /role="search"/u)
  assert.match(toolbar, /type="search"/u)

  const sources = await Promise.all(primaryLists.map(read))
  for (const source of sources) {
    assert.doesNotMatch(source, /<AdminListToolbar[^>]*(?::filters|:filter-values|:filter-options)=/u)
  }
})

test('表头标题、排序和筛选保持单行且筛选按钮贴右', async () => {
  const [table, styles] = await Promise.all([
    read('app/components/admin/shared/AdminDataTable.vue'),
    read('app/assets/admin/base.css'),
  ])
  assert.match(table, /admin-column-header__label/u)
  assert.match(table, /admin-column-filter-trigger/u)
  assert.match(styles, /th\.el-table__cell > \.cell[^}]*flex-wrap:\s*nowrap/su)
  assert.match(styles, /\.admin-column-header__label[^}]*order:\s*0/su)
  assert.match(styles, /\.caret-wrapper[^}]*order:\s*1/su)
  assert.match(styles, /\.admin-column-filter-trigger[^}]*order:\s*2[^}]*margin:\s*0 0 0 auto/su)
})

test('内容和通用资源仅使用 f_ 列筛选参数，不再保留旧筛选参数分支', async () => {
  const [contentClient, contentServer, resourceClient, resourceServer, logServer] = await Promise.all([
    read('app/admin/content-utils.ts'),
    read('server/services/admin/content-query.ts'),
    read('app/components/admin/complete/AdminCompleteResourceWorkspace.vue'),
    read('server/services/complete-admin/resource-service.ts'),
    read('server/services/complete-admin/log-service.ts'),
  ])
  assert.match(contentClient, /definition\.columns/u)
  assert.match(contentServer, /definition\.columns/u)
  assert.match(resourceClient, /`f_\$\{field\.key\}`/u)
  assert.match(resourceServer, /query\[`f_\$\{field\}`\]/u)
  assert.doesNotMatch(resourceServer, /query\.mediaMime/u)
  assert.match(logServer, /f_actor_name/u)
  assert.doesNotMatch(logServer, /input\.targetUid/u)
})

test('状态类字段支持列表内快速修改且长文本信息已扩充', async () => {
  const [content, resource, resourceColumns, media, auth, definitions] = await Promise.all([
    read('app/components/admin/content/List.vue'),
    read('app/components/admin/complete/AdminCompleteResourceWorkspace.vue'),
    read('app/admin/complete-resource.ts'),
    read('app/components/admin/complete/AdminCompleteMediaWorkspace.vue'),
    read('app/components/admin/complete/AdminCompleteAuthWorkspace.vue'),
    read('shared/admin/content-modules.ts'),
  ])
  for (const source of [content, resource, auth]) assert.match(source, /AdminQuickField/u)
  assert.doesNotMatch(media, /AdminQuickField/u)
  assert.match(media, /setStatus/u)
  assert.match(content, /quickUpdate/u)
  assert.match(resource, /quickUpdate/u)
  assert.match(definitions, /column\('authors', '作者', 'long-text'/u)
  assert.match(definitions, /column\('content', '留言内容', 'long-text'/u)
  assert.match(resourceColumns, /schema\.quick \?\? schema\.batch/u)
})

test('操作列由公共函数按按钮数量和文字自适应，业务页不再硬编码宽度', async () => {
  const [table, sizing, ...sources] = await Promise.all([
    read('app/components/admin/shared/AdminDataTable.vue'),
    read('app/admin/unified-list.ts'),
    ...primaryLists.map(read),
  ])
  assert.match(table, /:width="actionColumnWidth"/u)
  assert.match(sizing, /adminActionColumnWidth/u)
  assert.match(sizing, /adminActionGridColumns/u)
  assert.match(sizing, /adminActionColumnLayout/u)
  assert.doesNotMatch(table, /actionWidth/u)
  for (const source of sources) {
    assert.match(source, /:action-labels=/u)
    assert.doesNotMatch(source, /:action-width=/u)
  }
})

test('已删除被公共实现取代的旧列表样式', async () => {
  const styles = await read('app/assets/admin/base.css')
  assert.doesNotMatch(styles, /\.admin-list-toolbar\b/u)
  assert.doesNotMatch(styles, /\.admin-table-panel\b/u)
  assert.doesNotMatch(styles, /\.admin-primary-cell\b/u)
  assert.match(styles, /\.admin-unified-toolbar[^}]*overflow-x:\s*auto/su)
  assert.match(styles, /\.admin-column-filter-trigger/u)
})
