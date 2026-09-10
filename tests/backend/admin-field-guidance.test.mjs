import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const source = relative => readFile(resolve(root, relative), 'utf8')

test('通用内容与完整资源编辑器统一显示字段占位和说明', async () => {
  const contentField = await source('app/components/admin/shared/AdminFieldRenderer.vue')
  const contentEditor = await source('app/components/admin/content/Editor.vue')
  const completeEditor = await source('app/components/admin/complete/AdminCompleteRecordEditor.vue')
  const adapter = await source('app/admin/editor-fields.ts')
  assert.match(contentField, /descriptor\.placeholder/u)
  assert.match(contentEditor, /entry\.descriptor\.help/u)
  assert.match(completeEditor, /entry\.descriptor\.help/u)
  assert.match(adapter, /placeholder: field\.placeholder/u)
  assert.match(adapter, /help: enhancedHelp\(field\.help, enhancement\)/u)
  assert.match(adapter, /const help = value \?\? ''/u)
  assert.doesNotMatch(contentEditor, /v-if="field\.help"/u)
  assert.doesNotMatch(completeEditor, /v-if="field\.help"/u)
})

test('专项对象与高风险配置表单提供逐项提示和说明', async () => {
  const files = [
    'app/components/admin/complete/AdminCompleteAuthWorkspace.vue',
    'app/components/admin/complete/AdminCompleteMediaWorkspace.vue',
    'app/components/admin/complete/AdminCompleteTranslationWorkspace.vue',
    'app/components/admin/complete/AdminCompleteTransferWorkspace.vue',
    'app/components/admin/complete/AdminCompleteImageCropper.client.vue',
    'app/components/admin/complete/AdminCompleteMetadataWorkspace.vue',
    'app/components/admin/complete/AdminCompleteLogWorkspace.vue',
    'app/components/admin/complete/AdminCompleteNewsEditor.vue',
  ]
  for (const file of files) {
    const text = await source(file)
    assert.match(text, /admin-field-help/u, file)
  }
  const auth = await source(files[0])
  assert.match(auth, /placeholder="例如：zhangsan"/u)
  assert.match(auth, /不能包含用户账号、姓名或邮箱/u)
  const transfer = await source(files[3])
  assert.match(transfer, /系统不会保存或记录该口令/u)
  assert.match(transfer, /防止误触发会删除现有记录/u)
})

test('批量编辑复用字段说明规则并解释序列操作', async () => {
  const genericBatch = await source('app/components/admin/content/BatchDialog.vue')
  const completeBatch = await source('app/components/admin/complete/AdminCompleteResourceWorkspace.vue')
  assert.match(genericBatch, /descriptor\.help/u)
  assert.match(completeBatch, /batchDescriptor\.help/u)
  assert.match(completeBatch, /后续记录依次增加此数值/u)
})
