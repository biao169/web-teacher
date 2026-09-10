import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('新闻富文本支持粘贴、拖入、布局修改和实时预览', async () => {
  const editor = await read('app/components/admin/complete/AdminCompleteRichTextEditor.client.vue')
  for (const marker of ['handlePaste', 'handleDrop', 'uploadAndInsert', '图片设置', '前台实时预览', 'rich-image-center', 'rich-image-wide']) assert.match(editor, new RegExp(marker))
  assert.match(editor, /setTextAlign\('justify'\)/u)
  assert.match(editor, /defaultAlt/u)
  assert.match(editor, /@selected="onMediaSelected"/u)
})

test('富文本预览经过服务端同一白名单渲染器', async () => {
  const route = await read('server/api/v1/admin/complete/news/rich-text-preview.post.ts')
  assert.match(route, /requireAdmin\(event, \['news'\], 'view', \{ write: true \}\)/u)
  assert.match(route, /readBoundedJson/u)
  assert.match(route, /renderRichTextDocument/u)
})

test('编辑器与媒体选择器复用同一上传方法', async () => {
  const [editor, picker, upload] = await Promise.all([
    read('app/components/admin/complete/AdminCompleteRichTextEditor.client.vue'),
    read('app/components/admin/complete/AdminCompleteMediaPicker.vue'),
    read('app/composables/useAdminMediaUpload.ts'),
  ])
  assert.match(editor, /useAdminMediaUpload/u)
  assert.match(picker, /useAdminMediaUpload/u)
  assert.match(upload, /\/api\/v1\/admin\/complete\/media\/upload/u)
})
