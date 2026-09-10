import assert from 'node:assert/strict'
import test from 'node:test'
import { performance } from 'node:perf_hooks'
import { core, createHarness, createPublicServices, insert, iso, recordingAdapter, request, seedPublicContent } from '../helpers/offline-stage5.mjs'

function paper(h, uid, year, type = 'keep', featured = 0, visibility = 'public') {
  insert(h.db, `INSERT INTO publications(uid,created_at,updated_at,title,authors,year,publication_type,is_featured,visibility)
    VALUES(?,?,?,?,?,?,?,?,?)`, uid, iso(), iso(), uid, 'Author', year, type, featured, visibility)
}
const pairs = snapshot => snapshot.items.map(row => [row.uid, row.displayNumber])

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: ranking precedes filters, fixed featured filters and translation`, async t => {
    const h = createHarness(kind); t.after(() => h.close())
    paper(h,'paper-a',2021,'keep',1); paper(h,'paper-b',2022,'skip'); paper(h,'paper-c',2023,'keep',1); paper(h,'paper-d',2024,'skip')
    paper(h,'paper-hidden',2026,'keep',1,'hidden')
    const services=createPublicServices(h.adapter,{value:Date.parse(iso())})
    const all=(await services.publications.list(request())).viewModel
    assert.deepEqual(pairs(all),[['paper-d',4],['paper-c',3],['paper-b',2],['paper-a',1]])
    const keep=(await services.publications.list(request('zh',{filters:{publicationType:'keep'}}))).viewModel
    assert.deepEqual(pairs(keep),[['paper-c',3],['paper-a',1]])
    assert.equal(keep.pagination.totalItems,2); assert.equal(keep.totalPublic,4)
    const featured=(await services.publications.featured(request('en',{filters:{featured:'1'}}))).viewModel
    assert.deepEqual(pairs(featured),pairs(keep)); assert.equal(featured.revision,all.revision)
    const search=(await services.publications.list(request('en',{search:'paper-c'}))).viewModel
    assert.deepEqual(pairs(search),[['paper-c',3]]); assert.equal(search.revision,all.revision)
    assert.match(all.revision,/^[0-9a-f]{64}$/)
  })

  test(`${kind}: add/delete and date changes renumber the current collection without altering UIDs`, async t => {
    const h=createHarness(kind); t.after(()=>h.close()); const store=new core.PublicContentStore(h.adapter)
    for(const [i,uid] of ['a','b','c','d'].entries()) paper(h,uid,2021+i,i%2?'skip':'keep')
    insert(h.db,"DELETE FROM publications WHERE uid='b'")
    assert.deepEqual(pairs(await store.publications(request('zh',{filters:{publicationType:'keep'}}))),[['c',2],['a',1]])
    insert(h.db,"DELETE FROM publications WHERE uid='d'"); paper(h,'e',2025)
    assert.deepEqual(pairs(await store.publications(request())),[['e',3],['c',2],['a',1]])
    insert(h.db,"UPDATE publications SET year=2026 WHERE uid='a'")
    assert.deepEqual(pairs(await store.publications(request())),[['a',3],['e',2],['c',1]])
    assert.deepEqual(h.db.prepare('SELECT uid FROM publications ORDER BY uid').all().map(r=>r.uid),['a','c','e'])
  })

  test(`${kind}: pagination, missing dates and equal-date ties have stable numbers`, async t => {
    const h=createHarness(kind); t.after(()=>h.close()); const store=new core.PublicContentStore(h.adapter)
    for(let i=0;i<25;i++) paper(h,`p-${i}`,2020+Math.floor(i/3),i%2?'odd':'even')
    paper(h,'undated',null)
    const first=await store.publications(request()), second=await store.publications(request('zh',{page:2})), third=await store.publications(request('en',{page:3}))
    const full=[...first.items,...second.items,...third.items]
    assert.equal(new Set(full.map(r=>r.uid)).size,26)
    assert.deepEqual(full.map(r=>r.displayNumber),Array.from({length:26},(_,i)=>26-i))
    assert.equal(full.at(-1).uid,'undated')
    const expected=full.filter(r=>r.publicationType==='even')
    const filtered1=await store.publications(request('zh',{filters:{publicationType:'even'}}))
    const filtered2=await store.publications(request('en',{page:2,filters:{publicationType:'even'}}))
    assert.deepEqual([...filtered1.items,...filtered2.items].map(r=>[r.uid,r.displayNumber]),expected.map(r=>[r.uid,r.displayNumber]))
    const empty=await store.publications(request('zh',{search:'does-not-exist'}))
    assert.equal(empty.total,0);assert.equal(empty.totalPublic,26);assert.deepEqual(empty.items,[])
  })

  test(`${kind}: team order, student enrollment fallback and scheduled news use their own public scope`, async t => {
    const h=createHarness(kind); t.after(()=>h.close()); const seed=await seedPublicContent(h)
    const services=createPublicServices(h.adapter,{value:Date.parse(seed.at)})
    const team=(await services.team.list(request())).viewModel
    assert.deepEqual(pairs(team),[['profile:lead',1],['profile:member',2]]);assert.equal(team.totalPublic,2)
    const member=(await services.team.list(request('en',{search:'李华'}))).viewModel
    assert.deepEqual(pairs(member),[['profile:member',2]])
    for(const [uid,grade,date] of [['student-grade','2027级',null],['student-date','2026','2026-09-01'],['student-none','访问学生',null]])
      insert(h.db,`INSERT INTO students(uid,created_at,updated_at,name,grade,enrollment_date,visibility) VALUES(?,?,?,?,?,?,'public')`,uid,seed.at,seed.at,uid,grade,date)
    const students=(await services.students.list(request())).viewModel
    assert.deepEqual(pairs(students),[['student-grade',4],['student-date',3],['student:one',2],['student-none',1]])
    const store=services.store
    const before=await store.news(request(),seed.at), after=await store.news(request(),seed.future)
    assert.ok(!before.items.some(r=>r.slug==='future-news'))
    assert.equal(after.totalPublic,before.totalPublic+1)
    assert.notEqual(after.revision,before.revision)
    const filtered=await store.news(request('en',{filters:{category:before.items[0].category}}),seed.at)
    const numbers=new Map(before.items.map(r=>[r.uid,r.displayNumber]))
    for(const r of filtered.items) assert.equal(r.displayNumber,numbers.get(r.uid))
  })

  test(`${kind}: all eight modules expose complete totals and numbered bounded pages`, async t => {
    const h=createHarness(kind);t.after(()=>h.close());const seed=await seedPublicContent(h)
    const services=createPublicServices(h.adapter,{value:Date.parse(seed.at)})
    for(const module of ['team','publications','projects','patents','students','research','news','courses']) {
      const vm=(await services[module].list(request())).viewModel
      assert.ok(vm.totalPublic>=vm.pagination.totalItems)
      assert.equal(vm.items.length,vm.pagination.to-vm.pagination.from+1)
      assert.ok(vm.items.every(r=>Number.isInteger(r.displayNumber)&&r.displayNumber>=1&&r.displayNumber<=vm.totalPublic))
    }
  })

  test(`${kind}: research is paged, searched and ranked over the full collection`, async t => {
    const h=createHarness(kind);t.after(()=>h.close())
    for(let i=0;i<105;i++) insert(h.db,`INSERT INTO research_interests(uid,created_at,updated_at,name,visibility) VALUES(?,?,?,?,'public')`,`r-${i}`,new Date(Date.parse(iso())+i*1000).toISOString(),iso(),i%2?'search-me':'other')
    const services=createPublicServices(h.adapter,{value:Date.parse(iso())+200000})
    const last=(await services.research.list(request('en',{page:9}))).viewModel
    assert.equal(last.totalPublic,105);assert.equal(last.count,105)
    assert.deepEqual(last.items.map(r=>r.displayNumber),[9,8,7,6,5,4,3,2,1])
    const found=(await services.research.list(request('zh',{search:'search-me'}))).viewModel
    assert.equal(found.pagination.totalItems,52)
    assert.deepEqual(found.items.map(r=>r.displayNumber),[104,102,100,98,96,94,92,90,88,86,84,82])
  })

  test(`${kind}: shared cache invalidation refreshes number, total, facets and revision together`, async t => {
    const h=createHarness(kind);t.after(()=>h.close());paper(h,'older',2020);paper(h,'newer',2021)
    const clock={value:Date.parse(iso())};const services=createPublicServices(h.adapter,clock)
    const first=await services.publications.list(request())
    const filtered=await services.publications.list(request('zh',{filters:{year:'2020'}}))
    paper(h,'latest',2026)
    assert.equal((await services.publications.list(request())).cache,'hit')
    const invalidator=new core.CacheInvalidator(new core.CacheGenerationStore(h.adapter))
    await invalidator.invalidate({module:'publications',uid:'latest'},iso(clock.value+1000));clock.value+=2000
    const next=await services.publications.list(request())
    const nextFiltered=await services.publications.list(request('zh',{filters:{year:'2020'}}))
    assert.equal(next.cache,'miss');assert.equal(next.viewModel.totalPublic,3)
    assert.deepEqual(pairs(next.viewModel),[['latest',3],['newer',2],['older',1]])
    assert.notEqual(next.viewModel.revision,first.viewModel.revision)
    assert.notEqual(nextFiltered.viewModel.revision,filtered.viewModel.revision)
    assert.equal(nextFiltered.viewModel.totalPublic,3)
    assert.ok(next.viewModel.filters.find(f=>f.key==='year').options.some(o=>o.value==='2026'))
  })
}

test('actual SQL keeps the unfiltered index path and confines filtered payloads to one page', async t => {
  const h=createHarness('sqlite');t.after(()=>h.close())
  const stmt=h.db.prepare(`INSERT INTO publications(uid,created_at,updated_at,title,authors,year,publication_type,visibility)
    VALUES(?,?,?,?,?,?,?,'public')`)
  h.db.exec('BEGIN')
  for(let i=0;i<20000;i++) stmt.run(`bench-${i}`,iso(),iso(),`Paper ${i}`,'A. Author',2000+i%27,i%3?'journal':'conference')
  h.db.exec('COMMIT')
  const tracked=recordingAdapter(h.adapter),store=new core.PublicContentStore(tracked)
  const initial=await store.publications(request())
  const filtered=await store.publications(request('zh',{filters:{publicationType:'conference'}}))
  assert.equal(initial.totalPublic,20000);assert.equal(filtered.items.length,12)
  assert.ok(filtered.items.some((r,i)=>r.displayNumber!==filtered.total-i),'numbers must not come from filtered count')
  const command=tracked.commands[0].commands[0]
  const details=h.db.prepare(`EXPLAIN QUERY PLAN ${command.sql}`).all(...command.params).map(r=>r.detail)
  assert.ok(details.some(x=>x.includes('idx_publications_visibility_year')))
  assert.ok(!details.some(x=>x.includes('TEMP B-TREE')))
  assert.equal(tracked.commands[1].commands.length,3)
  const numbered=tracked.commands[1].commands[0]
  const filteredPlan=h.db.prepare(`EXPLAIN QUERY PLAN ${numbered.sql}`).all(...numbered.params).map(r=>r.detail)
  const timings={}
  for(const [name,req] of [['unfiltered',request()],['filtered',request('zh',{filters:{publicationType:'conference'}})]]) {
    const times=[]
    for(let i=0;i<5;i++) {const start=performance.now();await store.publications(req);times.push(performance.now()-start)}
    timings[name]=Number(times.sort((a,b)=>a-b)[2].toFixed(2))
  }
  // Compare an alternative SQL scalar predecessor count for each selected row.
  const correlated=`SELECT p.uid,(SELECT COUNT(*) FROM publications b WHERE b.visibility='public' AND
    (b.year>p.year OR (b.year=p.year AND (b.sort_order<p.sort_order OR (b.sort_order=p.sort_order AND b.id<=p.id))))) AS list_position
    FROM publications p WHERE p.visibility='public' AND p.publication_type='conference'
    ORDER BY p.year DESC,p.sort_order ASC,p.id ASC LIMIT 12`
  const start=performance.now();const alternative=h.db.prepare(correlated).all();const alternativeMs=performance.now()-start
  const rowsOnly={}
  for(const [name,sql,params] of [['window',numbered.sql,numbered.params],['correlated',correlated,[]]]) {
    const times=[]
    for(let i=0;i<5;i++) {const begin=performance.now();h.db.prepare(sql).all(...params);times.push(performance.now()-begin)}
    rowsOnly[name]=Number(times.sort((a,b)=>a-b)[2].toFixed(2))
  }
  const deep=await store.publications(request('zh',{page:300,filters:{publicationType:'conference'}}))
  const deepCommand=tracked.commands.at(-1).commands[0]
  const deepStart=performance.now();const deepWindow=h.db.prepare(deepCommand.sql).all(...deepCommand.params);const deepWindowMs=performance.now()-deepStart
  const deepAltStart=performance.now();const deepAlternative=h.db.prepare(correlated+' OFFSET 3588').all();const deepAlternativeMs=performance.now()-deepAltStart
  assert.deepEqual(deepAlternative.map(r=>[r.uid,20000-r.list_position+1]),pairs(deep))
  assert.equal(deepWindow.length,12)
  assert.deepEqual(alternative.map(r=>[r.uid,20000-r.list_position+1]),pairs(filtered))
  t.diagnostic(JSON.stringify({rows:20000,pageSize:12,medianBatchMs:timings,medianRowsOnlyMs:rowsOnly,deepRowsOnlyMs:{window:Number(deepWindowMs.toFixed(2)),correlated:Number(deepAlternativeMs.toFixed(2))},correlatedRowsOnlyMs:Number(alternativeMs.toFixed(2)),unfilteredPlan:details,filteredPlan}))
})
