import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const text = path => readFile(resolve(root, path), 'utf8')

test('the dynamic admin page renders list and editor workspaces', async () => {
  const page = await text('app/pages/admin/[...path].vue')
  assert.match(page, /adminContentRoute/u)
  assert.match(page, /AdminContentWorkspace/u)
  const workspace = await text('app/components/admin/content/Workspace.vue')
  assert.match(workspace, /AdminContentList/u)
  assert.match(workspace, /AdminContentEditor/u)
})

test('core content modules are marked implemented in the admin registry', async () => {
  const registry = await text('shared/admin/registry.ts')
  for (const module of ['profiles','research_interests','students','student_category_displays','publications','projects','patents','news','courses','messages']) {
    assert.match(registry, new RegExp(`module: '${module}'[^\\n]+implemented: true`, 'u'), module)
  }
})

test('the client enforces server pagination, bounded selection and optimistic versions', async () => {
  const list = await text('app/components/admin/content/List.vue')
  const editor = await text('app/components/admin/content/Editor.vue')
  assert.match(list, /ElPagination/u)
  assert.match(list, /ADMIN_CONTENT_BATCH_LIMIT/u)
  assert.match(list, /expectedUpdatedAtByUid/u)
  assert.match(editor, /expectedUpdatedAt/u)
  assert.match(editor, /onBeforeRouteLeave/u)
  assert.match(editor, /hasAdminPermission/u)
})

test('content API exposes one unambiguous route set', async () => {
  const directory = resolve(root, 'server/routes/api/v1/admin/content')
  const files = []
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name)
      if (entry.isDirectory()) await walk(child)
      else files.push(child.slice(directory.length + 1).replaceAll('\\\\','/'))
    }
  }
  await walk(directory)
  assert.deepEqual(files.sort(), [
    '[module]/[uid].delete.ts','[module]/[uid].get.ts','[module]/[uid].patch.ts','[module]/batch.patch.ts','[module]/index.get.ts','[module]/index.post.ts',
  ])
})

test('list SQL requests only the visible projection', async () => {
  const store = await text('server/services/admin/content-store.ts')
  const query = await text('db/query.ts')
  assert.match(store, /select: projection/u)
  assert.match(query, /SELECT \$\{projection\}/u)
})

test('admin content Vue templates never render raw HTML', async () => {
  const dir = resolve(root, 'app/components/admin/content')
  for (const entry of await readdir(dir)) {
    if (!entry.endsWith('.vue')) continue
    assert.doesNotMatch(await readFile(resolve(dir, entry), 'utf8'), /v-html/u, entry)
  }
})

test('list and editor keep selection, nullable fields and navigation state coherent', async () => {
  const list = await text('app/components/admin/content/List.vue')
  const editor = await text('app/components/admin/content/Editor.vue')
  const field = await text('app/components/admin/shared/AdminFieldRenderer.vue')
  const utils = await text('app/admin/content-utils.ts')
  assert.match(list, /AdminDataTable/u)
  assert.match(list, /@selection-change="setSelection"/u)
  assert.match(list, /selected\.value = \[\]/u)
  assert.doesNotMatch(list, /v-loading/u)
  assert.match(field, /typeof modelValue === 'number' \? modelValue : null/u)
  assert.ok(utils.indexOf('if (field.nullable) return null') < utils.indexOf("if (field.kind === 'integer') return 0"))
  assert.match(editor, /baseline\.value = formSnapshot\(\)/u)
  assert.doesNotMatch(editor, /nextTick\(\(\) => \{ baseline/u)
})

test('client route guard requires create permission for new content routes', async () => {
  const middleware = await text('app/middleware/admin-auth.global.ts')
  assert.match(middleware, /adminContentRoute\(to\.path\)/u)
  assert.match(middleware, /contentRoute\?\.mode === 'create'/u)
  assert.match(middleware, /hasAdminPermission\(auth\.session\.value\.user, selected\.module, 'create'\)/u)
})


test('content writes use operation-specific bounded payload budgets', async () => {
  const handler = await text('server/utils/admin-content-handler.ts')
  const batch = await text('server/routes/api/v1/admin/content/[module]/batch.patch.ts')
  assert.match(handler, /ADMIN_CONTENT_MUTATION_BODY_LIMIT = 768 \* 1024/u)
  assert.match(handler, /ADMIN_CONTENT_BATCH_BODY_LIMIT = 64 \* 1024/u)
  assert.match(handler, /ADMIN_CONTENT_SMALL_BODY_LIMIT = 16 \* 1024/u)
  assert.match(handler, /maximumBytes = ADMIN_CONTENT_SMALL_BODY_LIMIT/u)
  assert.match(batch, /ADMIN_CONTENT_BATCH_BODY_LIMIT/u)
  assert.doesNotMatch(handler, /AUTH_JSON_BODY_LIMIT/u)
})
