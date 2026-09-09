import assert from 'node:assert/strict'
import test from 'node:test'
import { core, createHarness, iso } from '../helpers/offline-stage3.mjs'
const descriptor={namespace:'public-content',resource:'projects-list',locale:'zh',tags:['public:projects','public:translations'],params:{page:1}}
const policy={ttlSeconds:10,staleSeconds:10}
function fixture(t) {
 const h=createHarness();t.after(()=>h.close());const clock={value:Date.parse(iso())}
 const generations=new core.CacheGenerationStore(h.adapter),raw=new core.MemoryCacheAdapter({now:()=>clock.value}),values=new core.PublicValueCache()
 const options={now:()=>new Date(clock.value),valueCache:values,coordinator:core.createPublicCacheCoordinator()}
 const service=()=>new core.PublicCacheService(raw,generations,options)
 return {h,clock,generations,raw,values,service,options}
}
test('verified values are bounded LRU snapshots with copy isolation, expiry and payload caps',()=>{
 const cache=new core.PublicValueCache(2,100),entry={value:{nested:{name:'Original'}},etag:'"one"',generatedAt:iso(),freshUntil:Date.parse(iso())+1000,staleUntil:Date.parse(iso())+2000,bytes:40},now=Date.parse(iso())
 cache.put('a',entry,now);entry.value.nested.name='Changed'
 const read=cache.get('a',now,100);assert.equal(read.value.nested.name,'Original');read.value.nested.name='Caller mutation'
 assert.equal(cache.get('a',now,100).value.nested.name,'Original')
 cache.put('b',entry,now);cache.get('a',now,100);cache.put('c',entry,now)
 assert.equal(cache.get('b',now,100).status,'miss');assert.equal(cache.size,2);assert.equal(cache.bytes,80)
 assert.equal(cache.get('a',now+1000,100).status,'stale');assert.equal(cache.get('a',now+2000,100).status,'miss')
 assert.equal(cache.get('c',now,39).status,'miss');assert.equal(cache.bytes,0)
 cache.put('too-large',{...entry,bytes:101},now);assert.equal(cache.size,0)
})
test('warm request-scoped services reuse validated values and keep caller changes isolated',async t=>{
 const f=fixture(t);let loads=0
 const first=await f.service().remember(descriptor,policy,async()=>{loads++;return {items:[{uid:'one',title:'Original'}]}})
 first.value.items[0].title='Changed by caller'
 const accesses=f.raw.metrics.hits+f.raw.metrics.misses
 const next=await f.service().remember(descriptor,policy,async()=>{throw Error('must not load')})
 assert.equal(next.cache,'hit');assert.equal(next.value.items[0].title,'Original');assert.equal(loads,1)
 assert.equal(f.raw.metrics.hits+f.raw.metrics.misses,accesses);assert.equal(f.values.metrics.hits,1)
})
test('every memory hit still validates generations, including translations; locale and page keys remain isolated',async t=>{
 const f=fixture(t)
 await f.service().remember(descriptor,policy,async()=>({title:'Old'}))
 await f.generations.bump(['public:translations'],iso(f.clock.value+1))
 const changed=await f.service().remember(descriptor,policy,async()=>({title:'New'}))
 assert.equal(changed.cache,'miss');assert.equal(changed.value.title,'New')
 const en=await f.service().remember({...descriptor,locale:'en'},policy,async()=>({title:'English'}))
 const page2=await f.service().remember({...descriptor,params:{page:2}},policy,async()=>({title:'Second page'}))
 assert.equal(en.cache,'miss');assert.equal(page2.cache,'miss')
 assert.equal((await f.service().get(descriptor)).value.title,'New')
})
test('verified backing entries are promoted without extending their existing expiry',async t=>{
 const f=fixture(t),plain=new core.PublicCacheService(f.raw,f.generations,{now:()=>new Date(f.clock.value)})
 await plain.put(descriptor,{title:'Raw'},policy);f.clock.value+=9000
 assert.equal((await f.service().get(descriptor)).status,'fresh');assert.equal(f.values.size,1)
 f.clock.value+=11000;assert.equal((await f.service().get(descriptor)).status,'miss')
})
test('stale memory responses coalesce refreshes and expire on refresh failure',async t=>{
 const f=fixture(t),tasks=[];f.options.defer=task=>tasks.push(task)
 await f.service().remember(descriptor,policy,async()=>({version:1}));f.clock.value+=11000
 let release,loads=0;const gate=new Promise(resolve=>{release=resolve})
 const loader=async()=>{loads++;await gate;return {version:2}}
 const responses=await Promise.all(Array.from({length:10},()=>f.service().remember(descriptor,policy,loader)))
 assert.ok(responses.every(result=>result.cache==='stale'&&result.value.version===1));assert.equal(loads,1)
 release();await Promise.all(tasks);assert.equal((await f.service().get(descriptor)).value.version,2)
 f.clock.value+=21000
 await assert.rejects(()=>f.service().remember(descriptor,policy,async()=>{throw Error('offline')}),/offline/)
})
test('invalidation during loading never publishes obsolete values into either layer',async t=>{
 const f=fixture(t);let release,started;const gate=new Promise(resolve=>{release=resolve}),begin=new Promise(resolve=>{started=resolve})
 const loading=f.service().remember(descriptor,policy,async()=>{started();await gate;return {version:1}})
 await begin;await f.generations.bump(['public:projects'],iso());release();await loading
 assert.equal(f.values.size,0);assert.equal(f.raw.size,0)
 const next=await f.service().remember(descriptor,policy,async()=>({version:2}));assert.equal(next.cache,'miss')
})
test('raw corruption is rejected before promotion and a backing outage can still use trusted local values',async t=>{
 const f=fixture(t),key=await core.prepareCacheKey(descriptor,await f.generations.read(descriptor.tags))
 await f.raw.put(key.physicalKey,{bytes:new TextEncoder().encode('bad JSON'),etag:null},30)
 assert.equal((await f.service().get(descriptor)).status,'miss');assert.equal(f.values.size,0)
 const broken={kind:'memory',get:async()=>{throw Error('down')},put:async()=>{throw Error('down')},delete:async()=>false}
 const cache=new core.PublicCacheService(broken,f.generations,f.options)
 await cache.remember(descriptor,policy,async()=>({title:'Available'}))
 assert.equal((await cache.remember(descriptor,policy,async()=>{throw Error('not needed')})).cache,'hit')
})
test('representative cached view avoids repeated raw decoding and hashing',async t=>{
 const f=fixture(t),payload={items:Array.from({length:36},(_,i)=>({uid:String(i),description:'Academic text. '.repeat(400)}))}
 const plain=new core.PublicCacheService(f.raw,f.generations,{now:()=>new Date(f.clock.value)})
 await plain.put(descriptor,payload,policy);await f.service().get(descriptor)
 const samples={}
 for(const [name,cache] of [['serialized',plain],['verified',f.service()]]) {
  const times=[]
  for(let i=0;i<20;i++){const start=performance.now();const result=await cache.get(descriptor);assert.equal(result.status,'fresh');times.push(performance.now()-start)}
  samples[name]=Number(times.sort((a,b)=>a-b)[10].toFixed(3))
 }
 t.diagnostic(JSON.stringify({cacheBenchmark:{payloadBytes:Buffer.byteLength(JSON.stringify(payload)),medianMs:samples,iterations:20}}))
 assert.ok(f.values.metrics.hits>=20)
})
