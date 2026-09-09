import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'

const output = process.env.STAGE27_CORE_OUTPUT
if (!output) throw new Error('STAGE27_CORE_OUTPUT is required')
const require = createRequire(import.meta.url)
const modules = require(resolve(output, 'shared/admin/content-modules.js'))
const { catalog } = require(resolve(output, 'db/catalog.js'))

const definitions = modules.allAdminContentModules()

test('registers one coherent descriptor for all core content modules', () => {
  assert.equal(definitions.length, 9)
  assert.equal(new Set(definitions.map(item => item.module)).size, definitions.length)
  assert.equal(new Set(definitions.map(item => item.path)).size, definitions.length)
  assert.deepEqual(definitions.map(item => item.module), [...modules.ADMIN_CONTENT_MODULES])
})

test('every list, filter, sort, form and batch field exists in the database catalog', () => {
  for (const definition of definitions) {
    const table = catalog[definition.table]
    assert.ok(table, `catalog missing ${definition.table}`)
    const fields = new Set(definition.fields.map(item => item.name))
    assert.equal(fields.size, definition.fields.length, `${definition.module}: duplicate fields`)
    assert.ok(fields.has(definition.primaryField), `${definition.module}: primary field absent from form`)
    for (const item of definition.fields) assert.ok(table.columns[item.name], `${definition.module}: form field ${item.name}`)
    for (const item of definition.columns) assert.ok(table.columns[item.field], `${definition.module}: list field ${item.field}`)
    for (const item of definition.filters) assert.ok(table.columns[item.field], `${definition.module}: filter field ${item.field}`)
    for (const item of definition.sorts) assert.ok(table.columns[item.field], `${definition.module}: sort field ${item.field}`)
    for (const item of definition.batchFields) {
      assert.ok(table.columns[item], `${definition.module}: batch field ${item}`)
      assert.ok(fields.has(item), `${definition.module}: batch field absent from form`)
    }
  }
})

test('route parser rejects ambiguous paths and preserves a safe record uid', () => {
  const profile = modules.adminContentRoute('/admin/profiles')
  assert.equal(profile?.mode, 'list')
  assert.equal(modules.adminContentRoute('/admin/profiles/new')?.mode, 'create')
  assert.deepEqual(modules.adminContentRoute('/admin/profiles/profile%3A001'), {
    definition: modules.adminContentModule('profiles'), mode: 'edit', uid: 'profile:001',
  })
  for (const path of ['/admin/profiles/a/b', '/admin/profiles/%2Fadmin', '/admin/profiles/%252Fadmin', '/admin/profiles/a%25b']) {
    assert.equal(modules.adminContentRoute(path), null, path)
  }
})

test('messages are immutable except for their processing status', () => {
  const messages = modules.adminContentModule('messages')
  assert.equal(messages.canCreate, false)
  assert.equal(messages.canDelete, false)
  assert.deepEqual(messages.batchFields, ['status'])
  assert.deepEqual(messages.fields.filter(item => !item.readOnly).map(item => item.name), ['status'])
})

test('the shared batch budget is explicit and bounded', () => {
  assert.equal(modules.ADMIN_CONTENT_BATCH_LIMIT, 25)
  assert.ok(modules.ADMIN_CONTENT_BATCH_LIMIT <= 25)
})


test('every business column is represented by the module editor', () => {
  for (const definition of definitions) {
    const fields = new Set(definition.fields.map(item => item.name))
    const businessColumns = Object.keys(catalog[definition.table].columns).filter(name => !['id', 'uid', 'created_at', 'updated_at'].includes(name))
    assert.deepEqual([...fields].sort(), businessColumns.sort(), `${definition.module}: editor coverage differs from the database business columns`)
  }
})
