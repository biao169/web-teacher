import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = path => readFile(resolve(root, path), 'utf8')

const overviewWorkspaces = [
  'app/components/admin/content/List.vue',
  'app/components/admin/complete/AdminCompleteMediaWorkspace.vue',
  'app/components/admin/complete/AdminCompleteTranslationWorkspace.vue',
  'app/components/admin/complete/AdminCompleteAuthWorkspace.vue',
  'app/components/admin/complete/AdminCompleteLogWorkspace.vue',
]

test('公共数据表启用紧凑密度、自适应操作列和两行长文本', async () => {
  const [table, styles] = await Promise.all([
    read('app/components/admin/shared/AdminDataTable.vue'),
    read('app/assets/admin/base.css'),
  ])
  assert.match(table, /class="admin-overview-table"/u)
  assert.match(table, /size="small"/u)
  assert.match(table, /fixedActions \? 'right'/u)
  assert.match(table, /admin-two-line-cell/u)
  assert.match(styles, /Stage 29: unified compact overview tables/u)
  assert.match(styles, /\.admin-overview-table\.el-table \.el-table__cell \{ padding:\s*\.27rem 0/u)
  assert.match(table, /adminActionColumnLayout/u)
  assert.match(styles, /\.admin-actions-cell \.admin-row-actions[^}]*display:\s*grid/su)
  assert.match(styles, /repeat\(var\(--admin-action-columns\),max-content\)/u)
  assert.match(styles, /repeat\(var\(--admin-action-rows\),auto\)/u)
  assert.match(styles, /\.admin-row-actions \.el-button--small[^}]*border-radius/su)
})

test('内容列表和完整资源列表复用统一操作区', async () => {
  const [content, resource, sharedTable] = await Promise.all([
    read('app/components/admin/content/List.vue'),
    read('app/components/admin/complete/AdminCompleteResourceWorkspace.vue'),
    read('app/components/admin/shared/AdminDataTable.vue'),
  ])
  for (const source of [content, resource]) {
    assert.match(source, /AdminRowActions/u)
    assert.match(source, /size="small" plain/u)
    assert.match(source, /AdminDataTable/u)
  }
  assert.match(sharedTable, /fixedActions \? 'right'/u)
  assert.doesNotMatch(sharedTable, /actionWidth/u)
  assert.match(content, /:action-labels=/u)
  assert.match(resource, /:action-labels=/u)
  assert.match(content, /twoLineColumn/u)
  assert.match(resource, /AdminDataTable/u)
})

test('媒体、翻译、账号权限和日志概览采用同一表格视觉规范', async () => {
  const sources = await Promise.all(overviewWorkspaces.slice(1).map(read))
  for (const source of sources) {
    assert.match(source, /AdminDataTable/u)
    assert.match(source, /AdminListToolbar/u)
    assert.match(source, /AdminRowActions/u)
    assert.match(source, /size="small" plain/u)
  }
})

test('常见标题、作者和说明字段被标记为两行候选', async () => {
  const [content, resourceColumns] = await Promise.all([
    read('app/components/admin/content/List.vue'),
    read('app/admin/complete-resource.ts'),
  ])
  assert.match(content, /\['title', 'authors', 'author', 'description', 'summary', 'name', 'name_en'\]/u)
  assert.match(resourceColumns, /key === schema\.titleField/u)
  assert.match(resourceColumns, /'authors', 'author'/u)
  assert.match(resourceColumns, /twoLine,/u)
})

test('教师和学生列表复用授权媒体投影显示固定尺寸头像', async () => {
  const [definitions, list, avatar, projection] = await Promise.all([
    read('shared/admin/content-modules.ts'),
    read('app/components/admin/content/List.vue'),
    read('app/components/admin/shared/AdminListAvatar.vue'),
    read('server/services/admin/content-list-media.ts'),
  ])
  assert.equal((definitions.match(/column\('avatar_key', '照片', 'image'/gu) ?? []).length, 2)
  assert.match(definitions, /sortable: false, filterable: false, resizable: false/u)
  assert.match(list, /<AdminListAvatar/u)
  assert.match(list, /rowMedia/u)
  assert.match(avatar, /object-fit: contain/u)
  assert.match(avatar, /background: transparent/u)
  assert.match(avatar, /@error="failed = true"/u)
  assert.match(projection, /useMediaRuntime\(event\)\.service\.project/u)
  assert.match(projection, /allowDownload: false/u)
  assert.match(projection, /Object\.freeze\(media\)/u)
})
