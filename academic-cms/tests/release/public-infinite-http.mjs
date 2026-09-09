import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../..')
const require = createRequire(resolve(root, 'package.json'))
const Database = require('better-sqlite3')
const moduleAt = path => import(pathToFileURL(resolve(root, path)))
const { assertCurrentBuildSource } = await moduleAt('scripts/release/assert-current-source.mjs')
const { loadMigrations, applyMigrations } = await moduleAt('scripts/db/migrations.mjs')
const { runProcess } = await moduleAt('scripts/release/process.mjs')
await assertCurrentBuildSource(root)
await mkdir(resolve(root, '.tmp'), {recursive:true})
const directory = await mkdtemp(resolve(root, '.tmp/production-e2e-infinite-'))
const databasePath = resolve(directory, 'demo.sqlite3')
const checks = []
let child
let serverLog = ''
try {
  const db = new Database(databasePath)
  applyMigrations(db, await loadMigrations(resolve(root, 'migrations')))
  db.close()
  const password = randomBytes(32).toString('hex')
  const seed = await runProcess(process.execPath, ['--import','tsx','scripts/release/seed-fixture.ts'], {
    cwd:root, env:{CMS_E2E_DATABASE:databasePath,CMS_E2E_PASSWORD:password},redact:[password],
  })
  assert.ok(seed.passed, 'seed fixture')
  const fixture = new Database(databasePath)
  const stamp = '2026-09-01T00:00:00.000Z'
  const biographies = { zh: '首页简介开始\n\n' + '研究与教学内容。\n'.repeat(700) + '首页简介结尾', en: 'Biography start\n\n' + 'Research and teaching.\n'.repeat(700) + 'Biography end' }
  fixture.transaction(() => {
    fixture.prepare('DELETE FROM publications').run()
    const paper = fixture.prepare('INSERT INTO publications(uid,created_at,updated_at,title,authors,venue,year,publication_type,index_type,is_featured,visibility) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    for(let i=0;i<4;i++) paper.run(`numbering-${'abcd'[i]}`,stamp,stamp,`Numbering ${'abcd'[i]}`,'Author','Journal 00',2021+i,i%2?'skip':'keep',i%2?'SCIE':'SCI；EI; SCI',i%2?0:1,'public')
    paper.run('numbering-hidden',stamp,stamp,'Hidden','Author','SECRET',2026,'keep','SECRET',1,'hidden')
    for(let i=1;i<=45;i++) paper.run(`extra-${i}`,stamp,stamp,`Extra ${i}`,'Author',`Journal ${String(i).padStart(2,'0')}`,2000,'other',null,0,'public')
    fixture.prepare("UPDATE publications SET citation_gbt=?,highlight_gbt='Zhang, M.',citation_apa=?,highlight_apa='Zhang, M.',citation_elsevier=NULL,citation_ieee=NULL WHERE uid='numbering-c'").run('[8]  Zhang, M.* Original GB/T. KEEP-SPACES.','[8]  Zhang, M.* (2026). APA ORIGINAL. DOI:10.1000/UPPER.')
    fixture.prepare("UPDATE publications SET citation_gbt='Only GB/T',citation_apa=NULL,authors=NULL,venue=NULL WHERE uid='numbering-b'").run()
    fixture.prepare("UPDATE publications SET publication_type='期刊论文',authors='San Zhang; Jane Doe',venue='Original Journal',volume=NULL,issue=NULL,pages=NULL WHERE uid='extra-1'").run()
    fixture.prepare("UPDATE projects SET source='Source priority', fund_name='Fund priority', project_number='TEST-P001', amount='12.5', summary='PROJECT-SUMMARY-MUST-NOT-RENDER'").run()
    fixture.prepare('DELETE FROM research_interests').run()
    const research = fixture.prepare("INSERT INTO research_interests(uid,created_at,updated_at,name,visibility) VALUES(?,?,?,?,'public')")
    for(let i=0;i<105;i++) research.run(`numbering-research-${i}`,new Date(Date.parse(stamp)+i*1000).toISOString(),stamp,i%2?'search-me':'other')
    fixture.prepare('UPDATE research_interests SET description=?').run('Full research text. '.repeat(2000).trim())
    fixture.prepare("UPDATE profiles SET bio=?,bio_en=? WHERE uid='demo:profile:02'").run(biographies.zh,biographies.en)
    fixture.prepare("UPDATE profiles SET google_scholar='https://scholar.google.com/citations?user=demo',google_scholar_value=1234,github='https://github.com/demo',github_value=0 WHERE uid='demo:profile:02'").run()
    fixture.prepare("UPDATE profiles SET is_featured=0 WHERE uid='demo:profile:01'").run()
    fixture.prepare("INSERT INTO navigation_items(uid,created_at,updated_at,title,title_en,kind,path,location,style,visibility,enabled,sort_order) VALUES('redesign-home-action',?,?,'自定义成果','Custom work','button','/publications?year=2024','hero','secondary','public',1,1)").run(stamp,stamp)
    fixture.prepare("INSERT INTO navigation_items(uid,created_at,updated_at,title,title_en,kind,path,location,style,visibility,enabled,sort_order) VALUES('round2-year',?,?,'2024年论文','2024 papers','internal','/publications?year=2024','header','default','public',1,1)").run(stamp,stamp)
    fixture.prepare("UPDATE news SET content='<p>Full <strong>rich news body</strong></p><ul><li>News list item</li></ul>',content_format='html'").run()
    // More than one page in each module; clone only seeded public fixture rows.
    for(const table of ['profiles','projects','patents','students','news','courses']) {
      const columns=fixture.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name).filter(name=>!['id'].includes(name))
      const source=fixture.prepare(`SELECT * FROM "${table}" WHERE visibility='public'${columns.includes('is_active')?' AND is_active=1':''} LIMIT 1`).get()
      assert.ok(source,`${table} public fixture`)
      const insert=fixture.prepare(`INSERT INTO "${table}" (${columns.map(name=>`"${name}"`).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`)
      for(let i=0;i<25;i++) {
        const uid=`lazy-${table}-${i}`
        insert.run(...columns.map(name=>name==='uid'||name==='slug'?uid:source[name]))
      }
    }
    fixture.prepare("UPDATE students SET category=CASE WHEN id%2=0 THEN '博士生' ELSE '硕士生' END").run()
  })()
  fixture.close()
  const socket = createServer()
  await new Promise(ok=>socket.listen(0,'127.0.0.1',ok))
  const port = socket.address().port
  await new Promise(ok=>socket.close(ok))
  const origin = `http://127.0.0.1:${port}`
  child = spawn(process.execPath,[resolve(root,'.output/server/index.mjs')],{cwd:root,stdio:['ignore','pipe','pipe'],env:{
    ...process.env,NODE_ENV:'production',NITRO_HOST:'127.0.0.1',NITRO_PORT:String(port),CMS_DATABASE_PATH:databasePath,
    NUXT_AUTH_SECRET:randomBytes(48).toString('hex'),NUXT_AUTH_BOOTSTRAP_TOKEN:'',NUXT_AUTH_TRUSTED_ORIGINS:origin,
    NUXT_AUTH_SECURE_COOKIES:'true',NUXT_MEDIA_GRANT_SECRET:randomBytes(48).toString('hex'),
    NUXT_MEDIA_ROOT:resolve(directory,'media'),NUXT_STATIC_MEDIA_ROOT:resolve(root,'.output/public'),
    NUXT_PUBLIC_SITE_URL:origin,NUXT_CACHE_ORIGIN:origin,NUXT_LOCALE_GEO_IP_ENABLED:'false',
  }})
  for(const stream of [child.stdout,child.stderr]) stream.on('data',chunk=>{serverLog+=chunk.toString()})
  let ready = false
  for(let i=0;i<200;i++) {
    try {if((await fetch(origin+'/health',{signal:AbortSignal.timeout(500)})).ok){ready=true;break}}catch{}
    if(child.exitCode!==null) throw new Error('Server exited')
    await new Promise(ok=>setTimeout(ok,100))
  }
  assert.ok(ready)
  const readResults = new Map()
  const read = async path => {
    const response = await fetch(origin+path,{signal:AbortSignal.timeout(15000)})
    assert.equal(response.status,200,path)
    const result={body:await response.json(),response}
    readResults.set(path,result)
    return result
  }
  const request = path => fetch(origin + path, {signal:AbortSignal.timeout(15000)})
  for(const module of ['team','publications','projects','patents','students','research','news','courses']) {
    const {body} = await read(`/api/v1/public/${module}?locale=zh`)
    assert.ok(body.totalPublic >= body.pagination.totalItems)
    assert.ok(body.items.every(row => Number.isInteger(row.displayNumber)))
    assert.equal(body.items.length,12);assert.equal(body.pagination.nextPage,2)
    const {body:next}=await read(`/api/v1/public/${module}?locale=zh&page=2`)
    assert.equal(next.pagination.from,13);assert.equal(next.pagination.to,24);assert.equal(next.revision,body.revision)
    const rows=[...body.items,...next.items]
    assert.equal(new Set(rows.map(row=>row.uid)).size,24)
    assert.ok(rows.every((row,index)=>!index||(module==='team'?row.displayNumber>rows[index-1].displayNumber:row.displayNumber<rows[index-1].displayNumber)))
    checks.push(`${module}: two bounded pages, unique UID membership and consistent global ordering/version`)

    const recordClass = module === 'research' ? 'public-research-tag' : 'public-compact-record'
    for(const locale of ['zh','en']) {
      const response = await request(`/${locale}/${module}`)
      assert.equal(response.status,200,`${locale}/${module}`)
      const html = await response.text()
      assert.ok(html.includes('public-compact-list'),`${locale}/${module} list frame`)
      assert.ok(html.includes(recordClass),`${locale}/${module} record presentation`)
      assert.ok(html.includes('public-language-switch'),`${locale}/${module} language switch`)
      const header = html.slice(html.indexOf('<header class="public-header"'), html.indexOf('<main'))
      const nav = header.match(/<nav class="public-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? ''
      assert.ok(nav.includes(`href="/${locale}/${module}"`), `${locale}/${module} expanded configured navigation`)
      assert.ok(nav.split('</a>').some(anchor => anchor.includes(`href="/${locale}/${module}"`) && anchor.includes('is-current')), `${locale}/${module} active navigation`)
      assert.ok(!header.includes('public-nav-more'), 'No fixed four-entry overflow menu')
      assert.ok(header.indexOf('public-header__toolbar') > header.indexOf('</nav>'), 'Reading toolbar follows navigation')
      const selectable = !['team','news'].includes(module)
      assert.equal(html.includes('class="public-selection-toolbar"'),selectable,`${locale}/${module} selection capability`)
      assert.equal(html.includes('class="public-record-checkbox"'),selectable,`${locale}/${module} row checkbox capability`)
      const start=html.indexOf('<main'),visible=html.slice(start,html.indexOf('</main>',start))
      assert.equal((visible.match(new RegExp(`class="${recordClass}(?: [^"]*)?"`, 'g'))||[]).length,12)
      assert.ok(visible.includes('public-page-hero--compact'), 'Compact list heading')
      assert.match(visible, /<h1 class="public-sr-only">[^<]+<\/h1>/)
      assert.ok(!visible.includes('public-page-hero__description'), 'No repeated list introduction')
      assert.ok(visible.indexOf('public-breadcrumbs') < visible.indexOf('public-filter-panel'), 'Breadcrumbs precede filters')
      assert.ok(visible.includes('public-filter-toolbar'), 'One wrapping filter toolbar')
      assert.equal((visible.match(/class="public-filter-trigger/g) || []).length, body.filters.length, 'Every available field has one trigger')
      for (const filter of body.filters) assert.ok(visible.includes(`data-filter="${filter.key}"`), `Visible filter ${filter.key}`)
      assert.ok(!/public-candidate-browser|public-more-filters|public-filter-mobile-toggle/.test(visible), 'No duplicate or folded filter controls')
      assert.ok(!visible.includes('class="public-filter-popup"'), 'Options open and fetch only on demand')
      assert.ok(visible.includes('class="public-load-more"'));assert.ok(!visible.includes('class="public-pagination"'))
      const cards = [...visible.matchAll(new RegExp(`<article class="${recordClass}(?: [^"]*)?"[^>]*>([\\s\\S]*?)</article>`, 'g'))].map(match => match[1])
      assert.equal(cards.length, 12, 'Shared record cards retain the bounded first page')
      for (const card of cards) {
        assert.ok(card.includes(module === 'research' ? 'public-research-tag__name' : 'public-compact-record__heading'), 'Shared heading or name tag layout')
        if (module === 'research') {
          assert.ok(visible.includes('public-research-tags'), 'Wrapping research group')
          assert.ok(!card.includes('Full research text.') && !card.includes('public-compact-record__summary') && !card.includes('<details'), 'Research tags omit descriptions and expansion controls')
        }
        const tagAt = card.indexOf('public-record-tags'), metaAt = card.indexOf('public-compact-record__meta'), summaryAt = card.indexOf('public-compact-record__summary')
        if (tagAt >= 0) {
          assert.ok(card.includes('public-badge--'), 'Shared pale badge component')
          if (module === 'publications') {
            assert.ok(tagAt > card.indexOf('public-compact-record__links'), 'Publication tags share the final link row')
            if (metaAt >= 0) assert.ok(tagAt > metaAt, 'Publication tags follow metadata in copy order')
          } else {
            if (metaAt >= 0) assert.ok(tagAt < metaAt, 'Tags precede metadata in DOM reading order')
            if (summaryAt >= 0) assert.ok(tagAt < summaryAt, 'Tags precede summary in DOM reading order')
          }
        }
        if (selectable) assert.ok(card.indexOf('public-record-checkbox') < card.indexOf('public-copy-record'), 'Copy stays below the checkbox')
        if (['team', 'students'].includes(module)) assert.ok(card.includes('public-media--portrait'), 'Portrait frame retained')
      }
      if (module === 'students') assert.equal((visible.match(/class="public-student-group"/g) || []).length, 2, 'Student categories have separate sections')
      if (module === 'news') assert.equal((visible.match(/class="public-news-body"/g) || []).length, 0, 'News lists do not render detail bodies')
      assert.equal(visible.includes('class="public-copy-record"'),selectable)
      assert.ok(!/<dialog|<textarea|查看已选|View selected|复制内容预览|Copy preview/.test(visible), 'Copy actions have no preview, edit dialog or confirmation')
      if (selectable) assert.ok(visible.includes('public-copy-selected') && visible.includes('public-copy-number-option'), 'Direct copy and original-number option stay in the toolbar')
      if(selectable)assert.ok(visible.includes(locale==='zh'?'全选已加载':'Select loaded items'))

      checks.push(`${locale}/${module}: expanded active navigation, compact heading, language switch and correct selection capability`)
    }
  }
  const {body:filtered} = await read('/api/v1/public/publications?locale=zh&publicationType=keep&indexType=SCI')
  assert.deepEqual(filtered.items.map(row=>[row.uid,row.displayNumber]),[['numbering-c',48],['numbering-a',46]])
  assert.equal(filtered.totalPublic,49);assert.equal(filtered.pagination.totalItems,2)
  checks.push('Combined classification filtering keeps global display numbers')
  for (const locale of ['zh', 'en']) {
    const {body:scoped} = await read(`/api/v1/public/publications?locale=${locale}&nav=round2-year`)
    assert.deepEqual(scoped.items.map(item => item.uid), ['numbering-d'])
    assert.equal(scoped.query.scope.uid, 'round2-year')
    assert.equal(scoped.query.filters.year, '2024')
    assert.ok(!scoped.filters.some(filter => filter.key === 'year'))
    const {body:emptyScope} = await read(`/api/v1/public/publications?locale=${locale}&nav=round2-year&q=Extra`)
    assert.equal(emptyScope.pagination.totalItems, 0, 'Additional search never expands the saved year')
    const {body:scopeCandidates} = await read(`/api/v1/public/filter-options?locale=${locale}&module=publications&field=venue&nav=round2-year`)
    assert.deepEqual(scopeCandidates.options.map(option => option.value), ['Journal 00'])
    assert.equal((await request(`/api/v1/public/publications?locale=${locale}&nav=round2-year&year=2023`)).status, 400)
    const scopedHtml = await (await request(`/${locale}/publications?nav=round2-year&year=2024`)).text()
    const navigation = scopedHtml.match(/<nav class="public-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? ''
    const active = navigation.split('</a>').filter(anchor => anchor.includes('is-current'))
    assert.equal(active.length, 1, 'Only the originating navigation item is active')
    assert.ok(active[0].includes('nav=round2-year'))
    assert.ok(!scopedHtml.includes('data-filter="year"'))
    checks.push(`${locale}: saved navigation scope constrains search and candidates, hides the locked year and marks only its own button`)
  }
  const {body:researchFirst}=await read('/api/v1/public/research?locale=zh&q=search-me')
  const {body:researchNext}=await read('/api/v1/public/research?locale=zh&q=search-me&page=2')
  assert.equal(researchFirst.pagination.totalItems,52);assert.equal(researchNext.pagination.from,13)
  assert.equal(researchNext.query.search,'search-me');assert.equal(researchNext.revision,researchFirst.revision)
  assert.ok(researchNext.items.every(row=>row.name==='search-me'))
  assert.ok(researchNext.items.every((row,index)=>row.displayNumber===researchFirst.items.at(-1).displayNumber-2*(index+1)))
  checks.push('Filtered next-page API keeps the search condition and non-contiguous original numbers')

  const {body:options,response:optionResponse} = await read('/api/v1/public/filter-options?locale=zh&module=publications&field=venue&candidate=45')
  assert.deepEqual(options.options.map(option=>option.value),['Journal 45'])
  assert.equal(optionResponse.headers.get('cache-control'),'no-store')
  const {body:page2} = await read('/api/v1/public/filter-options?locale=en&module=publications&field=venue&candidatePage=2')
  assert.equal(page2.page,2);assert.equal(page2.options.length,20);assert.equal(page2.hasMore,true)
  const {body:secret} = await read('/api/v1/public/filter-options?locale=zh&module=publications&field=venue&candidate=SECRET')
  assert.equal(secret.options.length,0)
  checks.push('Production candidate search, paging and hidden-value exclusion')
  const {body:invalidSelected} = await read('/api/v1/public/publications?locale=zh&venue=Journal%2045&year=1900')
  assert.equal(invalidSelected.pagination.totalItems,0)
  assert.equal(invalidSelected.filters.find(group=>group.key==='venue').options[0].selected,true)
  checks.push('Zero-result responses retain selected conditions')
  for(const suffix of ['module=publications&field=private_email','module=profiles&field=role','module=news&field=category&candidatePage=502','module=publications&field=venue&candidate=x&candidate=y']) {
    assert.equal((await request('/api/v1/public/filter-options?locale=zh&'+suffix)).status,400)
  }
  checks.push('Invalid candidate targets and ambiguous controls are rejected')
  const html = await (await request('/zh/projects')).text()
  const start = html.indexOf('<main')
  const visibleHtml = html.slice(start, html.indexOf('</main>', start))
  assert.ok(visibleHtml.includes('Source priority'))
  assert.ok(visibleHtml.includes('Fund priority'))
  assert.ok(visibleHtml.includes('public-project-name'))
  assert.ok(visibleHtml.includes('12.5 万元'))
  assert.ok((await (await request('/en/projects')).text()).includes('CNY 125,000'))
  assert.ok(!visibleHtml.includes('PROJECT-SUMMARY-MUST-NOT-RENDER'))
  checks.push('Projects render source and funding emphasis without a summary')
  const {body:newsList} = await read('/api/v1/public/news?locale=zh')
  const {body:newsDetail} = await read(`/api/v1/public/news/${encodeURIComponent(newsList.items[0].slug)}?locale=zh`)
  assert.ok(JSON.stringify(newsDetail.item.blocks).includes('<strong>rich news body</strong>'))
  assert.ok(JSON.stringify(newsDetail.item.blocks).includes('<li>News list item</li>'))
  checks.push('Lazy news detail endpoint preserves full sanitized rich text and list formatting')
  for(const module of ['publications','projects','patents','students','research','courses']) {
    const {body:list} = await read(`/api/v1/public/${module}?locale=zh`)
    const uids=list.items.slice(0,2).map(item=>item.uid)
    const query=new URLSearchParams({module,locale:'en'})
    for(const uid of [...uids,'missing-selected-uid'])query.append('uid',uid)
    const {body,response}=await read('/api/v1/public/selection?'+query)
    assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0')
    assert.equal(body.locale,'en');assert.deepEqual(body.items.map(item=>item.uid),uids)
    assert.deepEqual(body.unavailableUids,['missing-selected-uid'])
    assert.deepEqual(body.items.map(item=>item.displayNumber),list.items.slice(0,2).map(item=>item.displayNumber))
    checks.push(`${module}: real UID-array preparation, language, ranking and no-store response`)
  }
  for(const suffix of ['module=team&uid=a','module=news&uid=a','module=projects&uid=a&uid=a','module=projects&uid=../secret','module=projects','module=projects&uid=a&page=2','module=projects&'+Array.from({length:13},(_,i)=>`uid=p${i}`).join('&')]) {
    assert.equal((await request('/api/v1/public/selection?locale=zh&'+suffix)).status,400,suffix)
  }
  checks.push('Production selection rejects unsupported modules, duplicates, invalid IDs and excess batches')
  for(const locale of ['zh','en']) {
    for(const route of ['publications','publications/featured']) {
      const response=await request(`/${locale}/${route}`)
      assert.equal(response.status,200)
      const html=await response.text(),start=html.indexOf('<main'),visible=html.slice(start,html.indexOf('</main>',start)).replace(/<!--[\s\S]*?-->/g,'')
      assert.ok(visible.includes('class="public-citation-control"'))
      assert.ok(visible.includes('data-citation-style="gbt"'))
      assert.ok(visible.includes('<mark>Zhang, M.</mark>* Original GB/T. KEEP-SPACES.'))
      assert.ok(!visible.includes('正在读取本页') && !visible.includes('Loading citations for this page') && !visible.includes('引文暂未就绪') && !visible.includes('Citations are not ready'),`${locale}/${route}: citations must resolve during SSR`)
      checks.push(`${locale}/${route}: server-rendered complete default citations and shared format control`)
    }
    const {body:apa}=await read(`/api/v1/public/selection?module=publications&locale=${locale}&citationStyle=apa&uid=numbering-c&uid=numbering-b`)
    assert.equal(apa.citationStyle,'apa')
    const saved=apa.items.find(item=>item.uid==='numbering-c').citation
    assert.equal(saved.text,'[8]  Zhang, M.* (2026). APA ORIGINAL. DOI:10.1000/UPPER.')
    assert.deepEqual(saved.highlights,['Zhang, M.'])
    const missing=apa.items.find(item=>item.uid==='numbering-b').citation
    assert.equal(missing.status,'missing');assert.equal(missing.text,'')
    checks.push(`${locale}: exact saved APA, intact author highlight and explicit missing-format response`)
  }
  const {body:detail}=await read('/api/v1/public/publications/numbering-c?locale=en')
  assert.equal(detail.item.citations.length,4)
  for(const style of ['gbt','elsevier','apa','ieee']) {
    const {body:batch}=await read(`/api/v1/public/selection?module=publications&locale=en&citationStyle=${style}&uid=numbering-c`)
    assert.deepEqual(batch.items[0].citation,detail.item.citations.find(citation=>citation.style===style))
    const {body:generated}=await read(`/api/v1/public/selection?module=publications&locale=en&citationStyle=${style}&uid=extra-1`)
    assert.equal(generated.items[0].citation.status,'generated')
    assert.ok(!generated.items[0].citation.text.includes('vol.'));assert.ok(!generated.items[0].citation.text.includes('pp.'))
  }
  checks.push('Four styles share the detail projection and reuse generation without invented volume/pages')
  for(const query of ['module=projects&citationStyle=apa&uid=x','module=publications&citationStyle=vancouver&uid=x','module=publications&citationStyle=apa&citationStyle=ieee&uid=x'])assert.equal((await request('/api/v1/public/selection?locale=zh&'+query)).status,400)
  checks.push('Invalid, repeated and cross-module citation format controls are rejected')
  for (const locale of ['zh','en']) {
    const {body:home} = await read(`/api/v1/public/home?locale=${locale}`)
    for (const module of ['research','publications','projects','news']) {
      const {body:list} = await read(`/api/v1/public/${module}?locale=${locale}`)
      assert.equal(home.counts[module], list.totalPublic)
    }
    assert.equal(home.counts.publications,49)
    assert.ok(home.publications.length < home.counts.publications)
    assert.deepEqual(home.publications.map(item=>[item.uid,item.displayNumber]),[['numbering-c',48],['numbering-a',46]])
    const response = await request(`/${locale}`)
    assert.equal(response.status,200)
    const html=await response.text(), start=html.indexOf('<main'), visible=html.slice(start,html.indexOf('</main>',start)).replace(/<!--[\s\S]*?-->/g,'')
    assert.ok(visible.includes('public-home-profile'))
    assert.equal(home.featuredProfile.uid,'demo:profile:02')
    assert.equal(home.featuredProfile.biography,biographies[locale])
    const biography = visible.match(/<p class="public-home-profile__biography">([\s\S]*?)<\/p>/)?.[1]
    assert.equal(biography,biographies[locale], 'SSR preserves every paragraph and the final line')
    const shortcuts = visible.match(/<nav class="public-actions public-home-shortcuts"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? ''
    assert.ok(shortcuts.includes(`href="/${locale}/publications?nav=redesign-home-action&amp;year=2024"`))
    assert.ok(shortcuts.includes(locale === 'zh' ? '自定义成果' : 'Custom work'))
    assert.equal((shortcuts.match(/<a /g) ?? []).length,1)
    assert.ok(!visible.includes('public-home-metrics'))
    assert.ok(!visible.includes('完整个人资料'))
    assert.ok(visible.includes('<mark>Zhang, M.</mark>* Original GB/T. KEEP-SPACES.'))
    assert.ok(!visible.includes('PROJECT-SUMMARY-MUST-NOT-RENDER'))
    assert.equal((visible.match(/class="public-selection-toolbar"/g)||[]).length,2)
    assert.equal(home.featuredProfile.links.find(link => link.kind === 'google-scholar').value, '1234')
    assert.equal(home.featuredProfile.links.find(link => link.kind === 'github').value, '0')
    assert.ok(visible.includes('public-profile-links__value') && visible.includes('>1234</span>') && visible.includes('>0</span>'))
    const researchSection = visible.match(/<section id="research"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? ''
    assert.ok(researchSection.includes('public-home-research'), 'Homepage uses dedicated direction cards')
    assert.equal((researchSection.match(/class="public-home-research__card"/g) || []).length, home.researchInterests.length)
    assert.ok(!/<input|<button|public-copy|public-selection/.test(researchSection), 'Homepage research has no selection or copy controls')
    assert.ok(!researchSection.includes('Full research text.') && !researchSection.includes('public-compact-record__summary') && !researchSection.includes('<details'), 'Homepage research names have no expanded descriptions')
    checks.push(`${locale}: first featured teacher, complete biography, configured actions, real totals, numbering and SSR citations`)
    const from=`/${locale}/research?q=search-me&page=2#results`
    const path=`/${locale}/research/numbering-research-79?from=${encodeURIComponent(from)}`
    const detailResponse=await request(path); assert.equal(detailResponse.status,200)
    const detailHtml=await detailResponse.text()
    assert.ok(detailHtml.includes('public-detail-return'))
    assert.ok(detailHtml.includes(`href="/${locale}/research?page=2&amp;q=search-me#results"`))
    assert.ok(detailHtml.includes('public-copy-record'))
    assert.ok(detailHtml.includes(`/${locale}/research/numbering-research-79`))
    checks.push(`${locale}: research detail, shared copy and filtered page return`)
  }
  assert.equal((await request('/api/v1/public/research/unknown-step8?locale=zh')).status,404)
  checks.push('Missing research detail returns 404')
  for (const [cookie,language,target] of [['en','zh-CN','en'],['zh','en-US','zh'],['invalid','zh-CN','zh'],['invalid','en-US','en']]) {
    const response=await fetch(origin+'/',{redirect:'manual',headers:{cookie:`academic-cms-locale=${cookie}`,'accept-language':language}})
    assert.equal(response.status,302);assert.equal(response.headers.get('location'),`/${target}`)
    assert.ok(response.headers.get('cache-control').includes('no-store'))
    checks.push(`Locale priority: saved ${cookie}, browser ${language}, result ${target}`)
  }
  for(const locale of ['zh','en']) {
    for(const mode of ['standard','comfortable','large']) {
      const response=await fetch(origin+`/${locale}/research`,{headers:{cookie:`academic-cms-reading=${mode}; academic-cms-locale=${locale==='zh'?'en':'zh'}`}})
      assert.equal(response.status,200);const html=await response.text()
      assert.ok(html.includes(`lang="${locale==='zh'?'zh-CN':'en'}"`));assert.ok(html.includes(`data-reading="${mode}"`))
      assert.ok(response.headers.get('cache-control').includes('private'));assert.ok(response.headers.get('vary').toLowerCase().includes('cookie'))
      assert.ok(html.includes(`rel="canonical" href="${origin}/${locale}/research"`))
      assert.ok(html.includes('hreflang="zh-CN"'));assert.ok(html.includes('hreflang="en"'));assert.ok(html.includes('hreflang="x-default"'))
      checks.push(`${locale}/${mode}: SSR reading preference, explicit route language, private HTML and reciprocal canonical metadata`)
    }
    const filteredHtml=await (await request(`/${locale}/research?q=search-me`)).text()
    assert.ok(filteredHtml.includes('content="noindex,follow"'))
    checks.push(`${locale}: filtered results are crawlable but not indexable`)
  }
  const {body:boundedResearch}=await read('/api/v1/public/research?locale=zh&pageSize=36')
  assert.equal(boundedResearch.items.length,36)
  assert.ok(boundedResearch.items.every(item=>item.description.length<=221))
  assert.ok(Buffer.byteLength(JSON.stringify(boundedResearch))<50000)
  const {body:fullResearch}=await read('/api/v1/public/research/numbering-research-1?locale=zh')
  assert.equal(fullResearch.item.description,'Full research text. '.repeat(2000).trim())
  checks.push('Long research data: compact 36-row response and intact detail text')
  const {response:etagSource}=await read('/api/v1/public/projects?locale=zh')
  const etag=etagSource.headers.get('etag');assert.ok(etag)
  const unchanged=await fetch(origin+'/api/v1/public/projects?locale=zh',{headers:{'if-none-match':etag}})
  assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'')
  const alternate=await fetch(origin+'/api/v1/public/projects?locale=en',{headers:{'if-none-match':etag}})
  assert.equal(alternate.status,200)
  checks.push('Public JSON revalidates with 304 and does not reuse a Chinese ETag for English')
  const sitemap=await (await request('/sitemap.xml')).text()
  assert.ok(sitemap.includes('section=research'));assert.ok(!sitemap.includes('/admin'))
  for(const module of ['team','publications','projects','patents','students','research','news','courses']) {
    const response=await request(`/sitemap.xml?section=${module}&page=1`);assert.equal(response.status,200)
    const xml=await response.text();assert.ok(xml.includes(`/${module}/`));assert.ok(xml.includes('hreflang="zh-CN"'));assert.ok(xml.includes('hreflang="en"'))
    assert.ok(!xml.includes('numbering-hidden'))
  }
  checks.push('Eight public sitemap modules emit reciprocal language links without hidden publications')
  for(const module of ['home','shell','team','publications','projects','patents','students','research','news','courses']) {
    const path=`/api/v1/public/${module}?locale=zh`,first=readResults.get(path),next=await read(path)
    assert.equal(next.response.headers.get('x-cms-cache'),'hit',module)
    if(first) {
      assert.equal(first.response.headers.get('etag'),next.response.headers.get('etag'),module)
      assert.deepEqual(first.body,next.body,module)
    }
  }
  checks.push('Homepage, shell and all eight public modules reuse warm cache views with stable ETags')
  const assetHtml=await (await request('/zh')).text(),asset=assetHtml.match(/(?:src|href)="(\/_nuxt\/[^"?]+\.js)"/)
  assert.ok(asset,'versioned JavaScript asset')
  const assetResponse=await request(asset[1]);assert.equal(assetResponse.status,200)
  assert.ok(assetResponse.headers.get('cache-control').includes('immutable'))
  checks.push('Versioned static JavaScript uses long-lived immutable caching')
  const cached=await read('/api/v1/public/publications?locale=zh')
  assert.ok(cached.body.items.some(item=>item.uid==='numbering-c'))
  const edit=new Database(databasePath)
  try {
    edit.prepare("UPDATE publications SET visibility='hidden' WHERE uid='numbering-c'").run()
    edit.prepare("DELETE FROM publications WHERE uid='numbering-a'").run()
  } finally {edit.close()}
  const {body:fresh}=await read('/api/v1/public/selection?locale=zh&module=publications&uid=numbering-c&uid=numbering-a&uid=numbering-d')
  assert.deepEqual(fresh.unavailableUids,['numbering-c','numbering-a'])
  assert.deepEqual(fresh.items.map(item=>item.uid),['numbering-d'])
  assert.equal(fresh.totalPublic,47);assert.equal(fresh.items[0].displayNumber,47)
  checks.push('Fresh preparation excludes hidden/deleted records after warming the ordinary list cache')
  // Simulate the shared generation bump used by authorized application mutations.
  const invalidation=new Database(databasePath)
  try {
    const bump=invalidation.prepare('INSERT INTO cache_generations(tag,generation,updated_at) VALUES(?,1,?) ON CONFLICT(tag) DO UPDATE SET generation=generation+1,updated_at=excluded.updated_at')
    invalidation.transaction(()=>{for(const tag of ['public:publications','public:home'])bump.run(tag,new Date().toISOString())})()
  } finally {invalidation.close()}
  const {body:updated,response:updatedResponse}=await read('/api/v1/public/publications?locale=zh')
  assert.equal(updatedResponse.headers.get('x-cms-cache'),'miss');assert.equal(updated.totalPublic,47)
  assert.ok(!updated.items.some(item=>['numbering-a','numbering-c'].includes(item.uid)))
  assert.notEqual(updated.revision,cached.body.revision)
  const {body:updatedHome}=await read('/api/v1/public/home?locale=zh')
  assert.equal(updatedHome.counts.publications,47);assert.equal(updatedHome.publicationRevision,updated.revision)
  checks.push('Generation invalidation immediately refreshes cached public rows, home totals and matching revisions')
  console.log(JSON.stringify({passed:checks.length,checks},null,2))
} catch(error) {
  console.error(serverLog.slice(-4000));throw error
} finally {
  if(child && child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([new Promise(ok=>child.once('exit',ok)),new Promise(ok=>setTimeout(ok,3000))])
    if(child.exitCode === null) child.kill('SIGKILL')
  }
  await rm(directory,{recursive:true,force:true})
}
