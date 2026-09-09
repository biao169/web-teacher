import type { DatabaseAdapter } from '../../db/contracts'
import { DATABASE_LIMITS } from '../../db/contracts'
import { DatabaseError } from '../../db/errors'
import { Repository } from '../../db/repository'
import { read, write } from '../../db/query'
import { buildHomeReadPlan, buildTranslationReadPlan, readCurrentTranslations } from '../../db/read-plans'
import type { Insert, TableName } from '../../db/models'
import { catalog } from '../../db/catalog'

export interface Harness { adapter: DatabaseAdapter }
export interface ContractCase { name: string; run(harness: Harness): Promise<void> }
export function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
}
export function ok(condition: unknown, message = 'Assertion failed'): asserts condition { if (!condition) throw new Error(message) }
export async function rejects(operation: () => unknown | Promise<unknown>, code: string): Promise<void> {
  try { await operation() }
  catch (error) { if (!(error instanceof DatabaseError) || error.code !== code) throw new Error(`Expected ${code}, got ${String(error)}`, { cause: error }); return }
  throw new Error(`Expected rejection ${code}`)
}
const fixedTime = '2026-08-29T00:00:00.000Z'
function repository(adapter: DatabaseAdapter) { return new Repository(adapter, { now: () => new Date(fixedTime) }) }
const hash = 'a'.repeat(64)
const translation = { source_hash: hash, source_ref_key: 'profiles:teacher:name', source_text: '教师', source_lang: 'zh', target_lang: 'en' }
const minimal: Record<TableName, Record<string, unknown>> = {
  media_assets: { object_key: 'images/a.png' }, auth_roles: { name: 'Editors' },
  auth_users: { username: 'editor', password_hash: 'test-only-not-a-login-hash', role_uid: 'fixture-role' },
  auth_permissions: { role_uid: 'fixture-role', module: 'publications' }, profiles: { name: '教师' },
  site_settings: { site_name: '学术主页' }, global_settings: {}, navigation_items: { title: '首页' },
  research_interests: { name: '人工智能' }, publications: { title: '论文' }, projects: { name: '项目' },
  patents: { name: '专利' }, students: { name: '学生' }, student_category_displays: { key: 'phd', label: '博士' },
  news: { title: '动态', slug: 'first-news' }, courses: { name: '课程' }, messages: { content: '合作咨询' },
  translation_cache: translation, operation_logs: { action: 'test', module: 'publications' },
}
export const contractCases: ContractCase[] = Object.keys(catalog).map(name => ({
  name: `complete row round-trip: ${name}`,
  async run({ adapter }) {
    const repo = repository(adapter), table = name as TableName
    if (table === 'auth_users' || table === 'auth_permissions') await repo.create('auth_roles', { uid: 'fixture-role', name: 'Role' })
    const created = await repo.create(table, minimal[table] as unknown as Insert<typeof table>)
    ok(created.id > 0); ok(created.uid.length > 0); equal(created.created_at, fixedTime)
    const loaded = await repo.findByUid(table, created.uid)
    equal(loaded, created)
    equal(Object.keys(created).sort(), Object.keys(catalog[table].columns).sort())
  },
}))
contractCases.push(
  { name: 'defaults are private, nullable and boolean-safe', async run({ adapter }) {
    const repo = repository(adapter), row = await repo.create('profiles', { name: '教师' })
    equal(row.visibility, 'hidden'); equal(row.contact_visibility, 'hidden'); equal(row.is_featured, false); equal(row.avatar_key, null)
    const settings = await repo.create('global_settings', {})
    equal(settings.allow_public_registration, false); equal(settings.translation_providers, []); equal(settings.translation_job_state, {})
  } },
  { name: 'booleans and integers reject implicit coercion', async run({ adapter }) {
    const repo = repository(adapter)
    await rejects(() => repo.create('profiles', { name: 'x', is_active: 'false' } as never), 'DB_INPUT')
    await rejects(() => repo.create('publications', { title: 'x', year: '2026' } as never), 'DB_INPUT')
    await rejects(() => repo.create('profiles', { name: 'x', sort_order: Number.MAX_SAFE_INTEGER + 1 }), 'DB_INPUT')
    await rejects(() => repo.create('profiles', { name: null } as never), 'DB_NOT_NULL')
    equal(adapter.metrics.calls, 0)
  } },
  { name: 'null, JSON and exact decimal preserve meaning', async run({ adapter }) {
    const repo = repository(adapter)
    const row = await repo.create('projects', { name: 'funding', amount: '123456789012345678.1200', summary: null })
    equal(row.amount, '123456789012345678.1200'); equal(row.summary, null)
    const role = await repo.create('auth_roles', { name: 'role', visibility_scopes: ['public', 'staff'] })
    equal(role.visibility_scopes, ['public', 'staff'])
    await rejects(() => repo.create('projects', { name: 'x', amount: 0.1 } as never), 'DB_INPUT')
    await rejects(() => repo.create('global_settings', { translation_job_state: [] }), 'DB_INPUT')
    await rejects(() => repo.create('auth_roles', { name: 'x', visibility_scopes: 'public' } as never), 'DB_INPUT')
  } },
  { name: 'calendar dates and UTC timestamps are validated', async run({ adapter }) {
    const repo = repository(adapter)
    const row = await repo.create('projects', { name: 'valid', start_date: '2024-02-29' })
    equal(row.start_date, '2024-02-29')
    await rejects(() => repo.create('projects', { name: 'invalid', start_date: '2025-02-29' }), 'DB_INPUT')
    await rejects(() => repo.create('news', { title: 'invalid', slug: 'invalid', published_at: '2026-08-29T08:00:00+08:00' }), 'DB_INPUT')
    await rejects(() => adapter.execute(write("INSERT INTO projects(uid,name,start_date) VALUES (?,?,?)", ['bad-date','x','2026-02-30'])), 'DB_CHECK')
  } },
  { name: 'SQL identifiers and unknown input fields fail closed', async run({ adapter }) {
    const repo = repository(adapter)
    await rejects(() => repo.list('publications; DROP TABLE profiles' as never), 'DB_INPUT')
    await rejects(() => repo.list('profiles', { sort: [{ field: 'name; DROP TABLE profiles', direction: 'asc' }] }), 'DB_INPUT')
    await rejects(() => repo.create('profiles', { name: 'x', accidental_field: 'x' } as never), 'DB_INPUT')
    await rejects(() => repo.create('profiles', { name: 'x', id: 3 } as never), 'DB_INPUT')
    equal(adapter.metrics.calls, 0)
  } },
  { name: 'literal search handles quotes, percent and CJK without wildcard injection', async run({ adapter }) {
    const repo = repository(adapter)
    await repo.create('publications', { title: '100% 科研 _ 成果' })
    await repo.create('publications', { title: 'unrelated' })
    equal((await repo.list('publications', { search: '%' })).total, 1)
    equal((await repo.list('publications', { search: "x' OR 1=1 --" })).total, 0)
    equal((await repo.list('publications', { search: '科研' })).total, 1)
    const term = '学'.repeat(30)
    await repo.create('publications', { title: term })
    equal((await repo.list('publications', { search: term })).total, 1)
  } },
  { name: 'pagination is stable and list/count use one call', async run({ adapter }) {
    const repo = repository(adapter)
    for (let i = 0; i < 5; i += 1) await repo.create('publications', { uid: `p${i}`, title: `Paper ${i}`, year: 2026, visibility: 'public', sort_order: 2 })
    const before = adapter.metrics.calls
    const a = await repo.list('publications', { limit: 2, filters: [{ field: 'visibility', op: 'eq', value: 'public' }] })
    equal(adapter.metrics.calls - before, 1); equal(a.total, 5); equal(a.hasMore, true)
    const b = await repo.list('publications', { limit: 2, offset: 2 })
    equal(a.items.map(row => row.uid), ['p0', 'p1']); equal(b.items.map(row => row.uid), ['p2', 'p3'])
    const empty = await repo.list('publications', { offset: 20 }); equal(empty.items, []); equal(empty.total, 5)
  } },
  { name: 'pagination and filter limits are enforced before querying', async run({ adapter }) {
    const repo = repository(adapter)
    for (const limit of [0, -1, 101, 1.5]) await rejects(() => repo.list('profiles', { limit }), 'DB_LIMIT')
    await rejects(() => repo.list('profiles', { offset: 10_001 }), 'DB_LIMIT')
    await rejects(() => repo.list('profiles', { filters: [{ field: 'uid', op: 'in', value: Array.from({ length: 101 }, (_, i) => `u${i}`) }] }), 'DB_LIMIT')
    equal(adapter.metrics.calls, 0)
  } },
  { name: 'filter semantics cover NULL, boolean, range and empty IN', async run({ adapter }) {
    const repo = repository(adapter)
    await repo.create('publications', { title: 'a', year: 2026, is_featured: true })
    await repo.create('publications', { title: 'b', year: null })
    equal((await repo.list('publications', { filters: [{ field: 'year', op: 'eq', value: null }] })).total, 1)
    equal((await repo.list('publications', { filters: [{ field: 'year', op: 'in', value: [2026, null] }] })).total, 2)
    equal((await repo.list('publications', { filters: [{ field: 'year', op: 'gte', value: 2025 }, { field: 'is_featured', op: 'eq', value: true }] })).total, 1)
    equal((await repo.list('publications', { filters: [{ field: 'uid', op: 'in', value: [] }] })).total, 0)
  } },
  { name: 'UID, slug, object key and role/module are unique', async run({ adapter }) {
    const repo = repository(adapter)
    await repo.create('profiles', { uid: 'same', name: 'a' })
    await rejects(() => repo.create('profiles', { uid: 'same', name: 'b' }), 'DB_UNIQUE')
    await repo.create('news', { title: 'a', slug: 'same' })
    await rejects(() => repo.create('news', { title: 'b', slug: 'same' }), 'DB_UNIQUE')
    await repo.create('media_assets', { object_key: 'same.pdf' })
    await rejects(() => repo.create('media_assets', { object_key: 'same.pdf' }), 'DB_UNIQUE')
    await repo.create('auth_roles', { uid: 'r', name: 'role' })
    await repo.create('auth_permissions', { role_uid: 'r', module: 'news' })
    await rejects(() => repo.create('auth_permissions', { role_uid: 'r', module: 'news' }), 'DB_UNIQUE')
  } },
  { name: 'username uniqueness is ASCII case insensitive', async run({ adapter }) {
    const repo = repository(adapter)
    await repo.create('auth_roles', { uid: 'r', name: 'role' })
    await repo.create('auth_users', { role_uid: 'r', username: 'Editor', password_hash: 'test-only' })
    await rejects(() => repo.create('auth_users', { role_uid: 'r', username: 'editor', password_hash: 'test-only' }), 'DB_UNIQUE')
  } },
  { name: 'UID merge preserves ID, creation time and inbound references', async run({ adapter }) {
    const repo = repository(adapter)
    const first = await repo.create('profiles', { uid: 'teacher', name: 'old', bio: 'keep', created_at: '2020-01-01T00:00:00.000Z' })
    await repo.create('site_settings', { uid: 'site', site_name: 's', homepage_profile_uid: 'teacher' })
    const merged = await repo.upsertByUid('profiles', { uid: 'teacher', name: 'new', created_at: fixedTime })
    equal(merged.id, first.id); equal(merged.created_at, first.created_at); equal(merged.bio, 'keep')
    equal((await repo.findByUid('site_settings', 'site'))?.homepage_profile_uid, 'teacher')
    equal((await repo.list('profiles')).total, 1)
  } },
  { name: 'optimistic updates reject stale writers and keep immutable fields', async run({ adapter }) {
    const repo = repository(adapter), row = await repo.create('profiles', { name: 'first' })
    const updated = await repo.updateByUid('profiles', row.uid, { name: 'second' }, { expectedUpdatedAt: row.updated_at })
    ok(updated.updated_at > row.updated_at)
    await rejects(() => repo.updateByUid('profiles', row.uid, { name: 'stale' }, { expectedUpdatedAt: row.updated_at }), 'DB_CONFLICT')
    await rejects(() => repo.updateByUid('profiles', row.uid, { uid: 'change' } as never), 'DB_INPUT')
    await rejects(() => repo.updateByUid('profiles', row.uid, {}), 'DB_INPUT')
    equal((await repo.findByUid('profiles', row.uid))?.name, 'second')
  } },
  { name: 'two concurrent CAS updates have one winner', async run({ adapter }) {
    const repo = repository(adapter), row = await repo.create('profiles', { name: 'original' })
    const results = await Promise.allSettled([repo.updateByUid('profiles', row.uid, { name: 'a' }, { expectedUpdatedAt: row.updated_at }), repo.updateByUid('profiles', row.uid, { name: 'b' }, { expectedUpdatedAt: row.updated_at })])
    equal(results.filter(result => result.status === 'fulfilled').length, 1)
    equal(results.filter(result => result.status === 'rejected').length, 1)
  } },
  { name: 'bulk UID lookup chunks, deduplicates and preserves requested order', async run({ adapter }) {
    const repo = repository(adapter), keys = []
    for (let i = 0; i < 181; i += 1) { keys.push(`bulk-${i}`); await repo.create('profiles', { uid: `bulk-${i}`, name: `${i}` }) }
    const before = adapter.metrics.calls
    const rows = await repo.findByUids('profiles', [...keys].reverse().concat(['bulk-1', 'missing']))
    equal(adapter.metrics.calls - before, 1); equal(rows.length, 181); equal(rows[0]?.uid, 'bulk-180'); equal(rows.at(-1)?.uid, 'bulk-0')
  } },
  { name: 'empty bulk inputs do not touch the database', async run({ adapter }) {
    const repo = repository(adapter)
    equal(await repo.findByUids('profiles', []), []); equal(await repo.mediaByKeys([]), [])
    equal((await readCurrentTranslations(adapter, [], 'en')).size, 0); equal(adapter.metrics.calls, 0)
  } },
  { name: 'batch duplicate failure rolls back the complete group', async run({ adapter }) {
    await rejects(() => adapter.batch([
      write('INSERT INTO profiles(uid,name) VALUES (?,?)', ['rollback', 'one']),
      write('INSERT INTO profiles(uid,name) VALUES (?,?)', ['rollback', 'two']),
    ]), 'DB_UNIQUE')
    equal((await repository(adapter).list('profiles')).total, 0)
    await repository(adapter).create('profiles', { uid: 'after', name: 'usable after rollback' })
  } },
  { name: 'D1 binding and statement budgets also apply to SQLite', async run({ adapter }) {
    await rejects(() => adapter.execute(read('SELECT 1', Array.from({ length: 101 }, () => 1))), 'DB_LIMIT')
    await rejects(() => adapter.batch(Array.from({ length: 51 }, () => read('SELECT 1'))), 'DB_LIMIT')
    await rejects(() => adapter.execute(read('SELECT 1 /*' + '中'.repeat(34_000) + '*/')), 'DB_LIMIT')
    equal(await adapter.batch([]), []); equal(adapter.metrics.calls, 0)
    equal(DATABASE_LIMITS.parameters, 100)
  } },
  { name: 'foreign keys reject dangling references and referenced media deletion', async run({ adapter }) {
    const repo = repository(adapter)
    await rejects(() => repo.create('profiles', { name: 'missing', avatar_key: 'not-there.png' }), 'DB_FOREIGN_KEY')
    const media = await repo.create('media_assets', { object_key: 'avatar.png' })
    await repo.create('profiles', { name: 'teacher', avatar_key: media.object_key })
    await rejects(() => repo.deleteByUid('media_assets', media.uid), 'DB_FOREIGN_KEY')
  } },
  { name: 'deleting a linked publication clears optional news reference', async run({ adapter }) {
    const repo = repository(adapter), paper = await repo.create('publications', { title: 'paper' })
    const news = await repo.create('news', { title: 'news', slug: 'linked', related_publication_uid: paper.uid })
    equal(await repo.deleteByUid('publications', paper.uid), true)
    equal((await repo.findByUid('news', news.uid))?.related_publication_uid, null)
    equal(await repo.deleteByUid('publications', paper.uid), false)
  } },
  { name: 'sensitive and audit tables reject generic deletion', async run({ adapter }) {
    await rejects(() => repository(adapter).deleteByUid('operation_logs', 'x'), 'DB_FORBIDDEN')
    await rejects(() => repository(adapter).deleteByUid('auth_roles', 'x'), 'DB_FORBIDDEN')
    equal(adapter.metrics.calls, 0)
  } },
  { name: 'single active site is enforced and switchable atomically', async run({ adapter }) {
    const repo = repository(adapter)
    await repo.create('site_settings', { uid: 'one', site_name: 'one', is_active: true })
    await rejects(() => repo.create('site_settings', { site_name: 'two', is_active: true }), 'DB_UNIQUE')
    await repo.create('site_settings', { uid: 'two', site_name: 'two' })
    await adapter.batch([write('UPDATE site_settings SET is_active = 0 WHERE uid = ?', ['one']), write('UPDATE site_settings SET is_active = 1 WHERE uid = ?', ['two'])])
    equal((await repo.findByUid('site_settings', 'two'))?.is_active, true)
  } },
  { name: 'translation lookup matches field, hash, language and current success', async run({ adapter }) {
    const repo = repository(adapter)
    await repo.create('translation_cache', { ...translation, uid: 'valid', translated_text: 'Teacher', status: 'success', is_current: true, is_manual: true })
    await repo.create('translation_cache', { ...translation, source_ref_key: 'other', translated_text: 'Other', status: 'success', is_current: true })
    await repo.create('translation_cache', { ...translation, source_ref_key: 'failed', status: 'failed', is_current: true })
    const result = await readCurrentTranslations(adapter, [{ sourceRefKey: translation.source_ref_key, sourceHash: hash }, { sourceRefKey: 'failed', sourceHash: hash }], 'en')
    equal(result.size, 1); equal(result.get(translation.source_ref_key)?.translated_text, 'Teacher')
    equal((await readCurrentTranslations(adapter, [{ sourceRefKey: translation.source_ref_key, sourceHash: 'b'.repeat(64) }], 'en')).size, 0)
    equal((await readCurrentTranslations(adapter, [{ sourceRefKey: translation.source_ref_key, sourceHash: hash }], 'fr')).size, 0)
    await rejects(() => repo.create('translation_cache', { ...translation, status: 'success', is_current: true }), 'DB_UNIQUE')
  } },
  { name: 'translation reads split two-parameter keys without a 100-bind overflow', async run({ adapter }) {
    const refs = Array.from({ length: 100 }, (_, i) => ({ sourceRefKey: `ref-${i}`, sourceHash: hash }))
    const plan = buildTranslationReadPlan(refs, 'en')
    equal(plan.length, 3); ok(plan.every(command => command.params.length <= 100))
    equal((await readCurrentTranslations(adapter, refs, 'en')).size, 0)
    await rejects(() => buildTranslationReadPlan([{ sourceRefKey: 'x', sourceHash: hash }, { sourceRefKey: 'x', sourceHash: 'b'.repeat(64) }], 'en'), 'DB_INPUT')
  } },
  { name: 'home plan uses one batch and does not expose future/private content', async run({ adapter }) {
    const repo = repository(adapter)
    await repo.create('site_settings', { site_name: 'site', is_active: true })
    await repo.create('publications', { title: 'private', is_featured: true })
    await repo.create('publications', { title: 'public', is_featured: true, visibility: 'public' })
    await repo.create('news', { title: 'future', slug: 'future', published_at: '2027-01-01T00:00:00.000Z', visibility: 'public', is_featured: true })
    await repo.create('news', { title: 'current', slug: 'current', published_at: '2026-01-01T00:00:00.000Z', visibility: 'public', is_featured: true })
    const before = adapter.metrics.calls, results = await adapter.batch(buildHomeReadPlan(fixedTime))
    equal(adapter.metrics.calls - before, 1); equal(results.length, 7)
    equal(results[4]?.rows.map(row => row.title), ['public']); equal(results[6]?.rows.map(row => row.slug), ['current'])
    ok(!JSON.stringify(results).includes('password_hash'))
  } },
  { name: 'database errors do not include SQL or sensitive values in public message', async run({ adapter }) {
    const repo = repository(adapter)
    await repo.create('profiles', { uid: 'private-token', name: 'private-name' })
    try { await repo.create('profiles', { uid: 'private-token', name: 'private-name' }) }
    catch (error) {
      ok(error instanceof DatabaseError); ok(!error.message.includes('private-token')); ok(!error.message.includes('INSERT')); return
    }
    throw new Error('Expected a duplicate error')
  } },
)

