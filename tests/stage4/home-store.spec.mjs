import test from 'node:test'
import assert from 'node:assert/strict'
import { core, createHarness, recordingAdapter, seedPublicHome, iso, insert } from '../helpers/offline-stage4.mjs'

for (const kind of ['sqlite', 'd1']) {
  test(`public home store uses one eight-statement bounded batch on ${kind}`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    await seedPublicHome(h)
    const adapter = recordingAdapter(h.adapter)
    const store = new core.PublicHomeStore(adapter)
    const snapshot = await store.load(iso())
    assert.equal(adapter.commands.length, 1)
    assert.equal(adapter.commands[0].group, 'batch')
    assert.equal(adapter.commands[0].commands.length, 8)
    assert.equal(snapshot.site?.uid, 'site:main')
    assert.equal(snapshot.profile?.uid, 'profile:lead')
    assert.deepEqual(snapshot.research.map(x => x.uid), ['research:reliable'])
    assert.deepEqual(snapshot.publications.map(x => x.uid), ['publication:one'])
    assert.deepEqual(snapshot.news.map(x => x.uid), ['news:one'])
    assert.equal(snapshot.navigation.some(x => x.uid === 'nav:hidden'), false)
  })
}

test('home read plan is stable, parameterized and projects contact permissions and excludes secrets', () => {
  const plan = core.buildHomeReadPlan(iso())
  assert.equal(plan.length, 8)
  assert.equal(plan[6].params.length, 1)
  const sql = plan.map(command => command.sql.toLowerCase()).join('\n')
  for (const forbidden of ['password_hash', 'bibtex', 'content,', 'detail_json']) {
    assert.equal(sql.includes(forbidden), false, forbidden)
  }
  assert.match(sql, /case when contact_visibility = 'public' then email else null end as public_email/)
  assert.match(sql, /limit 201/)
  assert.match(sql, /limit 20/)
  assert.match(sql, /published_at <= \?/)
})

test('home store fails closed for incomplete batches, malformed rows and duplicate UIDs', async () => {
  const goodTime = iso()
  const empty = { rows: [], changes: 0, lastInsertRowid: null }
  const totals = { ...empty, rows: [{ research: 0, publications: 0, projects: 0, news: 0, publication_generation: 0, translation_generation: 0 }] }
  await assert.rejects(() => new core.PublicHomeStore({
    kind: 'sqlite', metrics: { calls: 0, statements: 0 }, execute: async () => empty,
    batch: async () => [empty],
  }).load(goodTime), /batch is incomplete/)

  const malformedSite = { rows: [{ uid: 'site:x' }], changes: 0, lastInsertRowid: null }
  await assert.rejects(() => new core.PublicHomeStore({
    kind: 'sqlite', metrics: { calls: 0, statements: 0 }, execute: async () => empty,
    batch: async () => [malformedSite, empty, empty, empty, empty, empty, empty, totals],
  }).load(goodTime), /missing updated_at/)

  const nav = {
    uid: 'nav:x', updated_at: goodTime, title: 'X', title_en: null, kind: 'route', url_name: 'home',
    path: null, fragment: null, icon: null, style: null, location: 'header',
  }
  const duplicates = { rows: [nav, { ...nav }], changes: 0, lastInsertRowid: null }
  await assert.rejects(() => new core.PublicHomeStore({
    kind: 'sqlite', metrics: { calls: 0, statements: 0 }, execute: async () => empty,
    batch: async () => [empty, duplicates, empty, empty, empty, empty, empty, totals],
  }).load(goodTime), /duplicate UID/)
  await assert.rejects(() => new core.PublicHomeStore({
    kind: 'sqlite', metrics: { calls: 0, statements: 0 }, execute: async () => empty,
    batch: async () => Array(8).fill(empty),
  }).load('2026-08-29'), /Invalid public home read timestamp/)
})

for (const kind of ['sqlite', 'd1']) {
  test(`navigation includes more than fifty links and rejects overflow on ${kind}`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    for (let i=0;i<75;i++) insert(h.db, `INSERT INTO navigation_items(uid,created_at,updated_at,title,kind,path,location,enabled,visibility,sort_order)
      VALUES(?,?,?,?,? ,?,? ,1,'public',?)`, `nav-${i}`,iso(),iso(),`Link ${i}`,'button','/publications','header',i)
    const store = new core.PublicHomeStore(h.adapter)
    const snapshot = await store.load(iso())
    assert.equal(snapshot.navigation.length,75)
    assert.equal(snapshot.navigation.at(-1).uid,'nav-74')
    for (let i=75;i<201;i++) insert(h.db, `INSERT INTO navigation_items(uid,created_at,updated_at,title,kind,path,location,enabled,visibility,sort_order)
      VALUES(?,?,?,?,? ,?,? ,1,'public',?)`, `nav-${i}`,iso(),iso(),`Link ${i}`,'button','/publications','footer',i)
    await assert.rejects(() => store.load(iso()), /budget|limit|many|exceed/i)
  })
}
