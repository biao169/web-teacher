import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHarness, core, root } from '../helpers/offline-db.mjs'

const h = createHarness(), db = h.db
try {
  db.exec('BEGIN')
  const pubs = db.prepare('INSERT INTO publications(uid,title,visibility,is_featured,year,sort_order) VALUES(?,?,?,?,?,?)')
  const news = db.prepare('INSERT INTO news(uid,title,slug,visibility,is_featured,published_at,sort_order) VALUES(?,?,?,?,?,?,?)')
  const students = db.prepare('INSERT INTO students(uid,name,visibility,category,status,sort_order) VALUES(?,?,?,?,?,?)')
  const media = db.prepare('INSERT INTO media_assets(uid,object_key,status,category,mime_type) VALUES(?,?,?,?,?)')
  const logs = db.prepare('INSERT INTO operation_logs(uid,action,module) VALUES(?,?,?)')
  const messages = db.prepare('INSERT INTO messages(uid,content,status) VALUES(?,?,?)')
  const translations = db.prepare('INSERT INTO translation_cache(uid,source_hash,source_ref_key,source_text,source_lang,target_lang,status,is_current) VALUES(?,?,?,?,?,?,?,?)')
  for (let i = 0; i < 1200; i += 1) {
    const visibility = i % 5 ? 'public' : 'hidden'
    pubs.run(`p${i}`, `Paper ${i}`, visibility, i % 13 === 0 ? 1 : 0, 2020 + i % 7, i % 31)
    if (i < 240) {
      const date = `2026-${String(1 + i % 8).padStart(2, '0')}-${String(1 + i % 28).padStart(2, '0')}T00:00:00.000Z`
      news.run(`n${i}`, `News ${i}`, `news-${i}`, visibility, i % 5 === 0 ? 1 : 0, date, i % 17)
      students.run(`s${i}`, `Student ${i}`, visibility, i % 3 ? 'phd' : 'master', i % 2 ? 'active' : 'graduated', i % 17)
      media.run(`m${i}`, `media/${i}.png`, i % 5 ? 'active' : 'trash', i % 2 ? 'avatar' : 'cover', 'image/png')
      logs.run(`l${i}`, 'save', i % 2 ? 'publications' : 'news')
      messages.run(`q${i}`, 'Hello', i % 2 ? 'new' : 'archived')
      translations.run(`t${i}`, 'a'.repeat(64), `ref${i}`, '原文', 'zh', 'en', 'success', 1)
    }
  }
  db.exec("INSERT INTO profiles(uid,name,visibility,is_active) VALUES('teacher','Teacher','public',1); INSERT INTO auth_roles(uid,name) VALUES('r','role'); INSERT INTO auth_permissions(uid,role_uid,module) VALUES('perm','r','publications'); INSERT INTO site_settings(uid,site_name,is_active,homepage_profile_uid) VALUES('site','Site',1,'teacher');")
  db.exec('COMMIT')
  const queries = [
    { name: 'profile UID', query: core.read('SELECT * FROM profiles WHERE uid=?', ['teacher']), index: /sqlite_autoindex_profiles/ },
    { name: 'news slug', query: core.read('SELECT * FROM news WHERE slug=?', ['news-12']), index: /sqlite_autoindex_news/ },
    { name: 'media object key', query: core.read('SELECT * FROM media_assets WHERE object_key=?', ['media/12.png']), index: /sqlite_autoindex_media_assets/ },
    { name: 'role permission', query: core.read('SELECT * FROM auth_permissions WHERE role_uid=? AND module=?', ['r','publications']), index: /(?:idx|ux)_auth_permissions_role_module/ },
    { name: 'publication year list', query: core.buildListPlan('publications', { filters: [{ field: 'visibility', op: 'eq', value: 'public' }], sort: [{ field: 'year', direction: 'desc' }, { field: 'sort_order', direction: 'asc' }] }).data, index: /idx_publications_visibility_year/ },
    { name: 'featured publications', query: core.read("SELECT uid,title FROM publications WHERE visibility='public' AND is_featured=1 ORDER BY sort_order,id LIMIT 6"), index: /idx_publications_featured/ },
    { name: 'published news', query: core.read("SELECT uid,title FROM news WHERE visibility='public' AND published_at<=? ORDER BY published_at DESC,sort_order,id LIMIT 20", ['2026-08-29T00:00:00.000Z']), index: /idx_news_published/ },
    { name: 'student group', query: core.read("SELECT uid,name FROM students WHERE visibility='public' AND category=? AND status=? ORDER BY sort_order,id LIMIT 20", ['phd','active']), index: /idx_students_group/ },
    { name: 'media filters', query: core.read('SELECT uid,object_key FROM media_assets WHERE status=? AND category=? AND mime_type=? ORDER BY id LIMIT 20', ['active','avatar','image/png']), index: /idx_media_assets_status_category_mime/ },
    { name: 'translation reference batch', query: core.buildTranslationReadPlan([{ sourceRefKey: 'ref1', sourceHash: 'a'.repeat(64) }, { sourceRefKey: 'ref2', sourceHash: 'a'.repeat(64) }], 'en')[0], index: /idx_translation_cache_(one_current|ref_language|hash_language)/ },
    { name: 'audit log', query: core.read('SELECT * FROM operation_logs WHERE module=? ORDER BY created_at DESC,id LIMIT 20', ['news']), index: /idx_operation_logs_module_created/ },
    { name: 'message inbox', query: core.read('SELECT * FROM messages WHERE status=? ORDER BY created_at DESC,id LIMIT 20', ['new']), index: /idx_messages_status_created/ },
  ]
  const evidence = []
  for (const item of queries) {
    const plan = db.prepare('EXPLAIN QUERY PLAN ' + item.query.sql).all(...item.query.params)
    evidence.push({ name: item.name, sql: item.query.sql, params: item.query.params, plan })
    test(`EXPLAIN uses its intended index without temporary ORDER BY: ${item.name}`, () => {
      const detail = plan.map(row => row.detail).join('\n')
      assert.match(detail, item.index); assert.doesNotMatch(detail, /USE TEMP B-TREE FOR ORDER BY/)
    })
  }
  for (const [index, command] of core.buildHomeReadPlan('2026-08-29T00:00:00.000Z').entries()) {
    const plan = db.prepare('EXPLAIN QUERY PLAN ' + command.sql).all(...command.params)
    evidence.push({ name: `home projection ${index + 1}`, sql: command.sql, params: command.params, plan })
    test(`homepage projection ${index + 1} has bounded and executable SQL`, () => {
      assert.match(command.sql, /LIMIT/); assert.ok(plan.length); core.validateCommand(command)
    })
  }
  await mkdir(resolve(root, 'reports/stage1'), { recursive: true })
  await writeFile(resolve(root, 'reports/stage1/query-plans.json'), JSON.stringify({ engine: db.prepare('SELECT sqlite_version() version').get().version, dataset: { publications: 1200, news: 240, students: 240, media: 240, translations: 240 }, note: 'Local SQLite query plans, NOT remote D1 latency measurements.', queries: evidence }, null, 2) + '\n')
}
finally { h.close() }