// Regression cases from the second data-integrity review.
contractCases.push(
  { name: 'JSON rejects values that JSON.stringify would silently lose', async run({ adapter }) {
    const repo = repository(adapter)
    await rejects(() => repo.create('global_settings', { translation_job_state: { value: Number.NaN } }), 'DB_INPUT')
    await rejects(() => repo.create('global_settings', { translation_job_state: { lost: undefined } } as never), 'DB_INPUT')
    await rejects(() => repo.create('global_settings', { translation_providers: new Array(2) } as never), 'DB_INPUT')
    await rejects(() => repo.create('global_settings', { translation_job_state: new Date() } as never), 'DB_INPUT')
    equal(adapter.metrics.calls, 0)
  } },
  { name: 'JSON has a bounded depth and rejects cycles', async run({ adapter }) {
    const repo = repository(adapter)
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic
    await rejects(() => repo.create('global_settings', { translation_job_state: cyclic } as never), 'DB_INPUT')
    let deep: Record<string, unknown> = {}
    for (let i = 0; i < 40; i += 1) deep = { next: deep }
    await rejects(() => repo.create('global_settings', { translation_job_state: deep } as never), 'DB_LIMIT')
  } },
  { name: 'UPSERT always advances the existing concurrency token', async run({ adapter }) {
    const repo = repository(adapter)
    const original = await repo.create('profiles', { uid: 'versioned', name: 'original' })
    const edited = await repo.updateByUid('profiles', original.uid, { name: 'edited' }, { expectedUpdatedAt: original.updated_at })
    const imported = await repo.upsertByUid('profiles', { uid: original.uid, name: 'imported', updated_at: '2020-01-01T00:00:00.000Z' })
    ok(imported.updated_at > edited.updated_at, 'UPSERT regressed the optimistic concurrency token')
    await rejects(() => repo.updateByUid('profiles', original.uid, { name: 'stale' }, { expectedUpdatedAt: edited.updated_at }), 'DB_CONFLICT')
  } },
  { name: 'updates without CAS still advance timestamps on a slow clock', async run({ adapter }) {
    const repo = repository(adapter)
    const original = await repo.create('profiles', { name: 'future clock', updated_at: '2026-09-01T00:00:00.000Z' })
    const updated = await repo.updateByUid('profiles', original.uid, { name: 'next' })
    ok(updated.updated_at > original.updated_at, 'Update regressed the concurrency token')
  } },
  { name: 'SQL constraints reject fractional and nonnumeric INTEGER values', async run({ adapter }) {
    await rejects(() => adapter.execute(write('INSERT INTO publications(uid,title,year) VALUES(?,?,?)', ['fraction', 'x', 2026.5])), 'DB_CHECK')
    await rejects(() => adapter.execute(write('INSERT INTO profiles(uid,name,sort_order) VALUES(?,?,?)', ['text-int', 'x', 'not-a-number'])), 'DB_CHECK')
  } },
)

