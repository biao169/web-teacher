/* Intersection/HTTP lifecycle tests against real loader code in a simulated DOM. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const script=fs.readFileSync(path.join(__dirname,'../frontend/public/static/js/public-stream.js'),'utf8');
const article=id=>`<article data-record-id="${id}"><h3>Row ${id}</h3></article>`;
function html(table='publications',home=false){return `<section data-public-stream data-table="${table}" data-lang="zh" data-home="${home?'1':'0'}" data-page="1" data-total="25" data-next="/zh/${table}?${home?'home=1&':''}q=term&f.year=2025&sort=year&direction=desc&page=2"><div data-stream-items>${article('first')}</div><div data-stream-controls><a data-load-more href="/zh/${table}?page=2">More</a><a data-page-fallback href="/zh/${table}?page=2">Page</a><span data-stream-status tabindex="-1"></span></div></section>`;}
function fixture(t,{multi=false,observer=true,saveData=false,markup=null}={}){
 const dom=new JSDOM(markup??(html()+ (multi?html('projects',true):'')),{url:'https://site.example/zh/publications?q=term',runScripts:'outside-only',pretendToBeVisual:true});
 t.after(()=>dom.window.close());const w=dom.window,requests=[],observers=[];
 class IO{constructor(cb,options){this.cb=cb;this.options=options;this.target=null;observers.push(this);}observe(el){this.target=el;}unobserve(){this.target=null;}disconnect(){this.target=null;}fire(){if(this.target)this.cb([{isIntersecting:true,target:this.target}]);}}
 if(observer)w.IntersectionObserver=IO;
 Object.defineProperty(w.navigator,'connection',{value:{saveData}});
 w.fetch=(url,opts)=>new Promise((resolve,reject)=>{const request={url,opts,resolve,reject};requests.push(request);opts.signal.addEventListener('abort',()=>reject(new Error('Aborted')));});
 w.eval(script);
 const $=s=>w.document.querySelector(s),tick=()=>new Promise(r=>setTimeout(r,0));
 function resolve(index,{ids=['second'],next='/zh/publications?page=3',page=2,table='publications',home=false,lang='zh',ok=true,type='application/json',total=25}={}){requests[index].resolve({ok,headers:{get:()=>type},json:async()=>({html:ids.map(article).join(''),page,table,home,lang,next_url:next,total})});}
 return {w,$,requests,observers,tick,resolve};
}
test('intersection starts one request and carries query filters without changing current URL',async t=>{const f=fixture(t);f.observers[0].fire();f.observers[0].fire();f.$('[data-load-more]').click();assert.equal(f.requests.length,1);assert.match(f.requests[0].url,/f.year=2025/);assert.match(f.requests[0].url,/direction=desc/);assert.equal(f.requests[0].opts.headers['X-Public-Fragment'],'1');f.resolve(0);await f.tick();assert.equal(f.w.document.querySelectorAll('[data-record-id]').length,2);assert.equal(f.$('[data-load-more]').pathname,'/zh/publications');assert.equal(f.w.location.search,'?q=term');assert.equal(f.$('[data-public-stream]').hasAttribute('aria-busy'),false);});
test('appends once per UID, including duplicate rows in the same response',async t=>{const f=fixture(t);f.$('[data-load-more]').click();f.resolve(0,{ids:['first','second','second']});await f.tick();assert.deepEqual([...f.w.document.querySelectorAll('[data-record-id]')].map(e=>e.dataset.recordId),['first','second']);});
test('last page removes continuation and disconnects automatic requests',async t=>{const f=fixture(t);f.$('[data-load-more]').click();f.resolve(0,{next:''});await f.tick();assert.ok(f.$('[data-load-more]').hidden);assert.ok(f.$('[data-page-fallback]').hidden);assert.equal(f.$('[data-public-stream]').dataset.next,'');assert.equal(f.w.document.activeElement,f.$('[data-stream-status]'));f.observers[0].fire();assert.equal(f.requests.length,1);});
test('failure preserves existing rows and next URL; no automatic retry loop, manual retry works',async t=>{const f=fixture(t);f.observers[0].fire();f.requests[0].reject(new Error('offline'));await f.tick();assert.match(f.$('[data-stream-status]').textContent,/重试/);assert.equal(f.w.document.querySelectorAll('[data-record-id]').length,1);f.observers[0].fire();assert.equal(f.requests.length,1);f.$('[data-load-more]').click();assert.equal(f.requests.length,2);f.resolve(1);await f.tick();assert.equal(f.w.document.querySelectorAll('[data-record-id]').length,2);});
test('homepage streams share a one-request queue and keep independent record sets',async t=>{const f=fixture(t,{multi:true});f.observers[0].fire();f.observers[1].fire();assert.equal(f.requests.length,1);f.resolve(0);await f.tick();assert.equal(f.requests.length,2);assert.match(f.requests[1].url,/home=1/);f.resolve(1,{table:'projects',home:true,ids:['project2'],next:''});await f.tick();assert.equal(f.w.document.querySelectorAll('[data-public-stream]')[1].querySelectorAll('[data-record-id]').length,2);});
test('wrong language/table/page response cannot contaminate current list',async t=>{const f=fixture(t);f.$('[data-load-more]').click();f.resolve(0,{lang:'en',ids:['wrong']});await f.tick();assert.equal(f.$('[data-record-id=wrong]'),null);assert.equal(f.$('[data-public-stream]').dataset.page,'1');assert.match(f.$('[data-stream-status]').textContent,/刷新/);});
test('cross-origin or backwards continuation is rejected before append',async t=>{const f=fixture(t);f.$('[data-load-more]').click();f.resolve(0,{next:'https://evil.example/zh/publications?page=3'});await f.tick();assert.equal(f.$('[data-record-id=second]'),null);assert.equal(f.requests.length,1);f.$('[data-load-more]').click();f.resolve(1,{next:'/zh/publications?page=2'});await f.tick();assert.equal(f.$('[data-record-id=second]'),null);});
test('HTML error pages do not replace cards',async t=>{const f=fixture(t);f.$('[data-load-more]').click();f.resolve(0,{type:'text/html'});await f.tick();assert.equal(f.w.document.querySelectorAll('[data-record-id]').length,1);assert.match(f.$('[data-stream-status]').textContent,/未完成/);});
test('pagehide aborts active request and clears queued requests',async t=>{const f=fixture(t,{multi:true});f.observers[0].fire();f.observers[1].fire();f.w.dispatchEvent(new f.w.Event('pagehide'));await f.tick();assert.ok(f.requests[0].opts.signal.aborted);assert.equal(f.requests.length,1);assert.equal(f.$('[data-public-stream]').hasAttribute('aria-busy'),false);f.w.dispatchEvent(new f.w.Event('pageshow'));f.observers[0].fire();assert.equal(f.requests.length,2);});
test('no IntersectionObserver keeps manual load and ordinary link functional',async t=>{const f=fixture(t,{observer:false});assert.equal(f.requests.length,0);assert.ok(f.$('[data-page-fallback]').href.includes('page=2'));f.$('[data-load-more]').click();assert.equal(f.requests.length,1);f.resolve(0);await f.tick();});
test('data-saving preference disables auto preload, keeps explicit click',async t=>{const f=fixture(t,{saveData:true});assert.equal(f.observers.length,0);f.$('[data-load-more]').click();f.resolve(0);await f.tick();assert.equal(f.requests.length,1);});
test('public append event supports later selection/copy components without replacing existing nodes',async t=>{const f=fixture(t);const first=f.$('[data-record-id=first]');let event;f.$('[data-public-stream]').addEventListener('public:appended',e=>event=e.detail);f.$('[data-load-more]').click();f.resolve(0);await f.tick();assert.equal(f.$('[data-record-id=first]'),first);assert.equal(event.count,1);assert.equal(event.page,2);});

test('five nested homepage modules share one request queue and retain independent rows',async t=>{
 const tables=['publications','news','projects','patents','students'];
 const markup='<div class="home-module-grid-primary">'+tables.slice(0,2).map(table=>html(table,true)).join('')+'</div><div class="home-module-grid-secondary">'+tables.slice(2).map(table=>html(table,true)).join('')+'</div>';
 const f=fixture(t,{markup});f.observers.forEach(observer=>observer.fire());assert.equal(f.requests.length,1);
 for(let i=0;i<tables.length;i++){
   assert.equal(new URL(f.requests[i].url,f.w.location).pathname,'/zh/'+tables[i]);
   f.resolve(i,{table:tables[i],home:true,next:'',ids:[tables[i]+'-next']});await f.tick();
   const root=f.w.document.querySelector('[data-table="'+tables[i]+'"]');
   assert.equal(root.querySelectorAll('[data-record-id]').length,2);assert.equal(root.dataset.page,'2');
   assert.equal(f.requests.length,Math.min(i+2,5));
 }
});

test('fixed-entry stream retains slug and revision on every continuation',async t=>{
 const markup=html().replace('data-public-stream','data-public-stream data-endpoint="/zh/n/papers" data-nav="papers" data-nav-stamp="stamp1"').replace(/\/zh\/publications\?/g,'/zh/n/papers?nv=stamp1&');
 const f=fixture(t,{markup});f.$('[data-load-more]').click();assert.match(f.requests[0].url,/^\/zh\/n\/papers\?nv=stamp1&/);
 f.requests[0].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({table:'publications',lang:'zh',home:false,page:2,total:25,nav:'papers',nav_stamp:'stamp1',html:article('scoped2'),next_url:'/zh/n/papers?nv=stamp1&page=3'})});await f.tick();
 assert(f.$('[data-record-id=scoped2]'));assert.match(f.$('[data-load-more]').href,/\/n\/papers\?nv=stamp1&page=3/);
});
test('fixed-entry stream rejects unscoped continuation and changed revision before append',async t=>{
 for(const [stamp,next] of [['stamp1','/zh/publications?page=3'],['changed','/zh/n/papers?nv=stamp1&page=3']]){
  const markup=html().replace('data-public-stream','data-public-stream data-endpoint="/zh/n/papers" data-nav="papers" data-nav-stamp="stamp1"').replace(/\/zh\/publications\?/g,'/zh/n/papers?nv=stamp1&');
  const f=fixture(t,{markup});f.$('[data-load-more]').click();f.requests[0].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({table:'publications',lang:'zh',home:false,page:2,total:25,nav:'papers',nav_stamp:stamp,html:article('wrong'),next_url:next})});await f.tick();assert.equal(f.$('[data-record-id=wrong]'),null);
 }
});
test('query identity and next-query mismatch cannot contaminate current stream',async t=>{
 for(const [id,next] of [['different',''],['same','/zh/publications?q=other&page=3']]){
  const f=fixture(t,{markup:html().replace('data-public-stream','data-public-stream data-query-id="same"')});f.$('[data-load-more]').click();
  f.requests[0].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({table:'publications',lang:'zh',home:false,page:2,total:25,query_id:id,html:article('wrong'),next_url:next})});await f.tick();assert.equal(f.$('[data-record-id=wrong]'),null);
 }
});
