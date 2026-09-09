// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref, type App } from 'vue'
import CitationText from '../../app/components/public/content/CitationText.vue'
import CitationStyleControl from '../../app/components/public/content/CitationStyleControl.vue'
import PublicationsList from '../../app/components/public/content/PublicationsList.vue'
import PublicationDetail from '../../app/components/public/content/PublicationDetail.vue'
import { usePublicSelection } from '../../app/composables/usePublicSelection'
import { publicCitationSegments, readPublicCitationPage } from '../../shared/utils/public-citation'
import { PUBLIC_CITATION_STYLES, PUBLIC_CITATION_LABELS, type PublicCitation, type PublicCitationStyle } from '../../shared/contracts/public-citation'
const mocks=vi.hoisted(()=>({state:new Map<string,any>(),route:null as any,fetch:vi.fn(),push:vi.fn()}))
vi.mock('#app/composables/state',()=>({useState:(key:string,init:()=>unknown)=>{if(!mocks.state.has(key))mocks.state.set(key,ref(init()));return mocks.state.get(key)}}))
vi.mock('#build/fetch.mjs',()=>({$fetch:mocks.fetch}))
vi.mock('#app/composables/router',()=>({useRoute:()=>mocks.route,useRouter:()=>({push:mocks.push})}))
vi.mock('#app/components/nuxt-link',async()=>{const {h}=await import('vue');return {default:{props:['to'],setup:(props:any,{slots}:any)=>()=>h('a',{href:props.to},slots.default?.())}}})
let app:App|undefined
beforeEach(()=>{mocks.state.clear();mocks.fetch.mockReset();mocks.push.mockReset();mocks.route=reactive({path:'/zh/publications',fullPath:'/zh/publications',query:{},hash:''})})
afterEach(()=>{app?.unmount();app=undefined;document.body.replaceChildren();vi.unstubAllGlobals()})
function mount(render:()=>any){const host=document.createElement('div');document.body.append(host);app=createApp({setup:()=>render});app.mount(host);return host}
const citation=(style:PublicCitationStyle='gbt',text=`Saved ${style} Zhang, M.*  A & B.`):PublicCitation=>({style,label:PUBLIC_CITATION_LABELS[style],status:'saved',text,highlights:['Zhang, M.']})
const summary=(uid='p')=>({uid,displayNumber:19,title:'TITLE MUST NOT REPEAT',authors:'AUTHOR MUST NOT REPEAT',venue:'VENUE MUST NOT REPEAT',year:2026,publicationType:'期刊论文',authorRole:null,indexTypes:['SCI'],tags:[],doi:null,externalUrl:null,featured:true,href:'/zh/publications/'+uid})
const model=()=>({schemaVersion:1,locale:'zh',module:'publications',totalPublic:20,revision:'a'.repeat(64),generatedAt:'',meta:{title:'论文',description:'',path:'/zh/publications',breadcrumbs:[]},query:{search:null,filters:{}},filters:[],pagination:{page:1,pageSize:12,totalItems:1,totalPages:1,from:1,to:1,previousPage:null,nextPage:null},items:[summary()]}) as any
const detail=()=>({locale:'zh',module:'publications',meta:{title:'Paper',breadcrumbs:[]},item:{...summary(),citations:PUBLIC_CITATION_STYLES.map(style=>citation(style)),correspondingAuthors:'Zhang, M.',volume:null,issue:null,pages:null,abstract:null,keywords:[],bibtex:null,sourceCitation:null,pdf:{available:false,kind:'pdf',fallback:'none',alt:''}}}) as any
function choose(host:HTMLElement,style:string){const input=host.querySelector(`input[type=radio][value=${style}]`) as HTMLInputElement;input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}))}

