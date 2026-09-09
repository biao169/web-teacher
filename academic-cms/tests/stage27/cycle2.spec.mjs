import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { core, createHarness, principal } from '../helpers/offline-stage27.mjs'

function serviceFor(harness, suffix) {
  let counter = 0
  let now = Date.parse('2026-09-01T08:00:00.000Z')
  return new core.AdminContentService(harness.adapter, principal(), {
    newUid: () => `${suffix}-${++counter}`,
    now: () => new Date(now += 10),
  })
}

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: duplicate generic business identifiers return field-level validation errors`, async () => {
    const harness = createHarness(kind)
    try {
      const service = serviceFor(harness, `unique-${kind}`)
      await service.create('student_category_displays', { values: { key: 'doctoral_students', label: '博士生' } })
      await assert.rejects(
        () => service.create('student_category_displays', { values: { key: 'doctoral_students', label: '博士研究生' } }),
        error => Boolean(error?.code === 'ADMIN_CONTENT_VALIDATION' && error.fieldErrors?.key),
      )
    }
    finally { harness.close() }
  })
}

test('create and update routes allow bounded long-form content payloads', async () => {
  const root = process.cwd()
  const handler = await readFile(resolve(root, 'server/utils/admin-content-handler.ts'), 'utf8')
  const create = await readFile(resolve(root, 'server/routes/api/v1/admin/content/[module]/index.post.ts'), 'utf8')
  const update = await readFile(resolve(root, 'server/routes/api/v1/admin/content/[module]/[uid].patch.ts'), 'utf8')
  assert.match(handler, /ADMIN_CONTENT_MUTATION_BODY_LIMIT\s*=\s*768\s*\*\s*1024/u)
  assert.match(create, /ADMIN_CONTENT_MUTATION_BODY_LIMIT/u)
  assert.match(update, /ADMIN_CONTENT_MUTATION_BODY_LIMIT/u)
})

test('editor submits only changed update fields and keeps the returned optimistic-lock version', async () => {
  const editor = await readFile(resolve(process.cwd(), 'app/components/admin/content/Editor.vue'), 'utf8')
  const utilities = await readFile(resolve(process.cwd(), 'app/admin/content-utils.ts'), 'utf8')
  assert.match(utilities, /changedWritableFieldValues/u)
  assert.match(editor, /changedWritableFieldValues/u)
  assert.match(editor, /recordUpdatedAt/u)
  assert.match(editor, /canSubmit/u)
  assert.match(editor, /setQueryData/u)
})
