import assert from 'node:assert/strict'
import test from 'node:test'
import { core, createHarness, createPublicServices, request, seedPublicContent, iso, insert, recordingAdapter } from '../helpers/offline-stage5.mjs'
import { createHomeService } from '../helpers/offline-stage4.mjs'
for (const kind of ['sqlite', 'd1']) {
 test(`${kind}: long research lists stay bounded while details and selected copies retain the full text`, async t => {
  const h=createHarness(kind);t.after(()=>h.close());await seedPublicContent(h)
  const text='Long research paragraph. '.repeat(2000).trim()
  for(let i=0;i<36;i++) insert(h.db, `INSERT INTO research_interests(uid,created_at,updated_at,name,description,visibility) VALUES(?,?,?,?,?,'public')`, `long-${i}`,iso(),iso(),`Research ${i}`,text)
  const clock={value:Date.parse(iso())},services=createPublicServices(h.adapter,clock)
  const home=createHomeService(h.adapter,clock).service
  for(const locale of ['zh','en']) {
    const page=(await home.home(locale)).viewModel
    assert.ok(page.researchInterests.every(item=>(item.description?.length??0)<=301))
    assert.ok(Buffer.byteLength(JSON.stringify(page))<50000)
  }
  const list=(await services.research.list(request('zh',{pageSize:36}))).viewModel
  assert.equal(list.items.length,36)
  assert.ok(list.items.every(item=>(item.description?.length??0)<=221))
  assert.ok(Buffer.byteLength(JSON.stringify(list))<50000)
  assert.equal((await services.research.detail('zh','long-1')).viewModel.item.description,text)
  const selected=(await services.research.list(request('zh',{selectedUids:['long-1'],pageSize:12}))).viewModel
  assert.equal(selected.items[0].description,text)
  t.diagnostic(`36-row research payload: ${Buffer.byteLength(JSON.stringify(list))} bytes; full field ${Buffer.byteLength(text)} bytes`)
 })
 test(`${kind}: translation invalidation changes list, home and copy versions without renumbering`, async t => {
  const h=createHarness(kind);t.after(()=>h.close());await seedPublicContent(h)
  const clock={value:Date.parse(iso())},services=createPublicServices(h.adapter,clock),home=createHomeService(h.adapter,clock).service
  const before=(await services.publications.list(request('en'))).viewModel
  const homeBefore=(await home.home('en')).viewModel
  assert.equal(before.revision,homeBefore.publicationRevision)
  assert.equal((await services.publications.list(request('en'))).cache,'hit')
  const invalidator=new core.CacheInvalidator(new core.CacheGenerationStore(h.adapter))
  await invalidator.invalidate({module:'translation_cache'},iso(clock.value+1000));clock.value+=2000
  const afterResult=await services.publications.list(request('en')),after=afterResult.viewModel
  const homeAfter=(await home.home('en')).viewModel
  const selected=(await services.publications.list(request('en',{selectedUids:[before.items[0].uid]}))).viewModel
  assert.equal(afterResult.cache,'miss');assert.notEqual(after.revision,before.revision)
  assert.deepEqual(after.items.map(item=>[item.uid,item.displayNumber]),before.items.map(item=>[item.uid,item.displayNumber]))
  assert.equal(homeAfter.publicationRevision,after.revision);assert.equal(selected.revision,after.revision)
  assert.equal((await services.publications.list(request('zh'))).viewModel.revision,after.revision)
 })
 test(`${kind}: project listing omits unused summary projection and translation, detail retains it`, async t => {
  const h=createHarness(kind);t.after(()=>h.close());await seedPublicContent(h)
  const text='PROJECT-LONG-SUMMARY '.repeat(2000).trim();insert(h.db,"UPDATE projects SET summary=? WHERE uid='project:one'",text)
  const tracked=recordingAdapter(h.adapter),services=createPublicServices(tracked,{value:Date.parse(iso())})
  const list=(await services.projects.list(request('en'))).viewModel
  assert.ok(list.items.every(item=>item.summary===null));assert.ok(!JSON.stringify(list).includes('PROJECT-LONG-SUMMARY'))
  const commands=tracked.commands.flatMap(call=>call.commands??[call.command]).filter(Boolean)
  assert.ok(!commands.some(command=>command.params.some(value=>value===text)))
  assert.equal((await services.projects.detail('zh','project:one')).viewModel.item.summary,text)
 })
}
