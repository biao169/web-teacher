import assert from 'node:assert/strict'
import test from 'node:test'
import { core, createHarness, createPublicServices, request, seedPublicContent } from '../helpers/offline-stage5.mjs'

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: all public list services return only public bounded records`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    const seeded = await seedPublicContent(h)
    const clock = { value: Date.parse(seeded.at) }
    const services = createPublicServices(h.adapter, clock)
    const values = await Promise.all([
      services.team.list(request()), services.publications.list(request()), services.projects.list(request()),
      services.patents.list(request()), services.students.list(request()), services.research.list('zh'),
      services.news.list(request()), services.courses.list(request()),
    ])
    const [team, publications, projects, patents, students, research, news, courses] = values.map(value => value.viewModel)
    assert.deepEqual(team.items.map(item => item.uid), ['profile:lead', 'profile:member'])
    assert.deepEqual(publications.items.map(item => item.uid), ['publication:one', 'publication:two', 'publication:not-featured'])
    assert.deepEqual(projects.items.map(item => item.uid), ['project:one', 'project:two'])
    assert.deepEqual(patents.items.map(item => item.uid), ['patent:one'])
    assert.deepEqual(students.items.map(item => item.uid), ['student:one'])
    assert.equal(students.items[0].categoryKey, 'doctoral')
    assert.deepEqual(research.items.map(item => item.uid), ['research:reliable'])
    assert.deepEqual(news.items.map(item => item.uid), ['news:one', 'news:two'])
    assert.ok(!news.items.some(item => item.slug === 'future-news'))
    assert.deepEqual(courses.items.map(item => item.uid), ['course:private-material', 'course:one'])
    for (const result of values) assert.match(result.etag, /^"/u)
  })

  test(`${kind}: details enforce public visibility and sensitive-field policy`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    const seeded = await seedPublicContent(h)
    const services = createPublicServices(h.adapter, { value: Date.parse(seeded.at) })
    const profile = (await services.team.detail('zh', 'profile:lead')).viewModel.item
    assert.equal(profile.contact?.email, 'lead@example.edu')
    const member = (await services.team.detail('zh', 'profile:member')).viewModel.item
    assert.equal(member.contact, null)
    const publication = (await services.publications.detail('zh', 'publication:one')).viewModel.item
    assert.equal(publication.pdf.available, true)
    assert.equal(publication.citations.length, 4)
    assert.equal(publication.doi, '10.1234/example.2026.1')
    const project = (await services.projects.detail('zh', 'project:one')).viewModel.item
    assert.equal(project.amount, '1200000.50')
    const patent = (await services.patents.detail('en', 'patent:one')).viewModel.item
    assert.equal(patent.name, 'A method for consistency verification')
    assert.equal(patent.certificate.available, true)
    const student = (await services.students.detail('en', 'student:one')).viewModel.item
    assert.equal(student.name, 'Fang Wang')
    assert.equal(student.email, 'student@example.edu')
    const news = (await services.news.detail('en', 'open-dataset')).viewModel.item
    assert.equal(news.title, 'The lab releases its first open dataset')
    assert.ok(news.blocks.some(block => block.type === 'list'))
    assert.ok(!JSON.stringify(news.blocks).includes('<script>'))
    assert.equal(news.related.length, 3)
    const course = (await services.courses.detail('en', 'course:one')).viewModel.item
    assert.equal(course.name, 'Distributed Systems')
    assert.equal(course.syllabus.available, true)
    assert.equal(course.material.available, true)
    const privateMaterial = (await services.courses.detail('zh', 'course:private-material')).viewModel.item
    assert.equal(privateMaterial.material.available, false)
  })

  test(`${kind}: missing and hidden details are indistinguishable public 404 errors`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    const seeded = await seedPublicContent(h)
    const services = createPublicServices(h.adapter, { value: Date.parse(seeded.at) })
    for (const loader of [
      () => services.team.detail('zh', 'profile:inactive'),
      () => services.patents.detail('zh', 'patent:hidden'),
      () => services.students.detail('zh', 'student:hidden'),
      () => services.news.detail('zh', 'future-news'),
      () => services.courses.detail('zh', 'course:hidden'),
      () => services.projects.detail('zh', 'missing'),
    ]) await assert.rejects(loader, error => error?.code === 'PUBLIC_NOT_FOUND')
  })

  test(`${kind}: search, filters, pagination and featured route are canonical`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    const seeded = await seedPublicContent(h)
    const services = createPublicServices(h.adapter, { value: Date.parse(seeded.at) })
    const filtered = (await services.publications.list(request('zh', { search: '一致性', filters: Object.freeze({ year: '2026' }) }))).viewModel
    assert.deepEqual(filtered.items.map(item => item.uid), ['publication:one'])
    assert.equal(filtered.filters.find(group => group.key === 'year')?.options.find(option => option.value === '2026')?.selected, true)
    const featuredRequest = request('en', { filters: Object.freeze({ featured: '1' }) })
    const featured = (await services.publications.featured(featuredRequest)).viewModel
    assert.equal(featured.meta.path, '/en/publications/featured')
    assert.ok(featured.items.every(item => item.featured))
    await assert.rejects(
      () => services.team.list(request('zh', { page: 2, pageSize: 12 })),
      error => error?.code === 'PUBLIC_NOT_FOUND',
    )
  })
}

test('strict public query parsing rejects ambiguity and unbounded offsets', () => {
  assert.throws(() => core.parsePublicListRequest({ locale: 'zh', unknown: 'x' }, []), error => error?.code === 'PUBLIC_INPUT')
  assert.throws(() => core.parsePublicListRequest({ locale: ['zh', 'en'] }, []), error => error?.code === 'PUBLIC_INPUT')
  assert.throws(() => core.parsePublicListRequest({ locale: 'zh', pageSize: '100' }, []), error => error?.code === 'PUBLIC_LIMIT' || error?.code === 'PUBLIC_INPUT')
  assert.throws(() => core.parsePublicListRequest({ locale: 'zh', page: '100000' }, []), error => error?.code === 'PUBLIC_LIMIT')
  assert.equal(core.sqlSearchPattern('100%_x'), '%100\\%\\_x%')
})
