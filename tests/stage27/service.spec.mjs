import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import test from 'node:test'
import { applyMigrations, loadMigrations } from '../../scripts/db/migrations.mjs'

const output = process.env.STAGE27_CORE_OUTPUT
if (!output) throw new Error('STAGE27_CORE_OUTPUT is required')
const require = createRequire(import.meta.url)
const { SqliteAdapter } = require(resolve(output, 'db/adapters/sqlite.js'))
const { D1Adapter } = require(resolve(output, 'db/adapters/d1.js'))
const { AdminContentService } = require(resolve(output, 'server/services/admin/content-service.js'))
const { parseAdminContentQuery } = require(resolve(output, 'server/services/admin/content-query.js'))
const { normalizeAdminContentValues } = require(resolve(output, 'server/services/admin/content-validation.js'))
const { adminContentModule, allAdminContentModules } = require(resolve(output, 'shared/admin/content-modules.js'))
const { AUTH_MODULES } = require(resolve(output, 'shared/enums/auth.js'))
const migrations = await loadMigrations(resolve(process.cwd(), 'migrations'))

function syncConnection(db) {
  return { prepare: sql => db.prepare(sql), exec: sql => db.exec(sql), get inTransaction() { return db.isTransaction } }
}

class D1Double {
  constructor(db) { this.db = db }
  prepare(sql) {
    const db = this.db
    const build = params => {
      const execute = () => {
        const statement = db.prepare(sql)
        const rows = statement.all(...params)
        const readOnly = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA)\b/iu.test(sql)
        const meta = db.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get()
        return { success: true, results: rows, meta: { changes: readOnly ? 0 : Number(meta.changes), last_row_id: Number(meta.last_row_id) } }
      }
      return { bind: (...values) => build(values), all: async () => execute(), run: async () => execute(), _execute: execute }
    }
    return build([])
  }
  async batch(statements) {
    try {
      this.db.exec('BEGIN IMMEDIATE')
      const results = statements.map(item => item._execute())
      this.db.exec('COMMIT')
      return results
    }
    catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK')
      throw new Error(`D1_ERROR: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  }
}

class RecordingAdapter {
  constructor(inner) { this.inner = inner; this.kind = inner.kind; this.metrics = inner.metrics; this.batches = []; this.commands = [] }
  execute(command) { this.commands.push(command); return this.inner.execute(command) }
  batch(commands) { this.batches.push(commands); return this.inner.batch(commands) }
}

function principal() {
  const permissions = Object.fromEntries(AUTH_MODULES.map(module => [module, { view: true, create: true, edit: true, delete: true, export: true }]))
  return {
    sessionUid: 'session:test', userUid: 'user:test', username: 'tester', displayName: '测试管理员', email: 'test@example.invalid',
    roleUid: 'role:test', roleName: '测试角色', roleLevel: 100, roleIsSystem: true,
    visibilityScopes: new Set(['public', 'authenticated', 'staff', 'owner', 'hidden']), permissions, mustChangePassword: false,
  }
}

function harness(kind = 'sqlite') {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  applyMigrations(syncConnection(db), migrations)
  const base = kind === 'sqlite' ? new SqliteAdapter(syncConnection(db)) : new D1Adapter(new D1Double(db))
  const adapter = new RecordingAdapter(base)
  let counter = 0
  let millis = Date.parse('2026-09-01T00:00:00.000Z')
  const service = new AdminContentService(adapter, principal(), {
    newUid: () => `test-${++counter}`,
    now: () => new Date(millis += 10),
  })
  return { db, adapter, service, close: () => db.close() }
}

async function createProfile(service, name, role, bio = null) {
  return service.create('profiles', { values: { name, role, bio } })
}

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: list uses a bounded projection and returns facets`, async () => {
    const h = harness(kind)
    try {
      await createProfile(h.service, '林知远', '教授', 'X'.repeat(100_000))
      await createProfile(h.service, '周青', '副教授')
      await createProfile(h.service, '陈墨', '教授')
      h.adapter.batches.length = 0
      const query = parseAdminContentQuery(adminContentModule('profiles'), { page: '1', pageSize: '10', f_role: '教授' })
      const result = await h.service.list('profiles', query)
      assert.equal(result.total, 2)
      assert.deepEqual(result.items.map(item => item.values.name), ['林知远', '陈墨'])
      assert.equal(Object.hasOwn(result.items[0].values, 'bio'), false)
      assert.deepEqual(result.facets.role.map(item => item.value), ['教授', '副教授'])
      const sql = h.adapter.batches.at(-1)[0].sql
      assert.match(sql, /^SELECT "uid", "created_at", "updated_at",/u)
      assert.doesNotMatch(sql, /"bio"/u)
      assert.doesNotMatch(sql, /SELECT \*/u)
    }
    finally { h.close() }
  })
}

