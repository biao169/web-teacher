import test from 'node:test'
import assert from 'node:assert/strict'
import { core, createHarness, createPublicServices, request, seedPublicContent, iso, insert } from '../helpers/offline-stage5.mjs'
import { createHomeService } from '../helpers/offline-stage4.mjs'

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: featured teacher follows public/active flags, stable sort and warmed-cache invalidation`, async t => {
    const h = createHarness(kind); t.after(() => h.close()); await seedPublicContent(h)
    const clock = { value: Date.parse(iso()) }
    const service = createHomeService(h.adapter, clock).service
    const invalidator = new core.CacheInvalidator(new core.CacheGenerationStore(h.adapter))
    const refresh = async () => { clock.value += 1000; await invalidator.invalidate({ module: 'profiles' }, iso(clock.value)); return (await service.home('zh')).viewModel.featuredProfile }
    insert(h.db, "UPDATE profiles SET sort_order=-100 WHERE uid='profile:member'")
    insert(h.db, "UPDATE profiles SET is_featured=1,sort_order=-200 WHERE uid='profile:inactive'")
    insert(h.db, "UPDATE site_settings SET homepage_profile_uid='profile:member'")
    assert.equal((await service.home('zh')).viewModel.featuredProfile.uid, 'profile:lead')
    assert.equal((await service.home('zh')).cache, 'hit')
    insert(h.db, "UPDATE profiles SET is_featured=1,sort_order=1 WHERE uid='profile:member'")
    assert.equal((await refresh()).uid, 'profile:lead', 'equal sort uses earlier stable ID')
    insert(h.db, "UPDATE profiles SET sort_order=0 WHERE uid='profile:member'")
    assert.equal((await refresh()).uid, 'profile:member')
    insert(h.db, "UPDATE profiles SET is_featured=0 WHERE uid='profile:member'")
    assert.equal((await refresh()).uid, 'profile:lead')
    insert(h.db, "UPDATE profiles SET visibility='hidden' WHERE uid='profile:lead'")
    assert.equal(await refresh(), null, 'no ordinary or inactive teacher fallback')
  })

  test(`${kind}: long bilingual biographies preserve paragraphs, literal text and translation fallback`, async t => {
    const h = createHarness(kind); t.after(() => h.close()); await seedPublicContent(h)
    const clock = { value: Date.parse(iso()) }
    const source = '中文简介开始\n\n' + '研究  教学\n'.repeat(7000) + '保留 x < y、A & B。\n\n中文简介结束'
    const english = 'Biography start\n\n' + 'Research  and teaching.\n'.repeat(4000) + 'Keep x < y and A & B.\n\nBiography end'
    for (const text of [source, english]) {
      assert.ok(Buffer.byteLength(text) > 64000, 'exceeds the former public read limit')
      assert.ok(Array.from(text).length <= 100000, 'fits the admin textarea limit')
    }
    insert(h.db, "UPDATE profiles SET bio=?, bio_en=? WHERE uid='profile:lead'", source, english)
    const service = createHomeService(h.adapter, clock).service
    assert.equal((await service.home('zh')).viewModel.featuredProfile.biography, source)
    assert.equal((await service.home('en')).viewModel.featuredProfile.biography, english)
    const invalidator = new core.CacheInvalidator(new core.CacheGenerationStore(h.adapter))
    insert(h.db, "UPDATE profiles SET bio_en=NULL WHERE uid='profile:lead'")
    await invalidator.invalidate({ module: 'profiles' }, iso(clock.value += 1000))
    assert.equal((await service.home('en')).viewModel.featuredProfile.biography, source)
    const ref = core.buildSourceRefKey({ entity: 'profiles', uid: 'profile:lead', field: 'bio' })
    insert(h.db, `INSERT INTO translation_cache(uid,created_at,updated_at,source_hash,source_ref_key,source_text,source_lang,target_lang,translated_text,provider,status,is_manual,is_current,source_refs)
      VALUES('translation:long-bio',?,?,?,?,?,'zh','en',?,'fixture','success',0,1,'[]')`, iso(),iso(),await core.translationSourceHash(source),ref,source,english)
    await invalidator.invalidate({ module: 'translation_cache' }, iso(clock.value += 1000))
    assert.equal((await service.home('en')).viewModel.featuredProfile.biography, english)
    insert(h.db, "UPDATE profiles SET bio=? WHERE uid='profile:lead'", '更新简介\n\n完整结尾')
    await invalidator.invalidate({ module: 'profiles' }, iso(clock.value += 1000))
    assert.equal((await service.home('en')).viewModel.featuredProfile.biography, '更新简介\n\n完整结尾', 'stale translation is not reused')
  })

  test(`${kind}: maximum-size teacher biographies survive home caching, full-page lists and detail`, async t => {
    const h = createHarness(kind); t.after(() => h.close()); await seedPublicContent(h)
    const source = '学'.repeat(100000)
    const english = 'A' + '🔬'.repeat(99999)
    insert(h.db, "UPDATE profiles SET bio=?, bio_en=? WHERE uid='profile:lead'", source, english)
    const clock = { value: Date.parse(iso()) }
    const home = createHomeService(h.adapter, clock).service
    for (const [locale, biography] of [['zh', source], ['en', english]]) {
      assert.equal((await home.home(locale)).viewModel.featuredProfile.biography, biography)
      const cached = await home.home(locale)
      assert.equal(cached.cache, 'hit', 'biography exceeding the old 256 KB response budget is cached')
      assert.equal(cached.viewModel.featuredProfile.biography, biography)
    }
    // A full page exceeds the translation reader's aggregate byte budget unless split safely.
    insert(h.db, "UPDATE profiles SET is_active=0 WHERE uid!='profile:lead'")
    for (let index = 0; index < 35; index++) insert(h.db, `INSERT INTO profiles
      (uid,created_at,updated_at,name,bio,bio_en,visibility,is_active,is_featured,sort_order)
      VALUES(?,?,?, ?,?,?,'public',1,0,?)`, `profile:long-${index}`, iso(), iso(), `Member ${index}`, source, english, index + 10)
    const services = createPublicServices(h.adapter, clock)
    for (const [locale, biography] of [['zh', source], ['en', english]]) {
      const list = (await services.team.list(request(locale, { pageSize: 36 }))).viewModel
      assert.equal(list.items.length, 36)
      assert.ok(list.items.every(item => Array.from(item.biography).length === 221), 'list remains compact')
      assert.equal((await services.team.detail(locale, 'profile:lead')).viewModel.item.biography, biography)
    }
  })

  test(`${kind}: homepage buttons honor labels, routes, anchors, order, styles and disable/hide mutations`, async t => {
    const h = createHarness(kind); t.after(() => h.close()); await seedPublicContent(h)
    const clock = { value: Date.parse(iso()) }
    insert(h.db, "UPDATE navigation_items SET title='合作入口',title_en='Collaborate now',sort_order=3 WHERE uid='nav:contact'")
    insert(h.db, `INSERT INTO navigation_items(uid,created_at,updated_at,title,title_en,kind,path,location,style,visibility,enabled,sort_order)
      VALUES('nav:custom-papers',?,?, '成果精选','Selected work','button','/publications?year=2026','hero','secondary','public',1,1)`,iso(),iso())
    insert(h.db, `INSERT INTO navigation_items(uid,created_at,updated_at,title,title_en,kind,fragment,location,visibility,enabled,sort_order)
      VALUES('nav:custom-research',?,?,'研究标签','Research tags','anchor','research','hero','public',1,2)`,iso(),iso())
    const service = createHomeService(h.adapter, clock).service
    const zh = (await service.home('zh')).viewModel.navigation.hero
    assert.deepEqual(zh.map(x => [x.label,x.href]), [['成果精选','/zh/publications?nav=nav%3Acustom-papers&year=2026'],['研究标签','/zh#research'],['合作入口','https://example.org/collaborate']])
    assert.equal(zh[0].style,'secondary'); assert.equal(zh[2].style,'primary');assert.equal(zh[2].external,true)
    const en = (await service.home('en')).viewModel.navigation.hero
    assert.deepEqual(en.map(x => x.label), ['Selected work','Research tags','Collaborate now'])
    assert.equal(en[0].href,'/en/publications?nav=nav%3Acustom-papers&year=2026'); assert.equal(en[1].href,'/en#research')
    assert.equal((await service.home('en')).cache,'hit')
    insert(h.db, "UPDATE navigation_items SET enabled=0 WHERE uid='nav:custom-papers'")
    insert(h.db, "UPDATE navigation_items SET visibility='hidden' WHERE uid='nav:custom-research'")
    insert(h.db, "UPDATE navigation_items SET title='新入口',title_en='New destination',path='https://example.org/new' WHERE uid='nav:contact'")
    const invalidator = new core.CacheInvalidator(new core.CacheGenerationStore(h.adapter))
    await invalidator.invalidate({ module: 'navigation_items' }, iso(clock.value += 1000))
    const changed = (await service.home('en')).viewModel.navigation.hero
    assert.deepEqual(changed.map(x => [x.label,x.href]), [['New destination','https://example.org/new']])
    insert(h.db, "UPDATE navigation_items SET enabled=0 WHERE location='hero'")
    await invalidator.invalidate({ module: 'navigation_items' }, iso(clock.value += 1000))
    assert.deepEqual((await service.home('zh')).viewModel.navigation.hero, [])
  })
}
