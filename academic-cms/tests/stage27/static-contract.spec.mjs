import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { root } from '../helpers/offline-stage27.mjs'

const text = path => readFile(resolve(root, path), 'utf8')

test('one canonical descriptor and one set of content API routes remain', async () => {
  await assert.rejects(stat(resolve(root, 'shared/admin/content.ts')))
  await assert.rejects(stat(resolve(root, 'server/services/admin/content-input.ts')))
  await assert.rejects(stat(resolve(root, 'server/routes/api/v1/admin/content/[module].get.ts')))
  const routes = (await readdir(resolve(root, 'server/routes/api/v1/admin/content/[module]'), { withFileTypes: true })).map(entry => entry.name).sort()
  assert.deepEqual(routes, ['[uid].delete.ts','[uid].get.ts','[uid].patch.ts','batch.patch.ts','index.get.ts','index.post.ts'])
})

test('catch-all page renders shared list and editor workspace', async () => {
  const page = await text('app/pages/admin/[...path].vue')
  assert.match(page, /adminContentRoute/)
  assert.match(page, /AdminContentWorkspace/)
  const list = await text('app/components/admin/content/List.vue')
  const editor = await text('app/components/admin/content/Editor.vue')
  assert.match(list, /AdminDataTable/)
  assert.match(list, /AdminListToolbar/)
  assert.match(list, /ElPagination/)
  assert.match(list, /expectedUpdatedAtByUid/)
  assert.match(editor, /expectedUpdatedAt/)
  assert.match(editor, /AdminFieldRenderer/)
  assert.match(editor, /onBeforeRouteLeave/)
  assert.doesNotMatch(`${list}\n${editor}`, /v-html/)
  assert.doesNotMatch(`${list}\n${editor}`, /components\/public|assets\/public/)
})

test('migration adds mutation guard and admin indexes without rewriting old migrations', async () => {
  const migration = await text('migrations/0007_admin_content_management.sql')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "admin_mutation_guards"/)
  assert.match(migration, /idx_profiles_admin_updated/)
  assert.match(migration, /idx_publications_admin_updated/)
  assert.match(migration, /idx_projects_admin_updated/)
  const manifest = JSON.parse(await text('migrations/manifest.json'))
  assert.equal(manifest.migrations[6].name, '0007_admin_content_management.sql')
  assert.ok(manifest.migrations.length >= 7)
})
