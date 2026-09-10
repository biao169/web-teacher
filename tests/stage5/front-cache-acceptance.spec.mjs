import assert from 'node:assert/strict'
import test from 'node:test'
import { core, createHarness, createPublicServices, request, seedPublicContent, iso, recordingAdapter } from '../helpers/offline-stage5.mjs'
for(const kind of ['sqlite','d1']) {
 test(`${kind}: all eight public modules serve warm views with only the generation query, then invalidate together`,async t=>{
  const h=createHarness(kind);t.after(()=>h.close());await seedPublicContent(h)
  const tracked=recordingAdapter(h.adapter),clock={value:Date.parse(iso())},services=createPublicServices(tracked,clock)
  const modules=['team','publications','projects','patents','students','research','news','courses']
  for(const module of modules) {
   const first=await services[module].list(request('en'));assert.equal(first.cache,'miss')
   tracked.commands.length=0
   const warm=await services[module].list(request('en'));assert.equal(warm.cache,'hit');assert.deepEqual(warm.viewModel,first.viewModel)
   assert.equal(tracked.commands.length,1)
   const call=tracked.commands[0];assert.equal(call.group,'execute');assert.match(call.command.sql,/SELECT tag, generation FROM cache_generations/u)
  }
  await new core.CacheInvalidator(new core.CacheGenerationStore(h.adapter)).invalidate({module:'translation_cache'},iso())
  for(const module of modules)assert.equal((await services[module].list(request('en'))).cache,'miss')
 })
}