contractCases.push(
  { name: 'exact decimal sorting and range filtering never use lexical or float order', async run({ adapter }) {
    const repo = repository(adapter)
    for (const [uid, amount] of [['nine', '9'], ['ten', '10'], ['hundred', '100'], ['large-a', '999999999999999999.9998'], ['large-b', '999999999999999999.9999']] as const) await repo.create('projects', { uid, name: uid, amount })
    const sorted = await repo.list('projects', { sort: [{ field: 'amount', direction: 'asc' }] })
    equal(sorted.items.map(row => row.uid), ['nine', 'ten', 'hundred', 'large-a', 'large-b'])
    const filtered = await repo.list('projects', { filters: [{ field: 'amount', op: 'gte', value: '999999999999999999.9999' }] })
    equal(filtered.items.map(row => row.uid), ['large-b'])
    await repo.create('projects', { uid: 'ten-formatted', name: 'ten', amount: '10.0000' })
    equal((await repo.list('projects', { filters: [{ field: 'amount', op: 'eq', value: '10' }] })).total, 2)
  } },
  { name: 'SQL decimal constraints match Repository precision and canonical integer part', async run({ adapter }) {
    for (const [uid, amount] of [['leading', '001'], ['precision', '1.12345'], ['too-large', '9999999999999999999']] as const) {
      await rejects(() => adapter.execute(write('INSERT INTO projects(uid,name,amount) VALUES(?,?,?)', [uid, 'invalid', amount])), 'DB_CHECK')
    }
    const row = await repository(adapter).create('projects', { name: 'valid-zero', amount: '0.0000' })
    equal(row.amount, '0.0000')
  } },
)

contractCases.push(
  { name: 'adapter batch cannot be escaped by transaction-control SQL', async run({ adapter }) {
    await rejects(() => adapter.batch([
      write('INSERT INTO profiles(uid,name) VALUES(?,?)', ['must-not-leak', 'one']),
      write('/* not owned by caller */ COMMIT'),
      write('INSERT INTO profiles(uid,name) VALUES(?,?)', ['must-not-leak', 'duplicate']),
    ]), 'DB_INPUT')
    equal(adapter.metrics.calls, 0)
    equal(await repository(adapter).findByUid('profiles', 'must-not-leak'), null)
  } },
  { name: 'one SqlCommand cannot conceal a second SQL statement', async run({ adapter }) {
    await rejects(() => adapter.execute(read('SELECT 1; DELETE FROM profiles;')), 'DB_INPUT')
    equal(adapter.metrics.calls, 0)
  } },
  { name: 'quoted semicolons and comments remain valid single SQL statements', async run({ adapter }) {
    const result = await adapter.execute(read("/* prefix */ SELECT 'COMMIT; it''s text' AS value; -- trailing"))
    equal(result.rows[0]?.value, "COMMIT; it's text")
  } },
)
