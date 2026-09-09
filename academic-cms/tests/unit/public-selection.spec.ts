// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, provide, reactive, ref, type App } from 'vue'
import { PUBLIC_SELECTION_CONTEXT, usePublicSelection } from '../../app/composables/usePublicSelection'
import { emptyPublicSelection } from '../../shared/contracts/public-selection'
import RecordRow from '../../app/components/public/content/RecordRow.vue'
import SelectionToolbar from '../../app/components/public/content/SelectionToolbar.vue'
const mocks = vi.hoisted(() => ({ state: null as any, citationStyle: null as any, numbers: null as any, fetch: vi.fn() }))
vi.mock('#app/composables/state', () => ({ useState: (key: string) => key === 'public-selection:v1' ? mocks.state : key === 'public-copy-numbers:v1' ? mocks.numbers : mocks.citationStyle }))
vi.mock('#build/fetch.mjs', () => ({ $fetch: mocks.fetch }))
let app: App | undefined
let selection: ReturnType<typeof usePublicSelection>
let host: HTMLDivElement
const page = (module = 'projects', uids = ['a','b']) => reactive({module,locale:'zh' as 'zh'|'en',revision:'a'.repeat(64),meta:{path:`/zh/${module}`},items:uids.map(uid=>({uid,name:uid}))})
function mount(model: ReturnType<typeof page>, ui = false) {
  host=document.createElement('div');document.body.append(host)
  app=createApp({setup() {
    selection=usePublicSelection(model);provide(PUBLIC_SELECTION_CONTEXT,selection)
    return ()=>ui ? h('div', [h(SelectionToolbar,{locale:model.locale,pageCount:model.items.length}),...model.items.map(item=>h(RecordRow,{uid:item.uid,title:item.name,displayNumber:1}))]) : h('div')
  }});app.mount(host)
}
const batch = (uids: string[], options: Record<string,any> = {}) => ({schemaVersion:1,module:'projects',locale:'zh',revision:'a'.repeat(64),totalPublic:200,generatedAt:'2026-09-06T00:00:00Z',uids,items:uids.map((uid,i)=>({uid,name:uid,displayNumber:Number(uid.replace('p',''))||i+1})),unavailableUids:[],...options})
beforeEach(()=>{mocks.state=ref(emptyPublicSelection());mocks.citationStyle=ref('gbt');mocks.numbers=ref(false);mocks.fetch.mockReset()})
afterEach(()=>{app?.unmount();app=undefined;document.body.replaceChildren();vi.unstubAllGlobals()})
describe('UID selection lifetime and boundaries',()=>{
  it('selects only the current page, keeps other pages through filters, and clears only this module',()=>{
    const model=page();mount(model)
    selection.togglePage(true);expect([...selection.ids.value]).toEqual(['a','b'])
    model.items=[{uid:'c',name:'C'},{uid:'d',name:'D'}];model.meta.path='/zh/projects?page=2'
    expect(selection.outsideCount.value).toBe(2);selection.toggle('c','C',true)
    expect(selection.someOnPage.value).toBe(true);selection.togglePage(false)
    expect([...selection.ids.value]).toEqual(['a','b'])
    model.module='courses';expect(selection.count.value).toBe(0);selection.toggle('course','Course',true)
    model.module='projects';expect(selection.count.value).toBe(2);selection.clear()
    model.module='courses';expect([...selection.ids.value]).toEqual(['course'])
  })
  it('shares publication and featured selections, preserves language/navigation, and never binds by number',async()=>{
    const model=page('publications',['old']);mount(model);selection.togglePage(true)
    model.module='publications/featured';model.items=[{uid:'replacement',name:'Replacement'}]
    expect(selection.count.value).toBe(1);expect(selection.onPageCount.value).toBe(0)
    model.locale='en';model.meta.path='/en/publications/featured';await nextTick()
    expect([...selection.ids.value]).toEqual(['old'])
    app!.unmount();app=undefined;mount(page('publications'))
    expect([...selection.ids.value]).toEqual(['old'])
  })
  it.each(['team','news'])('excludes %s selection UI and mutation',module=>{
    mount(page(module),true);selection.togglePage(true);selection.toggle('a','A',true)
    expect(selection.count.value).toBe(0);expect(host.querySelector('input[type=checkbox]')).toBeNull()
    expect(host.querySelector('.public-selection-toolbar')).toBeNull();expect(host.querySelector('.public-copy-record')).toBeNull()
  })
  it('enforces the selection cap atomically and keeps native checkbox state truthful',async()=>{
    const model=page('projects',['extra']);mount(model,true)
    for(let i=0;i<200;i++)selection.toggle(`p${i}`,`P${i}`,true)
    const checkbox=host.querySelector('.public-record-checkbox') as HTMLInputElement
    checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await nextTick()
    expect(selection.count.value).toBe(200);expect(checkbox.checked).toBe(false);expect(selection.notice.value).toContain('200')
    selection.togglePage(true);expect(selection.count.value).toBe(200)
    selection.toggle('p0','',false);selection.togglePage(true);expect(selection.ids.value.has('extra')).toBe(true)
  })
  it('keeps text interaction separate from explicit checkboxes and shows outside-page count',async()=>{
    const model=page();mount(model,true)
    host.querySelector('.public-compact-record__body')!.dispatchEvent(new MouseEvent('click',{bubbles:true}))
    expect(selection.count.value).toBe(0)
    const checkbox=host.querySelector('.public-record-checkbox') as HTMLInputElement
    checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await nextTick()
    expect(selection.count.value).toBe(1)
    model.items=[{uid:'c',name:'C'}];await nextTick()
    expect(host.querySelector('.public-selection-count')!.textContent).toContain('1 条不在当前页')
  })
})
describe('bounded fresh preparation',()=>{
  it('copies selections once in stable original order without viewing or confirming them',async()=>{
    mount(page(),true);selection.toggle('b','Old B',true);selection.toggle('a','Old A',true);await nextTick()
    mocks.fetch.mockResolvedValue(batch(['b','a'],{items:[{uid:'a',name:'Latest A',displayNumber:7},{uid:'b',name:'Latest B',displayNumber:9}]}))
    const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText}})
    expect(host.querySelector('dialog,textarea')).toBeNull();expect(host.textContent).not.toContain('查看已选')
    const copy=host.querySelector<HTMLButtonElement>('.public-copy-selected')!;copy.click()
    await vi.waitFor(()=>expect(host.textContent).toContain('已复制 2 条'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith('Latest B\n\nLatest A');expect(host.querySelector('dialog,textarea')).toBeNull()
    const numbers=host.querySelector<HTMLInputElement>('.public-copy-number-option input')!;numbers.checked=true;numbers.dispatchEvent(new Event('change',{bubbles:true}));await nextTick()
    copy.click();await vi.waitFor(()=>expect(writeText).toHaveBeenCalledTimes(2))
    expect(writeText).toHaveBeenLastCalledWith('9. Latest B\n\n7. Latest A')
  })
  it('reports unavailable items in the toolbar without copying a partial selection and permits deselection',async()=>{
    mount(page(),true);selection.togglePage(true);await nextTick()
    mocks.fetch.mockResolvedValue(batch(['a','b'],{items:[{uid:'a',name:'A',displayNumber:7}],unavailableUids:['b']}))
    const writeText=vi.fn();vi.stubGlobal('navigator',{clipboard:{writeText}})
    host.querySelector<HTMLButtonElement>('.public-copy-selected')!.click()
    await vi.waitFor(()=>expect(host.textContent).toContain('不再公开'))
    expect(writeText).not.toHaveBeenCalled();expect(host.querySelector('dialog,textarea')).toBeNull()
    ;[...host.querySelectorAll('button')].find(button=>button.textContent==='取消勾选不可用条目')!.click();await nextTick()
    expect([...selection.ids.value]).toEqual(['a']);expect(host.textContent).not.toContain('不再公开')
  })
  it.each(['clear','route','revision','locale','selection'])('cancels a pending bulk copy when %s changes',async change=>{
    const model=page();mount(model,true);selection.togglePage(true);await nextTick()
    let finish!:(value:any)=>void;mocks.fetch.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
    const writeText=vi.fn();vi.stubGlobal('navigator',{clipboard:{writeText}})
    host.querySelector<HTMLButtonElement>('.public-copy-selected')!.click()
    if(change==='clear')selection.clear()
    else if(change==='route')model.meta.path='/zh/projects?q=new'
    else if(change==='revision')model.revision='b'.repeat(64)
    else if(change==='locale')model.locale='en'
    else selection.toggle('a','',false)
    await nextTick();expect(mocks.fetch.mock.calls[0]![1].signal.aborted).toBe(true)
    finish(batch(['a','b']));await vi.waitFor(()=>expect(host.querySelector<HTMLButtonElement>('.public-copy-selected')!.getAttribute('aria-busy')).toBe('false'))
    expect(writeText).not.toHaveBeenCalled();expect(host.textContent).not.toContain('已复制')
  })
  it.each(['changed','failure'])('does not copy the first batch if a later batch has %s',async kind=>{
    mount(page(),true);for(let i=1;i<=13;i++)selection.toggle(`p${i}`,`P${i}`,true);await nextTick()
    mocks.fetch.mockImplementationOnce(async(_path,opts)=>batch(opts.query.uid)).mockImplementationOnce(async(_path,opts)=>{if(kind==='failure')throw new Error('offline');return batch(opts.query.uid,{revision:'b'.repeat(64)})})
    const writeText=vi.fn();vi.stubGlobal('navigator',{clipboard:{writeText}})
    host.querySelector<HTMLButtonElement>('.public-copy-selected')!.click()
    await vi.waitFor(()=>expect(host.querySelector('.public-selection-toolbar [role=alert]')).not.toBeNull())
    expect(mocks.fetch).toHaveBeenCalledTimes(2);expect(writeText).not.toHaveBeenCalled();expect(host.querySelector('textarea')).toBeNull()
  })
  it('rejects oversized assembled content instead of exposing partial data',async()=>{
    mount(page());selection.toggle('a','A',true)
    mocks.fetch.mockResolvedValue(batch(['a'],{items:[{uid:'a',name:'A',displayNumber:1,summary:'x'.repeat(4_000_001)}]}))
    await selection.prepare();expect(selection.phase.value).toBe('error');expect(selection.items.value).toEqual([])
    expect(selection.error.value).toContain('减少条目')
  })

  it('uses two batches for 13 selections, exposes progress and sorts by module order',async()=>{
    mount(page());for(let i=1;i<=13;i++)selection.toggle(`p${i}`,`P${i}`,true)
    let finish: (value:any)=>void = ()=>{}
    mocks.fetch.mockImplementationOnce(async(_path,opts)=>batch(opts.query.uid))
      .mockImplementationOnce((_path,opts)=>new Promise(resolve=>{finish=()=>resolve(batch(opts.query.uid))}))
    const ready=selection.prepare();await nextTick();await nextTick()
    expect(selection.processed.value).toBe(12);expect(selection.items.value).toEqual([]);expect(selection.phase.value).toBe('preparing')
    finish(null);await ready
    expect(mocks.fetch).toHaveBeenCalledTimes(2);expect(selection.phase.value).toBe('ready')
    expect(selection.items.value.map(item=>item.uid)).toEqual(Array.from({length:13},(_,i)=>`p${13-i}`))
    expect(mocks.fetch.mock.calls[0][0]).toBe('/api/v1/public/selection')
  })
  it('explicitly reports hidden/deleted selections and requires preparation after removing them',async()=>{
    mount(page());selection.togglePage(true)
    mocks.fetch.mockResolvedValue(batch(['a','b'],{items:[{uid:'a',name:'Current A',displayNumber:7}],unavailableUids:['b']}))
    await selection.prepare();expect(selection.phase.value).toBe('review');expect(selection.unavailable.value).toEqual(['b'])
    selection.removeUnavailable();expect([...selection.ids.value]).toEqual(['a']);expect(selection.phase.value).toBe('idle')
    mocks.fetch.mockResolvedValue(batch(['a']));await selection.prepare();expect(selection.phase.value).toBe('ready')
  })
  it.each(['changed','failure','membership'])('discards every partial batch on %s',async kind=>{
    mount(page());for(let i=1;i<=13;i++)selection.toggle(`p${i}`,`P${i}`,true)
    mocks.fetch.mockImplementationOnce(async(_path,opts)=>batch(opts.query.uid))
      .mockImplementationOnce(async(_path,opts)=>{if(kind==='failure')throw new Error('offline');return batch(opts.query.uid,kind==='changed'?{revision:'b'.repeat(64)}:{unavailableUids:['foreign']})})
    await selection.prepare();expect(selection.phase.value).toBe('error');expect(selection.items.value).toEqual([]);expect(selection.preparedRevision.value).toBeNull()
  })
  it.each(['locale','module','clear','close'])('ignores a delayed response after %s changes',async change=>{
    const model=page();mount(model);selection.togglePage(true)
    let finish:(value:any)=>void=()=>{}
    mocks.fetch.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
    const ready=selection.prepare()
    if(change==='locale')model.locale='en'
    else if(change==='module')model.module='courses'
    else if(change==='clear')selection.clear()
    else selection.invalidate()
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true)
    finish(batch(['a','b']));await ready
    expect(selection.phase.value).toBe('idle');expect(selection.items.value).toEqual([])
  })
})
