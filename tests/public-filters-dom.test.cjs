const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const read=name=>fs.readFileSync(path.join(__dirname,'../frontend/public/static/js',name),'utf8');
const card=id=>`<article data-person-card data-record-id="${id}"><input type="checkbox" data-person-select hidden><p data-copy-field>Record ${id}</p></article>`;
const facet=(field='venue')=>`<div data-person-facet data-field="${field}" data-facet-label="期刊/会议" data-page="1"><select name="f.${field}" id="filter-${field}" aria-label="期刊/会议"><option value="">期刊/会议 · 全部</option><option value="Alpha">Alpha</option><option value="Beta">Beta Long international journal title with spaces and 中文</option></select><button type="button" data-facet-trigger hidden aria-haspopup="listbox" aria-expanded="false"><span class="facet-width-sample">期刊/会议 · 全部</span><span class="facet-current"></span><svg></svg></button><button type="button" data-facet-more hidden>More</button></div>`;
function fixture(t,{script=true,stream=false,selectValue='',html=null}={}){
 const form=`<form data-person-form><input name="q" value=""><div data-person-selection hidden><input type="checkbox" data-person-all><span data-person-count></span><button type="button" data-person-copy>Copy</button><button type="button" data-person-clear>Clear</button></div>${facet()}${facet('publication_type')}<label><input type="radio" name="direction" value="asc" checked>Asc</label><label><input type="radio" name="direction" value="desc">Desc</label><span data-person-total>20 条结果</span><button type="submit">Apply</button><a href="/zh/publications" data-person-reset>Reset</a><span data-person-tool-status></span></form>`;
 const section=`<section data-public-stream data-public-content data-table="publications" data-home="0" data-lang="zh" data-page="1" data-total="20" data-next="/zh/publications?sort=sort_order&direction=asc&page=2"><div data-stream-items>${card('a')}</div><div data-stream-controls><a data-load-more>More</a><a data-page-fallback>Page</a><span data-stream-status></span></div></section>`;
 const dom=new JSDOM(html??form+section,{url:'https://site.example/zh/publications?page=3&q=old',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window,$=s=>w.document.querySelector(s),requests=[];
 Object.defineProperty(w,'innerWidth',{value:320});Object.defineProperty(w,'innerHeight',{value:200});
 w.HTMLElement.prototype.getBoundingClientRect=function(){return this.matches('.facet-panel')?{width:Math.min(500,parseFloat(this.style.maxWidth)||500),height:Math.min(280,parseFloat(this.style.maxHeight)||280)}:{left:260,right:310,top:80,bottom:120,width:50,height:40};};
 w.fetch=(url,opts)=>new Promise((resolve,reject)=>requests.push({url,opts,resolve,reject}));
 w.navigator.clipboard={writeText:async()=>{}};
 if(selectValue)$('select').value=selectValue;
 if(script){if(stream)w.eval(read('public-stream.js'));w.eval(read('public-people.js'));w.eval(read('public-filters.js'));}
 const key=(el,key,extra={})=>el.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra}));
 const tick=()=>new Promise(r=>setTimeout(r,0));
 const respond=(index,result)=>requests[index].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>result});
 return {w,$,requests,key,tick,respond};
}
test('no JavaScript retains a native named select and a working GET form',t=>{
 const f=fixture(t,{script:false});assert.equal(f.$('select').hidden,false);assert.equal(f.$('[data-facet-trigger]').hidden,true);f.$('select').value='Beta';assert.equal(new f.w.FormData(f.$('form')).get('f.venue'),'Beta');
});
test('keyboard changes only native filter value; collapsed sizing label stays unchanged',t=>{
 const f=fixture(t),trigger=f.$('[data-facet-trigger]'),sample=trigger.querySelector('.facet-width-sample').textContent;
 assert.equal(f.$('select').hidden,true);trigger.focus();f.key(trigger,'ArrowDown');const list=f.$('[role=listbox]');assert.equal(f.w.document.activeElement,list);assert.equal(trigger.getAttribute('aria-expanded'),'true');
 f.key(list,'End');f.key(list,'Enter');assert.equal(f.$('select').value,'Beta');assert.equal(new f.w.FormData(f.$('form')).get('f.venue'),'Beta');assert.equal(f.w.document.activeElement,trigger);assert.equal(trigger.getAttribute('aria-expanded'),'false');
 assert.equal(trigger.querySelector('.facet-width-sample').textContent,sample);assert.match(trigger.title,/Long international journal/);assert.match(trigger.getAttribute('aria-label'),/中文/);assert.equal(f.requests.length,0);
});
test('Esc restores focus without committing the active option; only one panel opens',t=>{
 const f=fixture(t,{selectValue:'Alpha'}),trigger=f.$('[data-facet-trigger]');trigger.click();let list=f.$('[role=listbox]');f.key(list,'End');f.key(list,'Escape');assert.equal(f.$('select').value,'Alpha');assert.equal(f.w.document.activeElement,trigger);
 trigger.click();f.$('[data-field=publication_type] [data-facet-trigger]').click();assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(f.w.document.querySelectorAll('[data-facet-trigger][aria-expanded=true]').length,1);
});
test('candidate panel fits a narrow short viewport and keeps complete option text',t=>{
 const f=fixture(t);f.$('[data-facet-trigger]').click();const panel=f.$('.facet-panel'),rect=panel.getBoundingClientRect();assert.ok(parseFloat(panel.style.left)>=12);assert.ok(parseFloat(panel.style.left)+rect.width<=308);assert.ok(parseFloat(panel.style.top)+rect.height<=188);assert.match(panel.textContent,/Long international journal title with spaces and 中文/);
});
test('paged candidates preserve value/selection, append safely, announce and keep focus after last page',async t=>{
 const f=fixture(t,{selectValue:'Alpha'});f.$('[data-person-all]').click();f.$('[data-facet-trigger]').click();const more=f.$('[data-facet-more]');more.focus();more.click();more.click();assert.equal(f.requests.length,1);assert.match(f.requests[0].url,/facets\/venue\?page=2/);
 f.respond(0,{table:'publications',field:'venue',page:2,values:['Alpha','Gamma','<script>literal</script>'],has_more:false});await f.tick();assert.equal(f.$('select').value,'Alpha');assert.equal(f.$('select').options.length,5);assert.equal(f.$('.facet-panel script'),null);assert.equal(f.$('[data-person-all]').checked,true);assert.equal(f.w.document.activeElement,f.$('[role=listbox]'));assert.match(f.$('.facet-status').textContent,/已更新/);
});
test('facet failure stays on same page and retries from popup without clearing current values',async t=>{
 const f=fixture(t,{selectValue:'Alpha'});f.$('[data-facet-trigger]').click();f.$('[data-facet-more]').click();f.requests[0].reject(new Error('offline'));await f.tick();assert.equal(f.$('[data-person-facet]').dataset.page,'1');assert.equal(f.$('select').value,'Alpha');assert.match(f.$('.facet-status').textContent,/失败/);f.$('[data-facet-more]').click();assert.equal(f.requests[1].url,f.requests[0].url);f.requests[1].reject(new Error('offline'));await f.tick();
});
test('changing sort submits from first batch and cancels late candidate/list responses',async t=>{
 const f=fixture(t,{stream:true});let submissions=0;f.$('form').addEventListener('submit',e=>{e.preventDefault();submissions++;});
 f.$('[data-person-all]').click();f.$('[data-load-more]').click();f.$('[data-facet-trigger]').click();f.$('[data-facet-more]').click();assert.equal(f.requests.length,2);
 f.$('input[value=desc]').click();assert.equal(submissions,1);assert.equal(f.$('[data-person-all]').checked,false);assert.ok(f.requests.every(r=>r.opts.signal.aborted));assert.equal(new f.w.FormData(f.$('form')).has('page'),false);assert.equal(new f.w.FormData(f.$('form')).get('direction'),'desc');
 f.respond(0,{table:'publications',lang:'zh',home:false,page:2,total:20,html:card('late'),next_url:''});f.respond(1,{table:'publications',field:'venue',page:2,values:['LATE_OPTION'],has_more:false});await f.tick();assert.equal(f.$('[data-record-id=late]'),null);assert.equal([...f.$('select').options].some(o=>o.value==='LATE_OPTION'),false);
});
test('append preserves checked cards, new cards unchecked, and current result total updates',async t=>{
 const f=fixture(t,{stream:true});f.$('[data-person-all]').click();f.$('[data-load-more]').click();f.respond(0,{table:'publications',lang:'zh',home:false,page:2,total:19,html:card('b'),next_url:''});await f.tick();assert.equal(f.$('[data-record-id=a] input').checked,true);assert.equal(f.$('[data-record-id=b] input').checked,false);assert.equal(f.$('[data-person-all]').indeterminate,true);assert.equal(f.$('[data-person-total]').textContent,'19 条结果');assert.match(f.$('[data-person-count]').textContent,/已选 1 \/ 已加载 2/);
});
test('Tab visits load-more inside panel; leaving or outside focus closes without choosing',t=>{
 const f=fixture(t);f.$('[data-facet-trigger]').click();const list=f.$('[role=listbox]');f.key(list,'Tab');assert.equal(f.w.document.activeElement,f.$('[data-facet-more]'));f.key(f.$('[data-facet-more]'),'Tab',{shiftKey:true});assert.equal(f.w.document.activeElement,list);f.$('[name=q]').focus();assert.equal(f.$('[data-facet-trigger]').getAttribute('aria-expanded'),'false');assert.equal(f.$('select').value,'');
});

test('reading-size change repositions an open facet without losing its selection',t=>{
 const f=fixture(t,{selectValue:'Alpha'}),trigger=f.$('[data-facet-trigger]');trigger.click();const panel=f.$('.facet-panel'),before=panel.style.top;
 trigger.getBoundingClientRect=()=>({left:10,right:100,top:30,bottom:60,width:90,height:30});
 f.w.document.dispatchEvent(new f.w.Event('public-reading-change'));
 assert.notEqual(panel.style.top,before);assert.equal(panel.hidden,false);assert.equal(f.$('select').value,'Alpha');assert.equal(f.requests.length,0);
});
