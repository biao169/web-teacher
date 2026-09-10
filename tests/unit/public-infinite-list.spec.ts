// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref, shallowRef, type App } from 'vue'
import { usePublicInfiniteList } from '../../app/composables/usePublicInfiniteList'
import { usePublicSelection } from '../../app/composables/usePublicSelection'
import ProjectsList from '../../app/components/public/content/ProjectsList.vue'
import PublicationsList from '../../app/components/public/content/PublicationsList.vue'
import LoadMore from '../../app/components/public/content/LoadMore.vue'
import PublicationRows from '../../app/components/public/content/PublicationRows.vue'
import { publicListHref } from '../../shared/utils/public-list-link'
const mocks=vi.hoisted(()=>({route:null as any,fetch:vi.fn(),state:new Map<string,any>()}))
vi.mock('#app/composables/state',()=>({useState:(key:string,init:()=>unknown)=>{if(!mocks.state.has(key))mocks.state.set(key,ref(init()));return mocks.state.get(key)}}))
vi.mock('#build/fetch.mjs',()=>({$fetch:mocks.fetch}))
vi.mock('#app/composables/router',()=>({useRoute:()=>mocks.route,useRouter:()=>({push:vi.fn()})}))
vi.mock('#app/components/nuxt-link',()=>({default:{props:['to'],setup:(props:any,{slots}:any)=>()=>h('a',{href:props.to},slots.default?.())}}))
let app:App|undefined
beforeEach(()=>{mocks.state.clear();mocks.fetch.mockReset();mocks.route=reactive({path:'/zh/projects',fullPath:'/zh/projects',query:{},hash:''});vi.stubGlobal('IntersectionObserver',undefined)})
afterEach(()=>{app?.unmount();app=undefined;document.body.replaceChildren();vi.unstubAllGlobals()})
function mount(setup:()=>()=>any){const host=document.createElement('div');document.body.append(host);app=createApp({setup});app.mount(host);return host}
const flush=async()=>{for(let i=0;i<8;i++)await nextTick()}
const page=(module='projects',n=1,locale='zh',overrides:any={})=>({schemaVersion:1,locale,module,revision:'a'.repeat(64),totalPublic:30,generatedAt:'',meta:{title:module,description:'',breadcrumbs:[],path:`/${locale}/${module}?page=${n}`},query:{search:null,filters:{}},filters:[],pagination:{page:n,pageSize:12,totalItems:30,totalPages:3,from:(n-1)*12+1,to:Math.min(30,n*12),nextPage:n<3?n+1:null,previousPage:n>1?n-1:null},items:Array.from({length:Math.min(12,30-(n-1)*12)},(_,i)=>({uid:`r${(n-1)*12+i}`,name:'Record',title:'Paper',displayNumber:module==='team'?(n-1)*12+i+1:30-(n-1)*12-i,tags:[],indexTypes:[],publicationType:'paper'})),...overrides}) as any
let feed:ReturnType<typeof usePublicInfiniteList>
function start(initial=page()){const model=shallowRef(initial);mount(()=>{feed=usePublicInfiniteList(model);return()=>h('div')});return model}
describe('all-module incremental loading',()=>{
 it.each(['team','publications','publications/featured','projects','patents','students','research','news','courses'])('appends %s pages with original numbers and stops at the end',async module=>{
  start(page(module));expect(mocks.fetch).not.toHaveBeenCalled()
  mocks.fetch.mockImplementation(async(_url,options)=>page(module,Number(options.query.page)))
  await feed.loadNext();await feed.loadNext();await feed.loadNext()
  expect(mocks.fetch).toHaveBeenCalledTimes(2);expect(feed.items.value).toHaveLength(30)
  expect(feed.items.value.map(row=>row.displayNumber)).toEqual(Array.from({length:30},(_,i)=>module==='team'?i+1:30-i))
  expect(feed.displayModel.value.pagination.to).toBe(30);expect(feed.nextPage.value).toBeNull()
 })
 it('deduplicates concurrent intersection callbacks and retains content across retry',async()=>{
  start();let fail!:(value:any)=>void
  mocks.fetch.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{fail=reject}))
  const pending=feed.loadNext();await feed.loadNext();expect(mocks.fetch).toHaveBeenCalledTimes(1)
  fail(new Error('offline'));await pending;expect(feed.items.value).toHaveLength(12);expect(feed.failure.value).toBe('network')
  mocks.fetch.mockResolvedValue(page('projects',2));await feed.loadNext();expect(feed.items.value).toHaveLength(24);expect(feed.failure.value).toBeNull()
 })
 it.each(['revision','duplicate','order','query','page'])('rejects %s inconsistencies without mixing content',async change=>{
  start();const next=page('projects',2)
  if(change==='revision')next.revision='b'.repeat(64)
  else if(change==='duplicate')next.items[0].uid='r0'
  else if(change==='order')next.items[0].displayNumber=30
  else if(change==='query')next.query.search='foreign'
  else next.pagination.page=3
  mocks.fetch.mockResolvedValue(next);await feed.loadNext();expect(feed.failure.value).toBe('changed');expect(feed.items.value).toHaveLength(12)
  await feed.loadNext();expect(mocks.fetch).toHaveBeenCalledTimes(1)
 })
 it.each(['filter','language'])('aborts a pending request after %s changes and ignores its late response',async change=>{
  const model=start();let finish!:(value:any)=>void
  mocks.fetch.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
  const pending=feed.loadNext()
  if(change==='filter')mocks.route.query={search:'new'};else mocks.route.path='/en/projects'
  expect(mocks.fetch.mock.calls[0]![1].signal.aborted).toBe(true);expect(feed.suspended.value).toBe(true)
  model.value=page('projects',1,change==='language'?'en':'zh',{query:{search:change==='filter'?'new':null,filters:{}}});await nextTick()
  finish(page('projects',2));await pending
  expect(feed.items.value).toHaveLength(12);expect(feed.suspended.value).toBe(false)
 })
 it('retains loading after a hash-only jump and carries ASCII filters in the next request',async()=>{
  const path=publicListHref('/zh/projects',{source:'国家基金',q:'智能'})
  start(page('projects',1,'zh',{meta:{path},query:{search:'智能',filters:{source:'国家基金'}}}))
  mocks.route.hash='#results';mocks.route.fullPath+='#results';expect(feed.suspended.value).toBe(false)
  mocks.fetch.mockResolvedValue(page('projects',2,'zh',{query:{search:'智能',filters:{source:'国家基金'}}}));await feed.loadNext()
  expect(mocks.fetch.mock.calls[0]![1].query.f).toBe(new URL(path,'https://test.invalid').searchParams.get('f'))
  expect(mocks.fetch.mock.calls[0]![1].query.page).toBe('2')
 })
 it('selects only loaded records and never auto-selects appended items',async()=>{
  let selection!:ReturnType<typeof usePublicSelection>
  mount(()=>{feed=usePublicInfiniteList(page());selection=usePublicSelection(feed.displayModel);return()=>h('div')})
  selection.togglePage(true);expect(selection.count.value).toBe(12)
  mocks.fetch.mockResolvedValue(page('projects',2));await feed.loadNext()
  expect(selection.count.value).toBe(12);expect(selection.allOnPage.value).toBe(false);expect(selection.someOnPage.value).toBe(true)
  selection.togglePage(true);expect(selection.count.value).toBe(24)
 })
})
describe('bottom sentinel and accessible fallback',()=>{
 it('requests on intersection, pauses on failure, supports explicit retry and disconnects',async()=>{
  let callback!:(entries:any[])=>void;const disconnect=vi.fn(),load=vi.fn()
  vi.stubGlobal('IntersectionObserver',class {constructor(cb:any){callback=cb}observe(){}disconnect=disconnect})
  const props=reactive({locale:'zh' as const,hasMore:true,loading:false,suspended:false,failure:null as any,nextHref:'/zh/projects?page=2',count:12})
  const host=mount(()=>()=>h(LoadMore,{...props,onLoad:load}))
  callback([{isIntersecting:false}]);expect(load).not.toHaveBeenCalled()
  callback([{isIntersecting:true}]);expect(load).toHaveBeenCalledTimes(1)
  props.failure='network';await nextTick();callback([{isIntersecting:true}]);expect(load).toHaveBeenCalledTimes(1)
  ;(host.querySelector('button') as HTMLButtonElement).click();expect(load).toHaveBeenCalledTimes(2)
  app!.unmount();app=undefined;expect(disconnect).toHaveBeenCalledTimes(1)
 })
 it('keeps manual loading available when IntersectionObserver is unsupported',()=>{
  const load=vi.fn(),host=mount(()=>()=>h(LoadMore,{locale:'en',hasMore:true,loading:false,suspended:false,failure:null,nextHref:'/en/projects?page=2',count:12,onLoad:load}))
  ;(host.querySelector('button') as HTMLButtonElement).click();expect(load).toHaveBeenCalledOnce()
 })
})
it('loads citations only for an appended page, cancels old formats and renders the current batch',async()=>{
 const model=page('publications',2);let finish!:(value:any)=>void
 mocks.fetch.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const host=mount(()=>()=>h(PublicationRows,{model,initial:false}))
 expect(mocks.fetch.mock.calls[0]![1].query.uid).toEqual(model.items.map((row:any)=>row.uid))
 const batch=(style:string)=>({schemaVersion:1,module:'publications',locale:'zh',citationStyle:style,revision:model.revision,totalPublic:30,uids:model.items.map((row:any)=>row.uid),unavailableUids:[],items:model.items.map((row:any)=>({...row,citation:{style,label:'APA',status:'saved',text:`${style} fresh ${row.uid}`,highlights:[]}}))})
 mocks.fetch.mockResolvedValue(batch('apa'));mocks.state.get('public-citation-style:v1').value='apa';await flush()
 expect(mocks.fetch.mock.calls[0]![1].signal.aborted).toBe(true)
 finish(batch('gbt'));await flush()
 expect(host.querySelectorAll('.public-citation-text')).toHaveLength(12);expect(host.textContent).toContain('apa fresh');expect(host.textContent).not.toContain('gbt fresh')
})

