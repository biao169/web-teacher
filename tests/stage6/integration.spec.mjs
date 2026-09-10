import test from 'node:test'
import assert from 'node:assert/strict'
import { core, createHarness, seedHarness } from '../helpers/offline-stage6.mjs'

process.env.STAGE5_CORE_OUTPUT = process.env.STAGE6_CORE_OUTPUT
const publicTools = await import('../helpers/offline-stage5.mjs')

test('redirect validation rejects repeatedly encoded structural path segments', () => {
  for (const value of [
    '/zh/%252e%252e/admin',
    '/zh/%252E%252E/admin',
    '/zh/%252fadmin',
    '/zh/%255cadmin',
  ]) {
    assert.equal(core.safeApplicationRedirect(value, '/zh'), '/zh', value)
  }
  assert.equal(core.safeApplicationRedirect('/zh/%E8%AE%BA%E6%96%87?page=2', '/zh'), '/zh/%E8%AE%BA%E6%96%87?page=2')
})

test('the sample dataset is consumable by every public content service', async () => {
  const h = createHarness('sqlite')
  try {
    await seedHarness(h)
    const clock = { value: Date.parse('2026-08-29T12:00:00.000Z') }
    const services = publicTools.createPublicServices(h.adapter, clock, { publicGrantSeconds: 300 })
    const request = publicTools.request
    const [team, publications, projects, patents, students, research, news, courses] = await Promise.all([
      services.team.list(request('zh')),
      services.publications.list(request('zh')),
      services.projects.list(request('zh')),
      services.patents.list(request('zh')),
      services.students.list(request('zh')),
      services.research.list('en'),
      services.news.list(request('en')),
      services.courses.list(request('zh')),
    ])
    const totals = {
      profiles: team.viewModel.pagination.totalItems,
      publications: publications.viewModel.pagination.totalItems,
      projects: projects.viewModel.pagination.totalItems,
      patents: patents.viewModel.pagination.totalItems,
      students: students.viewModel.pagination.totalItems,
      research_interests: research.viewModel.items.length,
      news: news.viewModel.pagination.totalItems,
      courses: courses.viewModel.pagination.totalItems,
    }
    assert.deepEqual(totals, {
      profiles: 12,
      publications: 15,
      projects: 12,
      patents: 10,
      students: 20,
      research_interests: 10,
      news: 15,
      courses: 10,
    })
    assert.equal(team.viewModel.items[0]?.avatar.available, true)
    assert.match(research.viewModel.items.find(item => item.uid === 'demo:research:01')?.description ?? '', /^Research direction 1\b/u)
    assert.match(news.viewModel.items[0]?.title ?? '', /Laboratory demo update/u)
  }
  finally { h.close() }
})
