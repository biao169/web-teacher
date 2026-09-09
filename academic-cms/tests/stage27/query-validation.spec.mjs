import test from 'node:test'
import assert from 'node:assert/strict'
import { core } from '../helpers/offline-stage27.mjs'

function expectCode(action, code) {
  assert.throws(action, error => error instanceof core.AdminContentError && error.code === code)
}

test('list query parser applies whitelists, pagination and typed filters', () => {
  const definition = core.adminContentModule('publications')
  const parsed = core.parseAdminContentQuery(definition, { q: '一致性', page: '2', pageSize: '10', sort: 'year', direction: 'desc', f_year: '2026', f_visibility: 'public' })
  assert.equal(parsed.page, 2)
  assert.equal(parsed.pageSize, 10)
  assert.equal(parsed.search, '一致性')
  assert.deepEqual(parsed.sort, { field: 'year', direction: 'desc' })
  assert.deepEqual(parsed.filters, [{ field: 'year', op: 'eq', value: 2026 }, { field: 'visibility', op: 'eq', value: 'public' }])
  expectCode(() => core.parseAdminContentQuery(definition, { arbitrary: 'title' }), 'ADMIN_CONTENT_INPUT')
  expectCode(() => core.parseAdminContentQuery(definition, { pageSize: '999' }), 'ADMIN_CONTENT_INPUT')
  expectCode(() => core.parseAdminContentQuery(definition, { f_visibility: 'everyone' }), 'ADMIN_CONTENT_INPUT')
})

test('module validation normalizes DOI and enforces cross-field rules', () => {
  const publication = core.normalizeAdminContentValues(core.adminContentModule('publications'), { title: '示例论文', doi: 'https://doi.org/10.1234/ABC.X' }, 'update')
  assert.equal(publication.values.doi, '10.1234/abc.x')

  expectCode(() => core.normalizeAdminContentValues(core.adminContentModule('projects'), { start_date: '2028-01-01', end_date: '2027-01-01' }, 'update'), 'ADMIN_CONTENT_VALIDATION')
  expectCode(() => core.normalizeAdminContentValues(core.adminContentModule('patents'), { grant_number: 'CN1', grant_date: null }, 'update'), 'ADMIN_CONTENT_VALIDATION')
  expectCode(() => core.normalizeAdminContentValues(core.adminContentModule('messages'), { content: '不能改写原始留言' }, 'update'), 'ADMIN_CONTENT_VALIDATION')
})

test('batch validation accepts exactly one allowed writable field', () => {
  const definition = core.adminContentModule('profiles')
  assert.deepEqual(core.normalizeAdminContentValues(definition, { visibility: 'public' }, 'batch').values, { visibility: 'public' })
  expectCode(() => core.normalizeAdminContentValues(definition, { visibility: 'public', is_featured: true }, 'batch'), 'ADMIN_CONTENT_VALIDATION')
  expectCode(() => core.normalizeAdminContentValues(definition, { name: '批量改名' }, 'batch'), 'ADMIN_CONTENT_VALIDATION')
})
