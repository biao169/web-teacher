import test from 'node:test'
import assert from 'node:assert/strict'
import { core } from '../helpers/offline-stage27.mjs'

const expected = ['profiles','research_interests','publications','projects','patents','students','student_category_displays','courses','messages']

test('all generic content modules have complete list and editor descriptors', () => {
  assert.deepEqual([...core.ADMIN_CONTENT_MODULES], expected)
  for (const key of expected) {
    const definition = core.adminContentModule(key)
    assert.equal(definition.module, key)
    assert.equal(definition.table, key)
    assert.ok(definition.path.startsWith('/admin/'))
    assert.ok(definition.groups.length >= 1)
    assert.ok(definition.fields.length >= 5)
    assert.ok(definition.columns.length >= 3)
    assert.ok(definition.sorts.length >= 1)
    assert.ok(definition.fields.some(field => field.name === definition.primaryField))
    const groups = new Set(definition.groups.map(group => group.id))
    const fields = new Set()
    for (const field of definition.fields) {
      assert.ok(groups.has(field.group), `${key}.${field.name} has an unknown group`)
      assert.equal(fields.has(field.name), false, `${key}.${field.name} is duplicated`)
      assert.ok(field.placeholder?.trim(), `${key}.${field.name} is missing a placeholder`)
      assert.ok(field.help?.trim(), `${key}.${field.name} is missing help text`)
      fields.add(field.name)
    }
    for (const column of definition.columns) assert.ok(fields.has(column.field) || ['created_at','updated_at'].includes(column.field), `${key}.${column.field} column is not projected`)
    for (const filter of definition.filters) assert.ok(fields.has(filter.field), `${key}.${filter.field} filter is not writable/projected`)
    for (const batch of definition.batchFields) assert.ok(fields.has(batch), `${key}.${batch} batch field is unknown`)
  }
})

test('content routes distinguish list, create and edit without encoded separator ambiguity', () => {
  assert.equal(core.adminContentRoute('/admin/profiles')?.mode, 'list')
  assert.equal(core.adminContentRoute('/admin/profiles/new')?.mode, 'create')
  assert.deepEqual(core.adminContentRoute('/admin/profiles/profiles%3Aalpha'), {
    definition: core.adminContentModule('profiles'), mode: 'edit', uid: 'profiles:alpha',
  })
  assert.equal(core.adminContentRoute('/admin/messages/new'), null)
  assert.equal(core.adminContentRoute('/admin/profiles/a%252Fb'), null)
  assert.equal(core.adminContentRoute('/admin/profiles/a%2Fb'), null)
  assert.equal(core.adminContentRoute('/admin/profiles/a/b'), null)
  assert.equal(core.adminContentRoute('/admin/news/new'), null)
  assert.equal(core.isAdminContentModule('news'), false)
})

test('admin registry exposes every sidebar module as complete, including formal news workspace', () => {
  for (const key of expected) assert.equal(core.adminModule(key).implemented, true)
  for (const module of core.ADMIN_MODULES) assert.equal(module.implemented, true, module.key)
  assert.equal(core.adminModule('navigation_items').implemented, true)
  assert.equal(core.adminModule('site_settings').implemented, true)
  assert.equal(core.adminModule('news').path, '/admin/news')
})
