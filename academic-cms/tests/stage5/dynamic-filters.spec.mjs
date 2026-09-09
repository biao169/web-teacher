import assert from 'node:assert/strict'
import test from 'node:test'
import { core, createHarness, createPublicServices, insert, iso, request, seedPublicContent } from '../helpers/offline-stage5.mjs'

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: classification members trim, deduplicate and match exactly without changing numbering`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    const add = (uid, index, year, visibility = 'public') => insert(h.db, `INSERT INTO publications(uid,created_at,updated_at,title,venue,index_type,publication_type,year,visibility) VALUES(?,?,?,?,?,?,?,?,?)`, uid, iso(), iso(), uid, 'Journal A', index, '期刊论文； 综述 ;期刊论文', year, visibility)
    add('a', 'SCI； EI; SCI ;', 2021); add('b', 'SCIE', 2022); add('c', 'SCI, EI', 2023); add('hidden', 'SECRET', 2026, 'hidden')
    const store = new core.PublicContentStore(h.adapter)
    const result = await store.publications(request('zh', { filters: { indexType: 'SCI', publicationType: '综述', venue: 'Journal A' } }))
    assert.deepEqual(result.items.map(item => [item.uid, item.displayNumber]), [['c', 3], ['a', 1]])
    assert.equal(result.total, 2); assert.equal(result.totalPublic, 3)
    assert.equal(result.facets.find(item => item.key === 'indexType' && item.value === 'SCI').count, 2)
    assert.equal(result.facets.find(item => item.key === 'publicationType' && item.value === '期刊论文').count, 2)
    assert.ok(!result.facets.some(item => item.value.includes('SECRET') || item.value.includes(';') || item.value.includes('；')))
    const single = await store.publications(request('en', { filters: { indexType: 'SCIE' } }))
    assert.equal(single.total, 1)
    assert.equal((await store.publications(request('zh', { filters: { indexType: 'SC' } }))).total, 0)
  })

  test(`${kind}: candidate search can reach beyond the initial 40 and preserves cross-filter counts`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    for (let i = 0; i < 65; i++) insert(h.db, `INSERT INTO publications(uid,created_at,updated_at,title,venue,year,visibility) VALUES(?,?,?,?,?,?,'public')`, `p${i}`, iso(), iso(), `Paper ${i}`, `Journal ${String(i).padStart(2, '0')}`, i % 2 ? 2025 : 2026)
    insert(h.db, `INSERT INTO publications(uid,created_at,updated_at,title,venue,year,visibility) VALUES('secret',?,?, 'Hidden', 'Secret journal', 2026, 'hidden')`, iso(), iso())
    const store = new core.PublicContentStore(h.adapter)
    const first = await store.publications(request())
    assert.equal(first.facets.filter(item => item.key === 'venue').length, 40)
    const pages = []
    for (let page = 1; page <= 4; page++) {
      const result = await store.filterOptions('publications', request(), 'venue', null, page, iso())
      assert.equal(result.page, page); assert.equal(result.hasMore, page < 4)
      pages.push(...result.options)
    }
    assert.equal(new Set(pages.map(item => item.value)).size, 65)
    const retained = await store.publications(request('zh', { filters: { venue: 'Journal 64' } }))
    assert.equal(retained.facets.find(item => item.key === 'venue' && item.value === 'Journal 64').count, 1)
    const found = await store.filterOptions('publications', request('en', { filters: { year: '2026', venue: 'Journal 00' } }), 'venue', '64', 1, iso())
    assert.deepEqual(found.options.map(item => [item.value, item.count]), [['Journal 64', 1]])
    assert.equal((await store.filterOptions('publications', request(), 'venue', 'Secret', 1, iso())).options.length, 0)
    assert.equal((await store.filterOptions('publications', request(), 'venue', '%', 1, iso())).options.length, 0)
    const vm = (await createPublicServices(h.adapter, { value: Date.parse(iso()) }).publications.list(request('zh', { filters: { venue: 'Journal 64', year: '1900' } }))).viewModel
    assert.equal(vm.filters.find(group => group.key === 'venue').options[0].value, 'Journal 64')
    assert.equal(vm.filters.find(group => group.key === 'venue').options[0].selected, true)
    assert.equal(vm.filters.find(group => group.key === 'venue').options[0].count, 0)
    await assert.rejects(store.filterOptions('profiles', request(), 'venue', null, 1, iso()))
    await assert.rejects(store.filterOptions('publications', request(), 'title; DROP TABLE publications', null, 1, iso()))
  })

  test(`${kind}: new project, patent and news fields reuse public visibility and fixed publication cutoff`, async t => {
    const h = createHarness(kind); t.after(() => h.close()); const seed = await seedPublicContent(h)
    insert(h.db, `UPDATE projects SET fund_name='重点基金', project_role='主持' WHERE uid='project:one'`)
    insert(h.db, `UPDATE news SET category='学术报告；团队动态; 学术报告', content='needle-only-in-body' WHERE uid='news:one'`)
    insert(h.db, `UPDATE students SET category='博士生；访问学生; 博士生', direction='系统；数据库' WHERE uid='student:one'`)
    const services = createPublicServices(h.adapter, { value: Date.parse(seed.at) })
    const projects = (await services.projects.list(request('zh', { filters: { year: '2025', fundName: '重点基金', role: '主持' } }))).viewModel
    assert.equal(projects.items[0].projectNumber, 'NSFC-001')
    assert.equal(projects.pagination.totalItems, 1)
    const patents = (await services.patents.list(request('en', { filters: { year: '2026' } }))).viewModel
    assert.equal(patents.pagination.totalItems, 1)
    const news = (await services.news.list(request('zh', { search: 'needle-only-in-body', filters: { category: '学术报告', year: seed.at.slice(0, 4) } }))).viewModel
    assert.equal(news.pagination.totalItems, 1)
    assert.ok(!news.items.some(item => item.slug === 'future-news'))
    const students = (await services.students.list(request('zh', { filters: { category: '访问学生', direction: '数据库' } }))).viewModel
    assert.equal(students.pagination.totalItems, 1)
    assert.match(students.items[0].category, /博士生/)
    assert.match(students.items[0].category, /访问学生/)
    const newsCandidates = await services.store.filterOptions('news', request('zh', { search: 'needle-only-in-body' }), 'category', null, 1, seed.at)
    assert.equal(newsCandidates.options.find(item => item.value === '学术报告').count, 1)
  })
}
