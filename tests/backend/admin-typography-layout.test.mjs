import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('后台字体与字号只在专用令牌文件中集中配置', async () => {
  const [tokens, layout, base] = await Promise.all([
    read('app/assets/admin/typography.css'),
    read('app/layouts/admin.vue'),
    read('app/assets/admin/base.css'),
  ])
  for (const variable of ['--admin-font-family', '--admin-font-size-base', '--admin-font-size-control', '--admin-font-size-table', '--admin-font-size-label', '--admin-font-size-help']) assert.match(tokens, new RegExp(variable))
  assert.ok(layout.indexOf('admin/typography.css') < layout.indexOf('admin/base.css'))
  assert.match(base, /font-size: var\(--admin-font-size-table\)/u)
  assert.match(base, /font-size: var\(--admin-font-size-label\)/u)
  assert.match(base, /font-size: var\(--admin-font-size-help\)/u)
})

test('统一表单标签由共用组件负责星号、标题与查重按钮结构', async () => {
  const [base, item, checked] = await Promise.all([
    read('app/assets/admin/base.css'),
    read('app/components/admin/shared/AdminFormItem.vue'),
    read('app/components/admin/shared/AdminCheckedFormItem.vue'),
  ])
  assert.match(item, /class="admin-form-item is-no-asterisk"/u)
  assert.match(item, /class="admin-field-label__title"[^>]*>\s*<span class="admin-field-label__required"[^>]*>\*<\/span>\s*<span class="admin-field-label__text"/u)
  assert.match(item, /\.admin-field-label__title\s*\{[^}]*white-space: nowrap;/su)
  assert.match(item, /\.admin-form-item\.is-required \.admin-field-label__required/u)
  assert.match(checked, /<AdminFormItem/u)
  assert.match(checked, /#label-actions/u)
  assert.match(base, /\.admin-shell\[data-density="compact"\] \.admin-form-grid/u)
})
