import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { core, createHarness, root, recordingAdapter, request, iso } from '../helpers/offline-stage5.mjs'

function plan(db, sql, params = []) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map(row => String(row.detail))
}

function assertIndexed(details, indexName) {
  assert.ok(details.some(detail => detail.includes(`USING INDEX ${indexName}`)), details.join('\n'))
  assert.ok(!details.some(detail => /^SCAN /u.test(detail)), details.join('\n'))
}

test('actual eight-module list queries report ordering indexes and expression-sort costs', async t => {
  const h=createHarness('sqlite');t.after(()=>h.close())
  const tracked=recordingAdapter(h.adapter),store=new core.PublicContentStore(tracked)
  const cases=[['teamList','idx_profiles_visibility_active_sort'],['publications','idx_publications_visibility_year'],['projects','idx_projects_visibility_start_date'],['patents',null],['students',null],['research',null],['news','idx_news_published'],['courses','idx_courses_visibility_semester']]
  for(const [module,index] of cases) {
    tracked.commands.length=0
    await store[module](request(),iso())
    const command=tracked.commands[0].commands[0]
    const details=plan(h.db,command.sql,command.params)
    assert.ok(details.some(detail=>/USING (?:COVERING )?INDEX/u.test(detail)),details.join('\n'))
    const temporarySort=details.some(detail=>detail.includes('TEMP B-TREE'))
    if(index) {assert.ok(details.some(detail=>detail.includes(index)));assert.equal(temporarySort,false)}
    t.diagnostic(JSON.stringify({module,temporarySort,details}))
  }
})

test('public detail lookups use unique identifiers and patent ordering preserves effective-date semantics explicitly', () => {
  const h = createHarness('sqlite')
  try {
    for (const [sql, params] of [
      [`SELECT uid FROM profiles WHERE uid = ? AND visibility = 'public' AND is_active = 1 LIMIT 1`, ['profile:lead']],
      [`SELECT uid FROM publications WHERE uid = ? AND visibility = 'public' LIMIT 1`, ['publication:one']],
      [`SELECT uid FROM projects WHERE uid = ? AND visibility = 'public' LIMIT 1`, ['project:one']],
      [`SELECT uid FROM patents WHERE uid = ? AND visibility = 'public' LIMIT 1`, ['patent:one']],
      [`SELECT uid FROM students WHERE uid = ? AND visibility = 'public' LIMIT 1`, ['student:one']],
      [`SELECT uid FROM news WHERE slug = ? AND visibility = 'public' AND published_at <= ? LIMIT 1`, ['open-dataset', '2026-08-29T00:00:00.000Z']],
      [`SELECT uid FROM research_interests WHERE uid = ? AND visibility = 'public' LIMIT 1`, ['research:one']],
      [`SELECT uid FROM courses WHERE uid = ? AND visibility = 'public' LIMIT 1`, ['course:one']],
    ]) {
      const details = plan(h.db, sql, params)
      assert.ok(details.some(detail => /USING (?:COVERING )?INDEX sqlite_autoindex_/u.test(detail)), details.join('\n'))
      assert.ok(!details.some(detail => /^SCAN /u.test(detail)), details.join('\n'))
    }
    const patentPlan = plan(h.db, `SELECT uid FROM patents WHERE visibility = 'public'
      ORDER BY COALESCE(grant_date, application_date, '0000-00-00') DESC, sort_order ASC, id ASC LIMIT 12 OFFSET 0`)
    assertIndexed(patentPlan, 'idx_patents_visibility_sort')
    assert.equal(patentPlan.filter(detail => detail.includes('USE TEMP B-TREE FOR ORDER BY')).length, 1)
  }
  finally { h.close() }
})

test('homepage aggregation reuses stage-5 parsing, localization, media, text and URL policies', async () => {
  const store = await readFile(resolve(root, 'server/services/public/public-home-store.ts'), 'utf8')
  const service = await readFile(resolve(root, 'server/services/public/public-home-service.ts'), 'utf8')
  assert.match(store, /from '\.\/public-row'/u)
  assert.match(service, /from '\.\/public-localization'/u)
  assert.match(service, /from '\.\/public-values'/u)
  assert.doesNotMatch(service, /class\s+PublicTranslationPlan|function\s+(?:plainText|safeDoi|safeExternalUrl|localizedPublicMedia)\b/u)
})
