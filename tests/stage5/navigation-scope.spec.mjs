import test from 'node:test'
import assert from 'node:assert/strict'
import { load, createHarness, createPublicServices, seedPublicContent, iso, insert } from '../helpers/offline-stage5.mjs'
import { createHomeService } from '../helpers/offline-stage4.mjs'
const { parsePublicNavigationRequest } = load('server/services/public/public-navigation-scope.js')

function navigation(h, uid, path) {
  insert(h.db, `INSERT INTO navigation_items(uid,created_at,updated_at,title,title_en,kind,path,location,visibility,enabled,sort_order)
    VALUES(?,?,?,'2026年论文','2026 publications','button',?,'header','public',1,1)`, uid, iso(), iso(), path)
}

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: fixed navigation scope governs rows, search, candidates, pagination and cache identity`, async t => {
    const h = createHarness(kind); t.after(() => h.close()); await seedPublicContent(h)
    insert(h.db, 'DELETE FROM publications')
    for (let index = 0; index < 30; index++) insert(h.db, `INSERT INTO publications
      (uid,created_at,updated_at,title,year,venue,visibility) VALUES(?,?,?, ?,2026,?,'public')`, `scope:${index}`, iso(), iso(), `Robotics ${index} ${index % 2 ? 'Vision' : 'Planning'}`, index % 2 ? 'Journal A' : 'Journal B')
    insert(h.db, `INSERT INTO publications(uid,created_at,updated_at,title,year,venue,visibility) VALUES('scope:outside',?,?,'Robotics Vision',2025,'Outside Journal','public')`, iso(), iso())
    navigation(h, 'nav:2026', '/publications?year=2026')
    const services = createPublicServices(h.adapter, { value: Date.parse(iso()) })
    const parse = query => parsePublicNavigationRequest(h.adapter, 'publications', { locale: 'zh', nav: 'nav:2026', ...query })
    const request = await parse({})
    const first = (await services.publications.list(request)).viewModel
    assert.equal(first.pagination.totalItems, 30); assert.equal(first.totalPublic, 31)
    assert.equal(first.query.scope.uid, 'nav:2026'); assert.equal(first.meta.title, '2026年论文')
    assert.ok(!first.filters.some(group => group.key === 'year'))
    assert.ok(first.items.every(item => item.year === 2026))
    assert.equal((await services.publications.list(request)).cache, 'hit')
    const second = (await services.publications.list(await parse({ page: 2 }))).viewModel
    assert.equal(second.pagination.from, 13)
    assert.equal(new Set([...first.items, ...second.items].map(item => item.uid)).size, 24)
    assert.ok(new URL(second.meta.path, 'https://fixture.invalid').searchParams.get('nav') === 'nav:2026')
    const searched = (await services.publications.list(await parse({ q: 'Vision', venue: 'Journal A' }))).viewModel
    assert.equal(searched.pagination.totalItems, 15)
    assert.ok(searched.items.every(item => item.title.includes('Vision') && item.year === 2026))
    const options = await services.store.filterOptions('publications', request, 'venue', null, 1, iso())
    assert.deepEqual(options.options.map(item => item.value).sort(), ['Journal A', 'Journal B'])
    await assert.rejects(() => services.store.filterOptions('publications', request, 'year', null, 1, iso()), error => error.code === 'PUBLIC_INPUT')
    await assert.rejects(() => parse({ year: 2025 }), error => error.code === 'PUBLIC_INPUT')
    const normal = (await services.publications.list(await parsePublicNavigationRequest(h.adapter, 'publications', { locale: 'zh', year: 2026 }))).viewModel
    assert.equal(normal.query.scope, undefined); assert.ok(normal.filters.some(group => group.key === 'year'))
    insert(h.db, "UPDATE navigation_items SET path='/publications?year=2025',updated_at=? WHERE uid='nav:2026'", iso(Date.parse(iso()) + 1000))
    assert.equal((await services.publications.list(await parse({}))).viewModel.pagination.totalItems, 1)
    insert(h.db, "UPDATE navigation_items SET enabled=0 WHERE uid='nav:2026'")
    await assert.rejects(() => parse({}), error => error.code === 'PUBLIC_NOT_FOUND')
  })

  test(`${kind}: configured search is ANDed with visitor search and scope applies across all modules`, async t => {
    const h = createHarness(kind); t.after(() => h.close()); await seedPublicContent(h)
    navigation(h, 'nav:search', '/publications?q=Edge')
    insert(h.db, "UPDATE publications SET title='Edge Vision' WHERE uid='publication:one'")
    insert(h.db, "UPDATE publications SET title='Cloud Vision' WHERE uid='publication:two'")
    const services = createPublicServices(h.adapter, { value: Date.parse(iso()) })
    const scoped = await parsePublicNavigationRequest(h.adapter, 'publications', { locale: 'en', nav: 'nav:search', q: 'Vision' })
    const list = (await services.publications.list(scoped)).viewModel
    assert.deepEqual(list.items.map(item => item.uid), ['publication:one'])
    assert.equal(list.query.scope.search, 'Edge'); assert.equal(list.query.search, 'Vision')
    const targets = [['team', 'organization', '示例大学'], ['projects', 'source', '国家自然科学基金'], ['patents', 'legalStatus', '已授权'], ['students', 'category', '博士生'], ['courses', 'semester', '2026春'], ['news', 'year', '2026'], ['research', 'q', '系统']]
    for (const [module, field, value] of targets) {
      navigation(h, `scope-nav:${module}`, `/${module}?${new URLSearchParams({ [field]: value })}`)
      const request = await parsePublicNavigationRequest(h.adapter, module, { locale: 'zh', nav: `scope-nav:${module}` })
      const result = (await services[module].list(request)).viewModel
      assert.equal(result.query.scope.uid, `scope-nav:${module}`)
      if (field !== 'q') { assert.equal(result.query.filters[field], value); assert.ok(!result.filters.some(group => group.key === field)) }
      else assert.equal(result.query.scope.search, value)
    }
    await assert.rejects(() => parsePublicNavigationRequest(h.adapter, 'projects', { locale: 'zh', nav: 'nav:search' }), error => error.code === 'PUBLIC_INPUT')
  })

  test(`${kind}: home and teacher detail expose configured links and zero values, project amounts remain in stored units`, async t => {
    const h = createHarness(kind); t.after(() => h.close()); await seedPublicContent(h)
    insert(h.db, "UPDATE profiles SET google_scholar='https://scholar.google.com/citations?user=fixture',google_scholar_value=1234,github_value=0,cnki_value=99 WHERE uid='profile:lead'")
    insert(h.db, "UPDATE projects SET amount='12.5000' WHERE uid='project:one'")
    const clock = { value: Date.parse(iso()) }, home = createHomeService(h.adapter, clock).service, services = createPublicServices(h.adapter, clock)
    for (const locale of ['zh', 'en']) {
      const model = (await home.home(locale)).viewModel
      assert.equal(model.featuredProfile.links.find(link => link.kind === 'google-scholar').value, '1234')
      assert.equal(model.featuredProfile.links.find(link => link.kind === 'github').value, '0')
      assert.ok(!model.featuredProfile.links.some(link => link.kind === 'cnki'), 'value alone does not create a dead link')
      assert.deepEqual((await services.team.detail(locale, 'profile:lead')).viewModel.item.links, model.featuredProfile.links)
      assert.equal(model.projects.find(item => item.uid === 'project:one').amount, '12.5000')
      assert.equal((await services.projects.list({ locale, page: 1, pageSize: 12, search: null, filters: {} })).viewModel.items.find(item => item.uid === 'project:one').amount, '12.5000')
    }
  })
}
