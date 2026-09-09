import assert from 'node:assert/strict'
import test from 'node:test'
import { core, load, createHarness, createPublicServices, insert, iso, recordingAdapter, request, seedPublicContent } from '../helpers/offline-stage5.mjs'
const { parsePublicSelectionRequest, readPublicSelection } = load('server/services/public/public-selection.js')
const selected = (services, module, uids, locale = 'zh') => readPublicSelection({ module, locale, uids }, query => services[module].list(query))

test('selection accepts only bounded, unique stable UIDs for supported modules', () => {
  assert.deepEqual(parsePublicSelectionRequest({module:'publications/featured',locale:'en',uid:['paper:a','paper:b']}),{module:'publications',locale:'en',uids:['paper:a','paper:b'],citationStyle:'gbt'})
  for (const patch of [{module:'team'},{module:'news'},{module:['projects']},{uid:[]},{uid:Array.from({length:13},(_,i)=>`p-${i}`)},{uid:['p','p']},{uid:['p',null]},{uid:'../private'},{locale:'fr'},{page:2},{search:'name'}]) {
    assert.throws(()=>parsePublicSelectionRequest({module:'projects',locale:'zh',uid:'p',...patch}), undefined, JSON.stringify(patch))
  }
  assert.throws(()=>core.parsePublicListRequest({locale:'zh',selectedUids:['p']},[]))
})
for (const kind of ['sqlite','d1']) {
  test(`${kind}: selection bypasses stale list caches and never substitutes a renumbered record`, async t => {
    const h=createHarness(kind);t.after(()=>h.close());await seedPublicContent(h)
    const services=createPublicServices(h.adapter,{value:Date.parse(iso())})
    for(const [module,uid,table] of [['publications','publication:one','publications'],['projects','project:one','projects'],['patents','patent:one','patents'],['students','student:one','students'],['research','research:reliable','research_interests'],['courses','course:one','courses']]) {
      const warm=await services[module].list(request())
      assert.ok(warm.viewModel.items.some(item=>item.uid===uid))
      insert(h.db,`UPDATE ${table} SET visibility='hidden' WHERE uid=?`,uid)
      assert.equal((await services[module].list(request())).cache,'hit')
      const hidden=await selected(services,module,[uid,'absent-uid'])
      assert.deepEqual(hidden.items,[]);assert.deepEqual(hidden.unavailableUids,[uid,'absent-uid'])
      assert.deepEqual((await selected(services,module,["x' OR 1=1 --"])).items,[])
      insert(h.db,`DELETE FROM ${table} WHERE uid=?`,uid)
      assert.deepEqual((await selected(services,module,[uid])).unavailableUids,[uid])
    }
    insert(h.db,"INSERT INTO publications(uid,created_at,updated_at,title,authors,year,visibility) VALUES('replacement',?,?, 'Replacement','A',2026,'public')",iso(),iso())
    assert.deepEqual((await selected(services,'publications',['publication:one'])).items,[])
  })
  test(`${kind}: exact selected sets retain global numbers, default ordering and fixed query counts`, async t => {
    const h=createHarness(kind);t.after(()=>h.close())
    for(let i=1;i<=25;i++)insert(h.db,"INSERT INTO publications(uid,created_at,updated_at,title,authors,year,visibility) VALUES(?,?,?,?,?,?,'public')",`paper-${i}`,iso(),iso(),`Title ${i}`,'A',2000+i)
    const tracked=recordingAdapter(h.adapter),services=createPublicServices(tracked,{value:Date.parse(iso())})
    const result=await selected(services,'publications',['paper-2','paper-25','paper-14','missing'])
    assert.deepEqual(result.items.map(item=>[item.uid,item.displayNumber]),[['paper-25',25],['paper-14',14],['paper-2',2]])
    assert.equal(result.totalPublic,25);assert.deepEqual(result.unavailableUids,['missing'])
    const en=await selected(services,'publications',['paper-2','paper-25','paper-14'],'en')
    assert.deepEqual(en.items.map(item=>[item.uid,item.displayNumber]),result.items.map(item=>[item.uid,item.displayNumber]))
    const measure=recordingAdapter(h.adapter),store=new core.PublicContentStore(measure)
    await store.publications(request('zh',{selectedUids:Array.from({length:12},(_,i)=>`paper-${i+1}`)}))
    assert.equal(measure.commands.length,1);assert.equal(measure.commands[0].commands.length,3)
    assert.ok(measure.commands[0].commands.every(command=>command.params.length<=100))
  })
  test(`${kind}: preparation contains complete public text without student private fields or project summaries`, async t => {
    const h=createHarness(kind);t.after(()=>h.close());await seedPublicContent(h)
    const full='完整段落。'.repeat(200)
    insert(h.db,"UPDATE students SET bio=?,contact_visibility='hidden' WHERE uid='student:one'",full)
    insert(h.db,"UPDATE courses SET summary=? WHERE uid='course:one'",full)
    insert(h.db,"UPDATE research_interests SET description=? WHERE uid='research:reliable'",full)
    const services=createPublicServices(h.adapter,{value:Date.parse(iso())})
    for(const [module,uid,field] of [['students','student:one','biography'],['courses','course:one','summary'],['research','research:reliable','description']]) {
      const batch=await selected(services,module,[uid]);assert.equal(batch.items[0][field],full)
      assert.ok(!JSON.stringify(batch).includes('S2025001'));assert.ok(!JSON.stringify(batch).includes('student@example.edu'))
    }
    assert.equal((await selected(services,'projects',['project:one'])).items[0].summary,null)
    assert.equal((await selected(services,'courses',['course:one'],'en')).items[0].name,'Distributed Systems')
    const before=await selected(services,'courses',['course:one'])
    await new core.CacheInvalidator(new core.CacheGenerationStore(h.adapter)).invalidate({module:'courses',uid:'course:one'},iso(Date.parse(iso())+1000))
    assert.notEqual((await selected(services,'courses',['course:one'])).revision,before.revision)
  })
}
