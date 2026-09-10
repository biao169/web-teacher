import assert from 'node:assert/strict'
import test from 'node:test'
import { core, createHarness, insertFixtures, principal } from '../helpers/offline-stage27.mjs'

function serviceFor(harness, actor = principal()) {
  let counter = 0
  let now = Date.parse('2026-09-01T06:00:00.000Z')
  return new core.AdminContentService(harness.adapter, actor, {
    newUid: () => `hardening-${++counter}`,
    now: () => new Date(now += 5),
  })
}

const createSamples = Object.freeze({
  profiles: { name: '王教授' },
  research_interests: { name: '可信系统' },
  publications: { title: '可信边缘系统', doi: 'https://doi.org/10.9999/EDGE.1', year: 2026 },
  projects: { name: '边缘可靠性项目', start_date: '2026-01-01', end_date: '2028-12-31' },
  patents: { name: '一种可靠计算方法', application_date: '2026-01-01' },
  students: { name: '周同学', enrollment_date: '2026-09-01' },
  student_category_displays: { key: 'doctoral_students', label: '博士生' },
  courses: { name: '分布式系统' },
})

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: all eight writable generic modules create, read and list through the shared service`, async () => {
    const h = createHarness(kind)
    try {
      const service = serviceFor(h)
      for (const [module, values] of Object.entries(createSamples)) {
        const created = await service.create(module, { values })
        assert.match(created.record.uid, new RegExp(`^${module}:`))
        assert.equal(created.record.values[core.adminContentModule(module).primaryField] != null, true, module)
        const detail = await service.detail(module, created.record.uid)
        assert.equal(detail.uid, created.record.uid)
        const list = await service.list(module, core.parseAdminContentQuery(core.adminContentModule(module), { page: '1', pageSize: '10' }))
        assert.ok(list.items.some(item => item.uid === created.record.uid), module)
      }
      insertFixtures(h.db)
      const messages = await service.list('messages', core.parseAdminContentQuery(core.adminContentModule('messages'), { page: '1', pageSize: '10' }))
      assert.equal(messages.total, 1)
    }
    finally { h.close() }
  })

  test(`${kind}: stale batch versions roll back records, audit and cache generations`, async () => {
    const h = createHarness(kind)
    try {
      const service = serviceFor(h)
      const one = (await service.create('profiles', { values: { name: '批量甲' } })).record
      const two = (await service.create('profiles', { values: { name: '批量乙' } })).record
      await service.update('profiles', two.uid, { values: { role: '研究员' }, expectedUpdatedAt: two.updatedAt })
      const auditBefore = Number(h.db.prepare('SELECT count(*) AS total FROM operation_logs').get().total)
      const generationBefore = Number(h.db.prepare('SELECT coalesce(sum(generation),0) AS total FROM cache_generations').get().total)
      await assert.rejects(() => service.batchUpdate('profiles', {
        uids: [one.uid, two.uid],
        expectedUpdatedAtByUid: { [one.uid]: one.updatedAt, [two.uid]: two.updatedAt },
        values: { visibility: 'public' },
      }), error => error?.code === 'ADMIN_CONTENT_CONFLICT')
      assert.equal((await service.detail('profiles', one.uid)).values.visibility, 'hidden')
      assert.equal((await service.detail('profiles', two.uid)).values.visibility, 'hidden')
      assert.equal(Number(h.db.prepare('SELECT count(*) AS total FROM operation_logs').get().total), auditBefore)
      assert.equal(Number(h.db.prepare('SELECT coalesce(sum(generation),0) AS total FROM cache_generations').get().total), generationBefore)
      assert.equal(Number(h.db.prepare('SELECT count(*) AS total FROM admin_mutation_guards').get().total), 0)
    }
    finally { h.close() }
  })
}

test('content service checks the requested business module instead of dashboard permission', async () => {
  const h = createHarness('sqlite')
  try {
    const base = principal()
    const permissions = Object.fromEntries(core.AUTH_MODULES.map(module => [module, {
      view: module === 'dashboard', create: false, edit: false, delete: false, export: false,
    }]))
    const service = serviceFor(h, principal({ permissions: Object.freeze(permissions) }))
    await assert.rejects(
      () => service.list('profiles', core.parseAdminContentQuery(core.adminContentModule('profiles'), {})),
      error => error?.code === 'AUTH_FORBIDDEN',
    )
    assert.equal(base.permissions.profiles.view, true)
  }
  finally { h.close() }
})

test('partial updates allow omitted required fields but reject clearing them when the current record is known', () => {
  const definition = core.adminContentModule('publications')
  assert.deepEqual(core.normalizeAdminContentValues(definition, { doi: 'DOI: 10.1234/ABC' }, 'update').values, { doi: '10.1234/abc' })
  assert.throws(
    () => core.normalizeAdminContentValues(definition, { title: null }, 'update', { title: '原题名', pdf_visibility: 'hidden', visibility: 'hidden', is_featured: false, sort_order: 0 }),
    error => error?.code === 'ADMIN_CONTENT_VALIDATION' && Boolean(error.fieldErrors.title),
  )
})

test('category keys allow documented underscores and formal news is absent from the generic editor', () => {
  const category = core.normalizeAdminContentValues(core.adminContentModule('student_category_displays'), { key: 'doctoral_students', label: '博士生' }, 'create')
  assert.equal(category.values.key, 'doctoral_students')
  assert.equal(core.isAdminContentModule('news'), false)
})

test('mutation input rejects unknown and prototype-sensitive fields', () => {
  const definition = core.adminContentModule('profiles')
  assert.throws(() => core.normalizeAdminContentValues(definition, { name: '成员', arbitrary: true }, 'create'), error => error?.code === 'ADMIN_CONTENT_VALIDATION')
  const polluted = Object.create(null)
  polluted.name = '成员'
  polluted.__proto__ = 'blocked'
  assert.throws(() => core.normalizeAdminContentValues(definition, polluted, 'create'), error => error?.code === 'ADMIN_CONTENT_VALIDATION')
})
