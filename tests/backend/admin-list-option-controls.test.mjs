import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = path => readFile(resolve(root, path), 'utf8')

test('布尔快速修改只由 boolean 类型启用并使用有色状态按钮', async () => {
  const field = await read('app/components/admin/shared/AdminQuickField.vue')
  assert.match(field, /props\.kind !== 'boolean'/u)
  assert.match(field, /props\.options\.length !== 2/u)
  assert.match(field, /<ElButton[\s\S]*v-if="booleanPair"/u)
  assert.match(field, /aria-pressed/u)
  assert.match(field, /nextBooleanOption\.value\.value/u)
  assert.match(field, /:type="booleanTone"/u)
  assert.match(field, /<ElSelect[\s\S]*v-else/u)
})

test('枚举快速修改和列筛选均呈现集中颜色标记', async () => {
  const [field, table, option, protocol, styles] = await Promise.all([
    read('app/components/admin/shared/AdminQuickField.vue'),
    read('app/components/admin/shared/AdminDataTable.vue'),
    read('app/components/admin/shared/AdminSelectOption.vue'),
    read('app/admin/unified-list.ts'),
    read('app/assets/admin/base.css'),
  ])
  assert.match(protocol, /AdminOptionTone/u)
  assert.match(protocol, /adminOptionTone/u)
  assert.match(protocol, /adminColumnOptionTone/u)
  assert.match(field, /#label="\{ label, value \}"/u)
  assert.match(field, /admin-option-label__dot/u)
  assert.match(table, /filterOptionTone/u)
  assert.match(option, /data-tone/u)
  for (const tone of ['success', 'warning', 'danger', 'primary']) assert.match(styles, new RegExp(`data-tone="${tone}"`, 'u'))
})

test('主要列表把列类型传给公共快速修改组件并声明业务颜色', async () => {
  const [content, resource, auth, media, translation] = await Promise.all([
    read('app/components/admin/content/List.vue'),
    read('app/components/admin/complete/AdminCompleteResourceWorkspace.vue'),
    read('app/components/admin/complete/AdminCompleteAuthWorkspace.vue'),
    read('app/components/admin/complete/AdminCompleteMediaWorkspace.vue'),
    read('app/components/admin/complete/AdminCompleteTranslationWorkspace.vue'),
  ])
  assert.match(content, /:kind="column\.kind \?\? 'text'"/u)
  assert.match(resource, /:kind="column\.kind \?\? 'text'"/u)
  assert.match(auth, /kind="boolean"/u)
  assert.match(media, /column\.key === 'status'/u)
  assert.match(media, /row\.status === 'active' \? 'success' : 'warning'/u)
  assert.match(translation, /tone: 'warning'/u)
  assert.match(translation, /tone: 'danger'/u)
})

test('快速修改保留加载、权限禁用和失败后刷新保护', async () => {
  const [field, content, resource, media] = await Promise.all([
    read('app/components/admin/shared/AdminQuickField.vue'),
    read('app/components/admin/content/List.vue'),
    read('app/components/admin/complete/AdminCompleteResourceWorkspace.vue'),
    read('app/components/admin/complete/AdminCompleteMediaWorkspace.vue'),
  ])
  assert.match(field, /props\.disabled \|\| props\.loading/u)
  assert.match(field, /:loading="props\.loading"/u)
  assert.match(content, /invalidateQueries/u)
  assert.match(resource, /快速更新失败，列表已刷新/u)
  assert.match(media, /statusSavingUid/u)
  assert.match(media, /:loading="statusSavingUid === row\.uid"/u)
})