test('create, update, batch and delete maintain audit and cache generations', async () => {
  const h = harness()
  try {
    const first = await createProfile(h.service, '成员甲', '教授')
    const second = await createProfile(h.service, '成员乙', '研究员')
    const third = await createProfile(h.service, '成员丙', '博士后')
    const updated = await h.service.update('profiles', first.record.uid, {
      values: { title: '教授、博士生导师' }, expectedUpdatedAt: first.record.updatedAt,
    })
    assert.equal(updated.record.values.title, '教授、博士生导师')
    await assert.rejects(
      () => h.service.update('profiles', first.record.uid, { values: { title: '陈旧覆盖' }, expectedUpdatedAt: first.record.updatedAt }),
      error => error?.code === 'ADMIN_CONTENT_CONFLICT',
    )
    const latestSecond = await h.service.detail('profiles', second.record.uid)
    const latestThird = await h.service.detail('profiles', third.record.uid)
    const batch = await h.service.batchUpdate('profiles', {
      uids: [latestSecond.uid, latestThird.uid],
      expectedUpdatedAtByUid: { [latestSecond.uid]: latestSecond.updatedAt, [latestThird.uid]: latestThird.updatedAt },
      values: { visibility: 'public' },
    })
    assert.equal(batch.updated, 2)
    assert.equal((await h.service.detail('profiles', latestSecond.uid)).values.visibility, 'public')
    const deleted = await h.service.delete('profiles', latestThird.uid, { expectedUpdatedAt: (await h.service.detail('profiles', latestThird.uid)).updatedAt })
    assert.equal(deleted.deleted, true)
    await assert.rejects(() => h.service.detail('profiles', latestThird.uid), error => error?.code === 'ADMIN_CONTENT_NOT_FOUND')
    assert.ok(Number(h.db.prepare('SELECT count(*) AS total FROM operation_logs').get().total) >= 6)
    assert.ok(Number(h.db.prepare('SELECT count(*) AS total FROM cache_generations').get().total) >= 1)
    assert.equal(Number(h.db.prepare('SELECT count(*) AS total FROM admin_mutation_guards').get().total), 0)
  }
  finally { h.close() }
})

test('create accepts one portable custom UID and database uniqueness remains authoritative', async () => {
  const h = harness()
  try {
    const uid = 'profiles:portable-backup-id'
    const created = await h.service.create('profiles', { uid, values: { name: '可迁移成员' } })
    assert.equal(created.record.uid, uid)
    assert.equal((await h.service.detail('profiles', uid)).values.name, '可迁移成员')
    await assert.rejects(
      () => h.service.create('profiles', { uid, values: { name: '重复成员' } }),
      error => Boolean(error?.code === 'ADMIN_CONTENT_VALIDATION' && error?.fieldErrors?.uid),
    )
  }
  finally { h.close() }
})

test('concurrent creates cannot commit the same custom UID twice', async () => {
  const h = harness()
  try {
    const uid = 'profiles:concurrent-portable-id'
    const results = await Promise.allSettled([
      h.service.create('profiles', { uid, values: { name: '并发成员甲' } }),
      h.service.create('profiles', { uid, values: { name: '并发成员乙' } }),
    ])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(results.filter(result => result.status === 'rejected').length, 1)
    assert.equal(Number(h.db.prepare('SELECT COUNT(*) AS total FROM profiles WHERE uid=?').get(uid).total), 1)
  }
  finally { h.close() }
})

test('a stale member makes a batch fail atomically', async () => {
  const h = harness()
  try {
    const one = (await createProfile(h.service, '原子甲', '教授')).record
    const two = (await createProfile(h.service, '原子乙', '教授')).record
    await h.service.update('profiles', two.uid, { values: { role: '研究员' }, expectedUpdatedAt: two.updatedAt })
    await assert.rejects(() => h.service.batchUpdate('profiles', {
      uids: [one.uid, two.uid],
      expectedUpdatedAtByUid: { [one.uid]: one.updatedAt, [two.uid]: two.updatedAt },
      values: { visibility: 'public' },
    }), error => error?.code === 'ADMIN_CONTENT_CONFLICT')
    assert.equal((await h.service.detail('profiles', one.uid)).values.visibility, 'hidden')
    assert.equal((await h.service.detail('profiles', two.uid)).values.visibility, 'hidden')
  }
  finally { h.close() }
})

test('module-specific validation rejects impossible dates and normalizes DOI', async () => {
  const h = harness()
  try {
    await assert.rejects(() => h.service.create('projects', { values: {
      name: '错误日期项目', start_date: '2026-12-01', end_date: '2026-01-01',
    } }), error => Boolean(error?.code === 'ADMIN_CONTENT_VALIDATION' && error.fieldErrors.end_date))
    const publication = await h.service.create('publications', { values: {
      title: 'A Reliable Paper', doi: 'https://doi.org/10.1000/XYZ', year: 2026,
    } })
    assert.equal(publication.record.values.doi, '10.1000/xyz')
    const profile = adminContentModule('profiles')
    assert.throws(() => normalizeAdminContentValues(profile, { orcid: '0000-0000-0000-0000' }, 'update', { name: '某人' }), error => error?.code === 'ADMIN_CONTENT_VALIDATION')
  }
  finally { h.close() }
})

test('read-only messages cannot be created, deleted or rewritten', async () => {
  const h = harness()
  try {
    await assert.rejects(() => h.service.create('messages', { values: { content: 'x' } }), error => error?.code === 'ADMIN_CONTENT_FORBIDDEN')
    const definition = adminContentModule('messages')
    assert.throws(() => normalizeAdminContentValues(definition, { content: 'changed' }, 'update', { content: 'original', status: 'new', visibility: 'hidden' }), error => error?.code === 'ADMIN_CONTENT_VALIDATION')
  }
  finally { h.close() }
})

test('all nine generic modules can normalize their minimum create payload or deliberate read-only policy', () => {
  const samples = {
    profiles: { name: '成员' }, research_interests: { name: '方向' }, publications: { title: '论文' }, projects: { name: '项目' }, patents: { name: '专利' },
    students: { name: '学生' }, student_category_displays: { key: 'doctoral', label: '博士生' }, courses: { name: '课程' },
  }
  for (const definition of allAdminContentModules()) {
    if (!definition.canCreate) continue
    assert.doesNotThrow(() => normalizeAdminContentValues(definition, samples[definition.module], 'create'), definition.module)
  }
})