describe('shared citation UI',()=>{
 it('renders complete long text with escaped markup and unchanged punctuation/markers',()=>{
  const text='[4]  Zhang, M.* <img src=x onerror=alert(1)> A & B.\n'+ 'Long citation. '.repeat(400)
  const value=citation('apa',text),host=mount(()=>h(CitationText,{citation:value,locale:'en'}))
  expect(host.querySelector('.public-citation-text')!.textContent).toBe(text)
  expect(host.querySelector('mark')!.textContent).toBe('Zhang, M.')
  expect(host.querySelector('img,sup')).toBeNull()
  expect(publicCitationSegments(value).map(segment=>segment.text).join('')).toBe(text)
 })
 it('shares four native radio choices across control instances and keeps group names independent',async()=>{
  const host=mount(()=>h('div',[h(CitationStyleControl,{locale:'zh'}),h(CitationStyleControl,{locale:'en'})]))
  expect(host.querySelectorAll('input[type=radio]')).toHaveLength(8)
  expect(new Set([...host.querySelectorAll('input')].map(input=>input.name)).size).toBe(2)
  choose(host,'ieee');await nextTick()
  expect(host.querySelectorAll('input:checked')).toHaveLength(2)
  expect([...host.querySelectorAll('input:checked')].every(input=>(input as HTMLInputElement).value==='ieee')).toBe(true)
 })
 it('shows one citation per row without duplicate metadata and preserves UID selection through format changes',async()=>{
  const list=model(),data=ref<any>({style:'gbt',revision:list.revision,entries:[{uid:'p',citation:citation()}]})
  const host=mount(()=>h(PublicationsList,{model:list,citations:data.value,citationStatus:'success',citationError:false}))
  let row=host.querySelector('.public-compact-record')!
  expect(row.querySelector('.public-citation-text')!.textContent).toBe(citation().text)
  expect(row.textContent).not.toContain('TITLE MUST NOT REPEAT');expect(row.textContent).not.toContain('AUTHOR MUST NOT REPEAT')
  expect(row.querySelector('.public-record-number')!.textContent).toBe('19.')
  const checkbox=row.querySelector('input') as HTMLInputElement;checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}))
  choose(host,'apa');await nextTick()
  expect(row.querySelector('.public-citation-text')).toBeNull();expect(host.textContent).toContain('正在读取')
  data.value={style:'apa',revision:list.revision,entries:[{uid:'p',citation:citation('apa')}]};await nextTick()
  row=host.querySelector('.public-compact-record')!
  expect(row.querySelector('.public-citation-text')!.textContent).toBe(citation('apa').text)
  expect((row.querySelector('input') as HTMLInputElement).checked).toBe(true)
  expect(row.querySelector('.public-record-number')!.textContent).toBe('19.');expect(mocks.push).not.toHaveBeenCalled()
 })
 it('marks a missing format instead of substituting a different citation',async()=>{
  const data=detail();data.item.citations=data.item.citations.filter((item:PublicCitation)=>item.style!=='apa')
  const host=mount(()=>h(PublicationDetail,{model:data}));choose(host,'apa');await nextTick()
  expect(host.querySelector('.public-citation-missing')!.textContent).toContain('APA：该格式未维护')
  expect(host.querySelector('.public-citation-text')).toBeNull();expect(host.querySelector('.public-citation-box button')).toBeNull()
 })
 it('invalidates prepared publication data on format changes while retaining IDs and flags missing citations',async()=>{
  let selected!:ReturnType<typeof usePublicSelection>
  const data=model()
  mount(()=>h('div'));app!.unmount()
  const host=document.createElement('div');document.body.append(host)
  app=createApp({setup(){selected=usePublicSelection(data);return ()=>h('div')}});app.mount(host)
  selected.togglePage(true)
  mocks.fetch.mockResolvedValue({schemaVersion:1,module:'publications',locale:'zh',revision:data.revision,totalPublic:20,uids:['p'],citationStyle:'gbt',items:[{...summary(),citation:{...citation(),status:'missing',text:'',highlights:[]}}],unavailableUids:[]})
  await selected.prepare();expect(selected.phase.value).toBe('review');expect(selected.missingCitations.value).toEqual(['p'])
  mocks.state.get('public-citation-style:v1').value='apa'
  expect(selected.phase.value).toBe('idle');expect(selected.items.value).toEqual([]);expect([...selected.ids.value]).toEqual(['p'])
 })
})
const pageRequest=()=>({locale:'zh' as const,style:'apa' as const,revision:'a'.repeat(64),totalPublic:36,items:Array.from({length:36},(_,i)=>({uid:`p${i}`,displayNumber:36-i}))})
const response=(uids:string[],overrides:any={})=>({schemaVersion:1,module:'publications',locale:'zh',citationStyle:'apa',revision:'a'.repeat(64),totalPublic:36,generatedAt:'',uids,unavailableUids:[],items:uids.map(uid=>({uid,displayNumber:36-Number(uid.slice(1)),citation:citation('apa')})),...overrides}) as any

describe('bounded page citation reads',()=>{
 it('reads 36 full-length citations with three batch requests and never truncates text',async()=>{
  const long='A'.repeat(31_000)
  const load=vi.fn(async(uids:string[])=>response(uids,{items:uids.map(uid=>({uid,displayNumber:36-Number(uid.slice(1)),citation:citation('apa',long)}))}))
  const result=await readPublicCitationPage(pageRequest(),load,new AbortController().signal)
  expect(load).toHaveBeenCalledTimes(3);expect(result.entries).toHaveLength(36)
  expect(result.entries.every(entry=>entry.citation.text===long)).toBe(true)
 })
 it.each(['revision','membership','style','number','hidden'])('rejects a mismatched %s without publishing a partial page',async kind=>{
  let calls=0
  const load=async(uids:string[])=>{calls++;return response(uids,calls===1?{}:kind==='revision'?{revision:'b'.repeat(64)}:kind==='membership'?{uids:['other']}:kind==='style'?{citationStyle:'ieee'}:kind==='number'?{items:uids.map(uid=>({uid,displayNumber:0,citation:citation('apa')}))}:{unavailableUids:['p12']})}
  await expect(readPublicCitationPage(pageRequest(),load,new AbortController().signal)).rejects.toThrow()
 })
 it('aborts between batches and ignores a response arriving after cancellation',async()=>{
  const controller=new AbortController()
  const load=vi.fn(async(uids:string[])=>{controller.abort();return response(uids)})
  await expect(readPublicCitationPage(pageRequest(),load,controller.signal)).rejects.toThrow()
  expect(load).toHaveBeenCalledTimes(1)
 })
})
