const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const script=fs.readFileSync(path.join(__dirname,'../frontend/public/static/js/public-prefetch.js'),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
function setup(t,{concurrency=1,saveData=false,online=true,root=true}={}){
 const dom=new JSDOM((root?`<main data-public-nav-prefetch-concurrency="${concurrency}"></main>`:'')+'<a class="academic-brand" href="/zh">Brand</a><a data-navigation-id="p" href="/en/profiles"><span>People</span></a>',{url:'https://site.test/en',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window,requests=[],timers=new Map();let serial=0;const connection=new w.EventTarget();connection.saveData=saveData;
 Object.defineProperty(w.navigator,'connection',{value:connection});Object.defineProperty(w.navigator,'onLine',{value:online});
 w.setTimeout=(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;};w.clearTimeout=id=>timers.delete(id);
 w.fetch=(url,options)=>new Promise((resolve,reject)=>{requests.push({url,options,resolve,reject});options.signal.addEventListener('abort',()=>reject(Error('aborted')));});
 w.eval(script);
 const link=(href,attributes='data-navigation-id="dynamic"')=>{const a=w.document.createElement('a');a.href=href;for(const [key,value] of [...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]))a.setAttribute(key,value);w.document.body.append(a);return a;};
 function event(a,name,values={}){const e=new w.Event(name,{bubbles:true,cancelable:true});for(const [k,v] of Object.entries(values))Object.defineProperty(e,k,{value:v});a.dispatchEvent(e);return e;}
 function fire(ms){for(const [id,timer] of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}}
 function complete(i,{ok=true,type='text/html; charset=utf-8',policy='public, max-age=300',length='12',sizes=[12]}={}){
  let index=0,cancelled=false;const reader={read:async()=>index<sizes.length?{done:false,value:new Uint8Array(sizes[index++])}:{done:true},cancel:async()=>{cancelled=true;},releaseLock:()=>{}};
  requests[i].resolve({ok,headers:{get:key=>({'content-type':type,'cache-control':policy,'content-length':length}[key]??null)},body:{getReader:()=>reader}});return ()=>cancelled;
 }
 return {w,requests,event,fire,link,complete,connection,timers,people:w.document.querySelector('[data-navigation-id]')};
}
test('no eager fetch; hover requires 120ms and pointerout cancels',async t=>{
 const f=setup(t);assert.equal(f.requests.length,0);f.event(f.people,'pointerover');assert.equal(f.requests.length,0);
 f.event(f.people,'pointerout');f.fire(120);assert.equal(f.requests.length,0);
 f.event(f.people,'pointerover');f.fire(120);assert.equal(f.requests.length,1);
 f.complete(0);await tick();f.event(f.people,'focusin');assert.equal(f.requests.length,1);
});
test('focus and passive touch preserve normal click/navigation',async t=>{
 const f=setup(t);const e=f.event(f.people,'focusin');assert.equal(e.defaultPrevented,false);assert.equal(f.requests.length,1);
 f.complete(0);await tick();const e2=f.event(f.link('/en/news'),'touchstart');assert.equal(e2.defaultPrevented,false);assert.equal(f.requests.length,2);
 assert.equal(f.event(f.people,'click').defaultPrevented,false);
 assert.equal(f.requests[0].options.cache,undefined);assert.equal(f.requests[0].options.credentials,'same-origin');assert.equal(f.requests[0].options.priority,'low');assert.equal(f.requests[0].options.redirect,'error');
});
for(const opts of [{concurrency:0},{saveData:true},{online:false},{root:false}])test('disabled mode makes no requests '+JSON.stringify(opts),t=>{
 const f=setup(t,opts);f.event(f.people,'focusin');f.event(f.people,'touchstart');f.event(f.people,'pointerover');f.fire(120);assert.equal(f.requests.length,0);
});
for(const url of ['https://elsewhere.test/en/news','/admin','/auth/login','/sync/v1/read','/transfer','/api/public/cache-revision','/en/contact','/en/news/abc','/en#part','/en','/en/profiles?action=delete','javascript:alert(1)','/en/profiles?page=1&page=2'])test('unsafe target skipped: '+url,t=>{
 const f=setup(t);f.event(f.link(url),'focusin');assert.equal(f.requests.length,0);
});
test('download, new window and ordinary unmarked links skipped',t=>{
 const f=setup(t);f.event(f.link('/en/news','data-navigation-id="n" download="file"'),'focusin');f.event(f.link('/en/news','data-navigation-id="n" target="_blank"'),'focusin');f.event(f.link('/en/news',''),'focusin');assert.equal(f.requests.length,0);
});
for(const concurrency of [1,2])test('concurrency and finite queue '+concurrency,async t=>{
 const f=setup(t,{concurrency});for(let i=0;i<20;i++)f.event(f.link('/en/profiles?page='+(i+1)),'focusin');assert.equal(f.requests.length,concurrency);
 for(let i=0;i<concurrency+4;i++){f.complete(i);await tick();assert.ok(f.requests.length<=concurrency+4);}
 assert.equal(f.requests.length,concurrency+4);
});
test('same URL is deduplicated while queued, active and complete',async t=>{
 const f=setup(t);f.event(f.people,'focusin');const next=f.link('/en/news');for(let i=0;i<10;i++)f.event(next,'focusin');f.complete(0);await tick();assert.equal(f.requests.length,2);f.complete(1);await tick();f.event(next,'touchstart');assert.equal(f.requests.length,2);
});
test('fixed navigation and canonical filter URL are eligible',async t=>{
 const f=setup(t);f.event(f.link('/en/n/recent-papers'),'focusin');assert.equal(f.requests.length,1);f.complete(0);await tick();f.event(f.link('/en/projects?s=eyJxIjoiQWxwaGEifQ'),'focusin');assert.equal(f.requests.length,2);
});
test('pagehide cancels active, queued and hover work',async t=>{
 const f=setup(t);f.event(f.people,'focusin');f.event(f.link('/en/news'),'focusin');f.event(f.link('/zh/projects'),'pointerover');f.w.dispatchEvent(new f.w.Event('pagehide'));f.fire(120);await tick();assert.equal(f.requests[0].options.signal.aborted,true);assert.equal(f.requests.length,1);
 f.w.dispatchEvent(new f.w.Event('pageshow'));assert.equal(f.requests.length,1);
});
test('Save-Data change cancels and blocks subsequent intent',async t=>{
 const f=setup(t);f.event(f.people,'focusin');f.connection.saveData=true;f.connection.dispatchEvent(new f.w.Event('change'));await tick();f.event(f.link('/en/news'),'focusin');assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.signal.aborted,true);
});
test('10s timeout aborts without retrying or taking over navigation',async t=>{
 const f=setup(t);f.event(f.people,'focusin');f.fire(10000);await tick();f.event(f.people,'focusin');assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.signal.aborted,true);
});
for(const opts of [{ok:false},{type:'application/json'},{policy:'no-store'},{length:'262145'},{length:null,sizes:[200000,100000]}])test('errors/non-HTML/no-store/oversize rejected '+JSON.stringify(opts),async t=>{
 const f=setup(t);f.event(f.people,'focusin');f.complete(0,opts);await tick();assert.equal(f.requests[0].options.signal.aborted,true);f.event(f.people,'focusin');assert.equal(f.requests.length,1);
});
test('attempt budget stays bounded across successes',async t=>{
 const f=setup(t);for(let i=0;i<40;i++){f.event(f.link('/en/profiles?page='+(i+1)),'focusin');if(i<32){f.complete(i);await tick();}}
 assert.equal(f.requests.length,32);
});