it.each(['projects','publications'])('renders appended %s records through the real list frame and preserves selected rows',async module=>{
 const model=page(module),citations={style:'gbt',revision:model.revision,entries:model.items.map((row:any)=>({uid:row.uid,citation:{style:'gbt',label:'GB/T 7714',status:'saved',text:'First citation '+row.uid,highlights:[]}}))}
 mocks.fetch.mockImplementation(async(url,options)=>url.endsWith('/selection')?{schemaVersion:1,module:'publications',locale:'zh',citationStyle:'gbt',revision:model.revision,totalPublic:30,uids:options.query.uid,unavailableUids:[],items:page(module,2).items.map((row:any)=>({...row,citation:{style:'gbt',label:'GB/T 7714',status:'saved',text:'Next citation '+row.uid,highlights:[]}}))}:page(module,2))
 const host=mount(()=>()=>h(module==='projects'?ProjectsList:PublicationsList,{model,citations,citationStatus:'success',citationError:false} as any))
 const checkbox=host.querySelector('.public-record-checkbox') as HTMLInputElement;checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await nextTick()
 ;(host.querySelector('.public-load-more button') as HTMLButtonElement).click();await flush()
 expect(host.querySelectorAll('.public-compact-record')).toHaveLength(24);expect(host.querySelectorAll('.public-compact-record[data-selected]')).toHaveLength(1);expect(host.querySelectorAll('.public-record-checkbox:checked')).toHaveLength(1)
 expect(host.querySelectorAll('.public-record-number')[12]!.textContent).toBe('18.')
 expect(host.textContent).toContain('全选已加载');expect(host.querySelector('.public-copy-record')).not.toBeNull()
 if(module==='publications'){expect(host.querySelectorAll('.public-citation-text')).toHaveLength(24);expect(host.textContent).toContain('Next citation r12')}
})
