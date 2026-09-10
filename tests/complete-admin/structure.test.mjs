import test from 'node:test'
import assert from 'node:assert/strict'
import { glob, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const required = [
  'app/pages/admin/settings/site/index.vue','app/pages/admin/settings/global/index.vue','app/pages/admin/navigation/index.vue','app/pages/admin/media/index.vue',
  'app/pages/admin/translation/index.vue','app/pages/admin/auth/index.vue','app/pages/admin/logs/index.vue','app/pages/admin/import-export/index.vue',
  'app/pages/admin/news/editor/[uid]/index.vue','server/api/v1/admin/complete/modules.get.ts','server/services/complete-admin/resource-service.ts',
  'server/services/complete-admin/media-service.ts','server/services/complete-admin/translation-service.ts','server/services/complete-admin/auth-service.ts','server/services/complete-admin/transfer-service.ts'
]

test('all complete backend entry points exist', async () => {
  for (const relative of required) assert.equal((await stat(resolve(root, relative))).isFile(), true, relative)
})

test('admin Vue code never uses v-html', async () => {
  for await (const relative of glob('app/{pages,components}/admin/**/*.vue', { cwd: root })) {
    const text = await readFile(resolve(root, relative), 'utf8')
    assert.equal(/\bv-html\s*=/u.test(text), false, relative)
  }
})

test('backup preview does not return a decrypted envelope', async () => {
  const text = await readFile(resolve(root, 'server/services/complete-admin/transfer-service.ts'), 'utf8')
  const preview = text.slice(text.indexOf('async preview('), text.indexOf('async apply('))
  assert.equal(preview.includes('return { ...summary, digest:'), true)
  assert.equal(/return\s*\{[^}]*envelope\s*[,}]/u.test(preview), false)
  assert.match(preview, /digest/u)
})

test('binary upload opts into the binary request boundary', async () => {
  const route = await readFile(resolve(root, 'server/api/v1/admin/complete/media/upload.post.ts'), 'utf8')
  assert.match(route, /binary:\s*true/u)
  const auth = await readFile(resolve(root, 'server/utils/complete-admin/auth.ts'), 'utf8')
  assert.match(auth, /binaryAllowed/u)
})

test('the consolidated project documentation set exists without legacy duplicates', async () => {
  for (let number = 1; number <= 9; number += 1) {
    const prefix = String(number).padStart(2, '0')
    const found = []
    for await (const relative of glob(`docs/${prefix}_*.md`, { cwd: root })) found.push(relative)
    assert.equal(found.length, 1, `docs/${prefix}_*.md`)
  }
})

test('heavy editor dependencies stay in the admin component tree', async () => {
  for await (const relative of glob('app/**/*.vue', { cwd: root })) {
    const text = await readFile(resolve(root, relative), 'utf8')
    if (/@tiptap\//u.test(text)) assert.match(relative, /^app\/components\/admin\/|^app\/pages\/admin\//u)
  }
})
