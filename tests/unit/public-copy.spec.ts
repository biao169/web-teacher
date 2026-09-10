// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { serializePublicCopy } from '../../shared/utils/public-copy'
import { writePublicClipboard } from '../../app/utils/public-clipboard'
import CopyRecordButton from '../../app/components/public/content/CopyRecordButton.vue'
import PublicationDetail from '../../app/components/public/content/PublicationDetail.vue'
const mocks=vi.hoisted(()=>({state:new Map<string,any>(),fetch:vi.fn()}))
vi.mock('#app/composables/state',()=>({useState:(key:string,init:()=>unknown)=>{if(!mocks.state.has(key))mocks.state.set(key,ref(init()));return mocks.state.get(key)}}))
vi.mock('#build/fetch.mjs',()=>({$fetch:mocks.fetch}))
let app:App|undefined
beforeEach(()=>{mocks.state.clear();mocks.fetch.mockReset()})
afterEach(()=>{app?.unmount();app=undefined;document.body.replaceChildren();vi.unstubAllGlobals()})
function mount(render:()=>any){const host=document.createElement('div');document.body.append(host);app=createApp({setup:()=>render});app.mount(host);return host}
const flush=async()=>{for(let i=0;i<10;i++)await nextTick()}
const item=(values:any={})=>({uid:'x',name:'Name',displayNumber:9,...values}) as any
const citation={style:'apa',label:'APA',status:'saved',text:'[8]  Zhang, M.* <script>A & B</script>.\nExact punctuation.',highlights:['Zhang, M.']}
const batch=(values:any={})=>({schemaVersion:1,module:'projects',locale:'zh',revision:'a'.repeat(64),totalPublic:20,uids:['x'],unavailableUids:[],items:[item({name:'Fresh project',source:'Fund'})],...values})
describe('common copy serialization',()=>{
 it('preserves complete citation segments, original markers, exact plain text and escaped HTML',()=>{
  const payload=serializePublicCopy('publications','en',[item({citation})],false,'apa')
  expect(payload.text).toBe(citation.text);expect(payload.html).toContain('<span style="text-decoration: underline; font-weight: 600;">Zhang, M.</span>*')
  expect(payload.html).toContain('&lt;script&gt;A &amp; B&lt;/script&gt;');expect(payload.html).not.toContain('<script>')
  expect(serializePublicCopy('publications','en',[item({citation})],true,'apa').text).toBe('9. '+citation.text)
 })
 it.each(['projects','patents','students','research','courses'] as const)('exports only %s public fields and full descriptions',module=>{
  const full='Full paragraph. '.repeat(300),payload=serializePublicCopy(module,'zh',[item({source:'Source',fundName:'Fund',summary:full,biography:full,description:full,studentId:'PRIVATE-ID',email:'PRIVATE-EMAIL',password:'PRIVATE-PASSWORD',amount:'PRIVATE-AMOUNT',href:'PRIVATE-HREF'})])
  expect(payload.text).not.toContain('PRIVATE-')
  if(['students','research','courses'].includes(module))expect(payload.text).toContain(full)
  else expect(payload.text).not.toContain(full)
  if(module==='projects'){expect(payload.text).toBe('Source；Fund；Name');expect(payload.html).toContain('<strong>Source</strong>；<strong>Fund</strong>')}
 })
 it('keeps original numbers in descending module order, separates paragraphs and omits empty labels',()=>{
  const payload=serializePublicCopy('projects','en',[item({uid:'low',displayNumber:3,name:'Low',principal:'',startDate:'2024',endDate:'2026'}),item({displayNumber:19,name:'High',projectNumber:'P-1'})],true)
  expect(payload.text).toBe('19. High; Project number: P-1\n\n3. Low; Period: 2024—2026')
  expect(payload.html.match(/<p>/g)).toHaveLength(2)
 })
 it.each(['missing','wrong-format'])('refuses %s citations rather than copying a substitute',kind=>{
  expect(()=>serializePublicCopy('publications','zh',[item({citation:{...citation,...(kind==='missing'?{status:'missing',text:'',highlights:[]}:{style:'gbt'})}})],false,'apa')).toThrow('citation')
 })
})
describe('clipboard outcomes',()=>{
 it('starts the promised rich write before fresh data resolves, preserving both exact representations',async()=>{
  let finish!:(value:any)=>void, data:any
  vi.stubGlobal('ClipboardItem',class {constructor(value:any){data=value}})
  const write=vi.fn(async()=>{await Promise.all(Object.values(data))}),writeText=vi.fn()
  vi.stubGlobal('navigator',{clipboard:{write,writeText}})
  const pending=writePublicClipboard(new Promise(resolve=>{finish=resolve}))
  expect(write).toHaveBeenCalledOnce();expect(data['text/plain']).toBeInstanceOf(Promise)
  finish({text:'Plain',html:'<p>Plain</p>'})
  expect(await pending).toBe('rich')
  expect(await (await data['text/plain']).text()).toBe('Plain');expect(await (await data['text/html']).text()).toBe('<p>Plain</p>')
  expect(writeText).not.toHaveBeenCalled()
 })
 it('falls back to exact plain text when HTML fails and rejects total clipboard denial',async()=>{
  vi.stubGlobal('ClipboardItem',class {})
  const write=vi.fn().mockRejectedValue(new Error('HTML denied')),writeText=vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator',{clipboard:{write,writeText}})
  expect(await writePublicClipboard({text:'Exact',html:'<p>Exact</p>'})).toBe('plain');expect(writeText).toHaveBeenCalledWith('Exact')
  writeText.mockRejectedValue(new Error('denied'));await expect(writePublicClipboard({text:'Exact',html:'<p>Exact</p>'})).rejects.toThrow('denied')
 })
 it('never writes a partial or stale fallback after data rejection or cancellation',async()=>{
  vi.stubGlobal('ClipboardItem',class {})
  const write=vi.fn().mockRejectedValue(new Error('denied')),writeText=vi.fn();vi.stubGlobal('navigator',{clipboard:{write,writeText}})
  await expect(writePublicClipboard(Promise.reject(new Error('changed')))).rejects.toThrow('changed')
  const controller=new AbortController();let finish!:(value:any)=>void
  const pending=writePublicClipboard(new Promise(resolve=>{finish=resolve}),controller.signal)
  controller.abort();finish({text:'Stale',html:'Stale'});await expect(pending).rejects.toThrow('aborted')
  expect(writeText).not.toHaveBeenCalled()
 })
})
describe('single-record direct copy',()=>{
 it('copies fresh public fields in one click, without a preview, dialog or selection mutation',async()=>{
  mocks.fetch.mockResolvedValue(batch());const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText}})
  const host=mount(()=>h(CopyRecordButton,{module:'projects',locale:'zh',uid:'x',label:'Stale name'}))
  expect(mocks.fetch).not.toHaveBeenCalled();expect(host.querySelector('dialog,textarea')).toBeNull()
  ;(host.querySelector('.public-copy-record') as HTMLButtonElement).click();await flush()
  expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/public/selection',expect.objectContaining({query:{module:'projects',locale:'zh',uid:['x']}}))
  expect(writeText).toHaveBeenCalledExactlyOnceWith('Fund；Fresh project');expect(host.textContent).toContain('已复制')
  expect(host.querySelector('dialog,textarea')).toBeNull();expect(mocks.state.has('public-selection:v1')).toBe(false)
 })
 it('does not await the request before invoking write and disables duplicate clicks until completion',async()=>{
  let finish!:(value:any)=>void,data:any
  mocks.fetch.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  vi.stubGlobal('ClipboardItem',class {constructor(value:any){data=value}})
  const write=vi.fn(async()=>{await Promise.all(Object.values(data))});vi.stubGlobal('navigator',{clipboard:{write}})
  const host=mount(()=>h(CopyRecordButton,{module:'projects',locale:'zh',uid:'x',label:'Project'}))
  const button=host.querySelector('button')!;button.click();button.click()
  expect(write).toHaveBeenCalledOnce();expect(mocks.fetch).toHaveBeenCalledOnce()
  await nextTick();expect(button.disabled).toBe(true);expect(host.textContent).not.toContain('已复制')
  finish(batch());await flush();expect(button.disabled).toBe(false);expect(host.textContent).toContain('已复制')
 })
 it('reports hidden records in place and revalidates them on retry',async()=>{
  mocks.fetch.mockResolvedValueOnce(batch({items:[],unavailableUids:['x']})).mockResolvedValueOnce(batch())
  const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText}})
  const host=mount(()=>h(CopyRecordButton,{module:'projects',locale:'zh',uid:'x',label:'Old'}))
  host.querySelector('button')!.click();await flush();expect(host.textContent).toContain('不再公开');expect(writeText).not.toHaveBeenCalled()
  expect(host.querySelector('dialog,textarea')).toBeNull()
  ;[...host.querySelectorAll('button')].find(b=>b.textContent==='重试复制')!.click();await flush()
  expect(mocks.fetch).toHaveBeenCalledTimes(2);expect(writeText).toHaveBeenCalledWith('Fund；Fresh project')
 })
 it('reveals manual text only after clipboard failure and preserves native partial copying',async()=>{
  mocks.fetch.mockResolvedValue(batch());const writeText=vi.fn().mockRejectedValue(new Error('denied'));vi.stubGlobal('navigator',{clipboard:{writeText}})
  const host=mount(()=>h(CopyRecordButton,{module:'projects',locale:'zh',uid:'x',label:'Project'}))
  host.querySelector('button')!.click();await flush()
  expect(host.textContent).toContain('未能写入剪贴板');expect(host.textContent).not.toContain('已复制');expect(host.querySelector('dialog')).toBeNull()
  const manual=host.querySelector('textarea')!;expect(manual.value).toBe('Fund；Fresh project');expect(manual.readOnly).toBe(true)
  manual.setSelectionRange(0,4);const event=new Event('copy',{bubbles:true,cancelable:true});manual.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false);expect(manual.selectionEnd-manual.selectionStart).toBe(4)
  ;[...host.querySelectorAll('button')].find(b=>b.textContent==='选中文本')!.click()
  expect(document.activeElement).toBe(manual);expect(manual.selectionEnd).toBe(manual.value.length)
  mocks.fetch.mockResolvedValue(batch({items:[],unavailableUids:['x']}))
  ;[...host.querySelectorAll('button')].find(b=>b.textContent==='重试复制')!.click();await flush()
  expect(host.querySelector('textarea')).toBeNull();expect(writeText).toHaveBeenCalledOnce()
 })
 it.each(['locale','uid','style','unmount'])('aborts late data after %s changes',async change=>{
  let finish!:(value:any)=>void;mocks.fetch.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  const writeText=vi.fn();vi.stubGlobal('navigator',{clipboard:{writeText}})
  const props=ref<any>({module:'publications',locale:'zh',uid:'x',label:'Paper'})
  const host=mount(()=>h(CopyRecordButton,props.value));host.querySelector('button')!.click()
  if(change==='unmount'){app!.unmount();app=undefined}
  else if(change==='style')mocks.state.get('public-citation-style:v1').value='apa'
  else props.value={...props.value,[change]:change==='locale'?'en':'y'}
  await nextTick();expect(mocks.fetch.mock.calls[0]![1].signal.aborted).toBe(true)
  finish(batch({module:'publications',citationStyle:'gbt',items:[item({citation:{...citation,style:'gbt'}})]}));await flush()
  expect(writeText).not.toHaveBeenCalled();expect(host.textContent).not.toContain('已复制')
 })
 it('supersedes an older copy across buttons and never writes the old plain-text fallback',async()=>{
  let finish!:(value:any)=>void
  mocks.fetch.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValueOnce(batch({uids:['y'],items:[item({uid:'y',name:'New'})]}))
  const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText}})
  const host=mount(()=>h('div',[h(CopyRecordButton,{module:'projects',locale:'zh',uid:'x',label:'Old'}),h(CopyRecordButton,{module:'projects',locale:'zh',uid:'y',label:'New'})]))
  const buttons=host.querySelectorAll('button');buttons[0]!.click();buttons[1]!.click();await flush()
  expect(mocks.fetch.mock.calls[0]![1].signal.aborted).toBe(true)
  finish(batch());await flush();expect(writeText).toHaveBeenCalledExactlyOnceWith('New')
 })
 it.each(['gbt','apa','elsevier','ieee'])('copies detail references using the current %s format in one click',async style=>{
  const current={...citation,style},model:any={locale:'zh',module:'publications',meta:{title:'Paper',breadcrumbs:[]},item:{uid:'x',title:'Paper',abstract:null,tags:[],indexTypes:[],keywords:[],citations:[current],pdf:{available:false,kind:'pdf',fallback:'none',alt:''}}}
  mocks.fetch.mockResolvedValue(batch({module:'publications',citationStyle:style,items:[item({citation:current})]}))
  const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText}})
  const host=mount(()=>h(PublicationDetail,{model}));mocks.state.get('public-citation-style:v1').value=style;await nextTick()
  ;(host.querySelector('.public-copy-record') as HTMLButtonElement).click();await flush()
  expect(mocks.fetch.mock.calls[0]![1].query.citationStyle).toBe(style);expect(writeText).toHaveBeenCalledWith(citation.text);expect(host.querySelector('dialog,textarea')).toBeNull()
 })
 it('does not substitute missing citation formats',async()=>{
  mocks.fetch.mockResolvedValue(batch({module:'publications',citationStyle:'gbt',items:[item({citation:{...citation,style:'gbt',status:'missing',text:'',highlights:[]}})]}))
  const writeText=vi.fn();vi.stubGlobal('navigator',{clipboard:{writeText}})
  const host=mount(()=>h(CopyRecordButton,{module:'publications',locale:'zh',uid:'x',label:'Paper'}));host.querySelector('button')!.click();await flush()
  expect(host.textContent).toContain('未维护当前引用格式');expect(writeText).not.toHaveBeenCalled();expect(host.querySelector('textarea')).toBeNull()
 })
})
