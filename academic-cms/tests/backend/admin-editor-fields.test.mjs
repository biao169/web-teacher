import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const source = relative => readFile(resolve(root, relative), 'utf8')

test('两套对象编辑器共用唯一字段渲染入口', async () => {
  const [content, complete, renderer] = await Promise.all([
    source('app/components/admin/content/Editor.vue'),
    source('app/components/admin/complete/AdminCompleteRecordEditor.vue'),
    source('app/components/admin/shared/AdminFieldRenderer.vue'),
  ])
  for (const editor of [content, complete]) {
    assert.match(editor, /import AdminFieldRenderer/u)
    assert.match(editor, /<AdminFieldRenderer/u)
  }
  assert.match(renderer, /AdminCompleteMediaPicker/u)
  assert.match(renderer, /AdminCompleteRelationPicker/u)
  assert.match(renderer, /AdminCompleteSuggestionField/u)
  assert.match(renderer, /data-admin-control/u)
  assert.doesNotMatch(complete, /v-else-if="field\.type === '(?:media|relation|boolean|select|integer|textarea|date|datetime)'"/u)
})

test('特殊字段清单已成为字段适配器的输入', async () => {
  const [adapter, special] = await Promise.all([
    source('app/admin/editor-fields.ts'),
    source('app/shared/admin/special-fields.ts'),
  ])
  assert.match(adapter, /getAdminSpecialField/u)
  assert.match(adapter, /contentEditorFieldDescriptor/u)
  assert.match(adapter, /completeEditorFieldDescriptor/u)
  assert.match(special, /MODULE_ALIASES/u)
  for (const kind of ['media', 'suggestion', 'relation', 'richtext']) assert.match(special, new RegExp(`kind: '${kind}'`, 'u'))
})

test('读只媒体字段不能绕过统一渲染器打开选择器', async () => {
  const [renderer, picker] = await Promise.all([
    source('app/components/admin/shared/AdminFieldRenderer.vue'),
    source('app/components/admin/complete/AdminCompleteMediaPicker.vue'),
  ])
  assert.match(renderer, /:disabled="disabled"/u)
  assert.match(picker, /disabled\?: boolean/u)
  assert.match(picker, /:disabled="disabled"/u)
  assert.match(picker, /if \(!props\.disabled(?:\s*&&[^)]*)?\)/u)
})
