import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('历史候选输入点击即可展示并复用共享分号规则', async () => {
  const field = await read('app/components/admin/complete/AdminCompleteSuggestionField.vue')
  assert.match(field, /:trigger-on-focus="true"/u)
  assert.match(field, /currentAdminSuggestionToken/u)
  assert.match(field, /replaceCurrentAdminSuggestionToken/u)
  assert.match(field, /completedAdminSuggestionTokens/u)
  assert.doesNotMatch(field, /q\.length < 1/u)
})

test('分类、标签和名单字段统一接入同模块历史候选', async () => {
  const special = await read('app/shared/admin/special-fields.ts')
  const required = [
    "module: 'students', field: 'category'",
    "module: 'news', field: 'category'",
    "module: 'media_assets', field: 'category'",
    "module: 'publications', field: 'publication_type'",
    "module: 'publications', field: 'display_tags'",
    "module: 'publications', field: 'keywords'",
    "module: 'student_category_displays', field: 'keywords'",
  ]
  for (const marker of required) assert.ok(special.includes(marker), marker)
  assert.match(special, /multiple: true/u)
})

test('候选接口按字段白名单和查看权限读取现有表，不创建候选表', async () => {
  const route = await read('server/api/v1/admin/complete/suggestions/index.get.ts')
  const service = await read('server/services/complete-admin/translation-service.ts')
  assert.match(route, /PERMISSION_MODULES/u)
  assert.match(route, /media_assets: \['media_assets', 'media'\]/u)
  assert.match(route, /requireAdmin\(event, permissions, 'view'\)/u)
  assert.match(service, /SUGGESTION_FIELDS/u)
  assert.match(service, /MULTI_VALUE_SUGGESTION_FIELDS/u)
  assert.match(service, /SELECT \$\{identifier\(field\)\} AS value FROM \$\{identifier\(table\)\}/u)
  assert.match(service, /splitAdminSuggestionValue/u)
  assert.doesNotMatch(route + service, /CREATE TABLE/u)
})

test('媒体上传和编辑分类复用同一历史候选组件', async () => {
  const media = await read('app/components/admin/complete/AdminCompleteMediaWorkspace.vue')
  assert.match(media, /import AdminCompleteSuggestionField/u)
  assert.equal((media.match(/module="media_assets" field="category" multiple/gu) ?? []).length, 2)
})
