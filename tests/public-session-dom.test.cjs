const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const script=fs.readFileSync(require('node:path').join(__dirname,'../frontend/public/static/js/public-session.js'),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
function setup(t,count=1,seed=null,clock=false){
 const dom=new JSDOM('<span data-public-session data-lang="en"><a data-auth-open href="/auth/login">Sign in</a></span>'+Array.from({length:count},(_,i)=>`<div data-project-private="p${i}"><div class="project-main">Public</div></div>`).join(''),{url:'https://site.test/en/projects',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window,requests=[];
 if(clock){let at=Date.now(),serial=0;const timers=new Map();w.Date.now=()=>at;
 w.setTimeout=(fn,delay=0)=>{const id=++serial;timers.set(id,{fn,due:at+delay});return id;};w.clearTimeout=id=>timers.delete(id);
 w.advance=async ms=>{const end=at+ms;for(let n=0;n<1000;n++){const due=[...timers].filter(([,v])=>v.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!due)break;at=due[1].due;timers.delete(due[0]);due[1].fn();await tick();}at=end;await tick();};
 }
 w.fetch=(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));if(seed)w.sessionStorage.setItem('teacher:identity-display:v2',JSON.stringify(seed));if(seed)w.eval(fs.readFileSync(require('node:path').join(__dirname,'../frontend/shared/static/js/identity-cache.js'),'utf8'));w.eval(script);
 const reply=(i,data,ok=true)=>requests[i].resolve({ok,json:async()=>data});
 return {w,requests,reply};
}
const admin={authenticated:true,username:'admin',display_name:'<unsafe>',csrf:'TOKEN',can_enter_admin:true,can_view_private_projects:true};
test('identity, CSRF and private values are safe and cleared on pagehide',async t=>{
 const f=setup(t);f.reply(0,admin);await tick();assert.equal(f.requests.length,2);
 assert.equal(f.w.document.querySelector('.academic-username').textContent,'<unsafe>');assert.equal(f.w.document.querySelector('input').value,'TOKEN');assert.ok(f.w.document.querySelector('a[href="/admin"]'));
 f.reply(1,{projects:[{uid:'p0',principal:'<img src=x>',amount:'1',amount_display:'CNY 10,000',members:'Team'}]});await tick();
 assert.match(f.w.document.body.textContent,/CNY 10,000/);assert.equal(f.w.document.querySelector('img'),null);
 f.w.dispatchEvent(new f.w.Event('pagehide'));assert.equal(f.w.document.querySelector('input'),null);assert.equal(f.w.document.querySelector('[data-private-value]'),null);assert.ok(f.requests[1].options.signal.aborted);
});
test('anonymous does not request private fields',async t=>{const f=setup(t);f.reply(0,{authenticated:false});await tick();assert.equal(f.requests.length,1);});
test('stale identity cannot update DOM after cancellation',async t=>{const f=setup(t);f.w.document.dispatchEvent(new f.w.Event('teacher:navigation-start'));f.reply(0,admin);await tick();assert.equal(f.requests.length,1);assert.equal(f.w.document.querySelector('input'),null);});
test('20 per batch, serial and append loads a new card of the same UID',async t=>{
 const f=setup(t,21);f.reply(0,admin);await tick();assert.equal(new URL(f.requests[1].url,'https://site.test').searchParams.getAll('uid').length,20);assert.equal(f.requests.length,2);
 f.reply(1,{projects:[]});await new Promise(r=>setTimeout(r,220));assert.equal(f.requests.length,3);f.reply(2,{projects:[]});await tick();
 f.w.document.body.insertAdjacentHTML('beforeend','<div data-project-private="p0"><div class="project-main"></div></div>');f.w.document.dispatchEvent(new f.w.Event('public:appended'));assert.equal(f.requests.length,4);
});
test('BFCache and account change clear old identity and force network validation',async t=>{
 const f=setup(t);f.reply(0,admin);await tick();f.reply(1,{projects:[]});await tick();
 f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(f.w.document.querySelector('input'),null);assert.equal(f.requests[2].options.cache,'no-store');
 f.reply(2,{authenticated:false});await tick();assert.equal(f.w.document.querySelector('a[href="/admin"]'),null);
});
test('failed private API leaves public content readable',async t=>{const f=setup(t);f.reply(0,admin);await tick();f.reply(1,{},false);await tick();assert.match(f.w.document.body.textContent,/Public/);assert.equal(f.w.document.querySelector('[data-private-value]'),null);});
test('native logout captures token before cleanup',async t=>{const f=setup(t);f.reply(0,admin);await tick();const form=f.w.document.querySelector('form');assert.equal(new f.w.FormData(form).get('_csrf'),'TOKEN');form.dispatchEvent(new f.w.Event('formdata'));assert.equal(f.w.document.querySelector('input'),null);});
test('late private response and pending batches cannot survive query change',async t=>{
 const f=setup(t,21);f.reply(0,admin);await tick();f.w.document.dispatchEvent(new f.w.Event('public:querychange'));
 f.reply(1,{projects:[{uid:'p0',principal:'STALE'}]});await new Promise(r=>setTimeout(r,220));
 assert.equal(f.requests.length,2);assert.equal(f.w.document.querySelector('[data-private-value]'),null);assert.equal(f.w.document.querySelector('input'),null);
});
test('ordinary authenticated user has logout but no admin or project request',async t=>{
 const f=setup(t);f.reply(0,{...admin,can_enter_admin:false,can_view_private_projects:false});await tick();
 assert.equal(f.requests.length,1);assert.equal(f.w.document.querySelector('a[href="/admin"]'),null);assert.equal(f.w.document.querySelector('input').value,'TOKEN');
});
test('failed navigation restores identity reads',async t=>{const f=setup(t);f.w.document.dispatchEvent(new f.w.Event('teacher:navigation-start'));f.w.document.dispatchEvent(new f.w.Event('teacher:navigation-cancel'));assert.equal(f.requests.length,2);f.reply(0,admin);await tick();assert.equal(f.w.document.querySelector('input'),null);f.reply(1,admin);await tick();assert.equal(f.w.document.querySelector('input').value,'TOKEN');});
test('initial failure stays unknown, never claims signed out',async t=>{const f=setup(t);f.reply(0,{},false);await tick();assert.match(f.w.document.querySelector('[data-public-session]').textContent,/Checking identity/);assert.equal(f.w.document.querySelector('[data-public-session] a[href="/auth/login"]'),null);});
test('navigation retains last username and failed recheck does not log out',async t=>{const f=setup(t);f.reply(0,admin);await tick();f.reply(1,{projects:[]});await tick();f.w.document.dispatchEvent(new f.w.Event('teacher:navigation-start'));assert.equal(f.w.document.querySelector('.academic-username').textContent,'<unsafe>');assert.equal(f.w.document.querySelector('input'),null);f.w.document.dispatchEvent(new f.w.Event('teacher:navigation-cancel'));f.reply(2,{},false);await tick();assert.equal(f.w.document.querySelector('.academic-username').textContent,'<unsafe>');});
test('malformed identity is unknown, only explicit false means signed out',async t=>{const f=setup(t);f.reply(0,{});await tick();assert.match(f.w.document.querySelector('[data-public-session]').textContent,/Checking identity/);f.w.document.dispatchEvent(new f.w.Event('teacher:identity-change'));f.reply(1,{authenticated:false});await tick();assert.match(f.w.document.querySelector('[data-public-session]').textContent,/Sign in/);});

const cached=()=>({authenticated:true,username:'cached',display_name:'Cached User',can_enter_admin:true,checked_at:new Date().toISOString()});
const dated=()=>({...admin,checked_at:new Date().toISOString(),idle_expires_at:new Date(Date.now()+1800000).toISOString(),absolute_expires_at:new Date(Date.now()+43200000).toISOString(),display_ttl_seconds:300});
test('fresh display cache skips identity read and contains no CSRF',async t=>{
 const f=setup(t,0,cached());await tick();assert.equal(f.requests.length,0);
 assert.match(f.w.document.body.textContent,/Cached User/);assert.equal(f.w.document.querySelector('input'),null);
 f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await tick();assert.equal(f.requests.length,0);
});
test('stale display rechecks once, safe fields only persist',async t=>{
 const f=setup(t,0,{...cached(),checked_at:new Date(Date.now()-300001).toISOString()});
 f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));assert.equal(f.requests.length,1);
 f.reply(0,dated());await tick();
 const stored=JSON.parse(f.w.sessionStorage.getItem('teacher:identity-display:v2'));
 assert.equal(stored.username,'admin');for(const key of ['csrf','uid','permissions','can_view_private_projects'])assert.equal(key in stored,false);
 assert.deepEqual(Object.keys(stored).sort(),['authenticated','can_enter_admin','checked_at','display_name','username']);
});
test('failed stale check preserves display and does not confirm logout',async t=>{
 const f=setup(t,0,{...cached(),checked_at:new Date(Date.now()-300001).toISOString()});f.reply(0,{},false);await tick();
 assert.match(f.w.document.body.textContent,/Cached User/);assert.equal(f.w.document.querySelector('a[href="/auth/login"]'),null);
});
test('cross-tab invalidation clears old identity and ignores late response',async t=>{
 const f=setup(t,0,{...cached(),checked_at:new Date(Date.now()-300001).toISOString()});
 f.w.localStorage.setItem('teacher:identity-change','other');
 f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'teacher:identity-change',newValue:'other'}));
 assert.equal(f.requests.length,2);assert.ok(!f.w.document.body.textContent.includes('Cached User'));
 f.reply(0,dated());await tick();assert.equal(f.w.sessionStorage.getItem('teacher:identity-display:v2'),null);
 f.reply(1,{authenticated:false,checked_at:new Date().toISOString(),display_ttl_seconds:60});await tick();assert.match(f.w.document.body.textContent,/Sign in/);
});
test('malformed snapshot is not shown and still checks server',async t=>{
 const f=setup(t,0,{...cached(),checked_at:'invalid'});assert.equal(f.requests.length,1);assert.ok(!f.w.document.body.textContent.includes('Cached User'));
});
test('cached logout obtains fresh CSRF before native submit',async t=>{
 const f=setup(t,0,cached());let submitted=null;
 f.w.HTMLFormElement.prototype.requestSubmit=function(){submitted=new f.w.FormData(this);this.dispatchEvent(new f.w.Event('formdata',{bubbles:true}));};
 f.w.document.querySelector('button').click();assert.equal(f.requests.length,1);assert.equal(submitted,null);
 f.reply(0,dated());await tick();assert.equal(submitted.get('_csrf'),'TOKEN');
 assert.equal(f.w.sessionStorage.getItem('teacher:identity-display:v2'),null);
});
test('cached logout disables repeats and gives visible retry feedback',async t=>{
 const f=setup(t,0,cached());f.w.document.querySelector('button').click();
 f.w.document.querySelector('button').click();assert.equal(f.requests.length,1);
 assert.match(f.w.document.body.textContent,/Confirming sign out/);
 f.reply(0,{},false);await tick();
 assert.match(f.w.document.body.textContent,/Not signed out/);
 assert.equal(f.w.document.querySelector('button').disabled,false);
});

test('active heartbeat uses existing summary after five minutes',async t=>{
 const f=setup(t,0,cached(),true);await f.w.advance(240000);assert.equal(f.requests.length,0);
 f.w.document.dispatchEvent(new f.w.Event('pointerdown'));await f.w.advance(60001);
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/api/public/session-summary');
 f.reply(0,dated());await tick();f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));assert.equal(f.requests.length,1);
});
test('hidden page stops heartbeat and visible restore rechecks once',async t=>{
 const f=setup(t,0,cached(),true);let hidden=true;
 Object.defineProperty(f.w.document,'hidden',{get:()=>hidden});Object.defineProperty(f.w.document,'visibilityState',{get:()=>hidden?'hidden':'visible'});
 f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));await f.w.advance(300001);assert.equal(f.requests.length,0);
 hidden=false;f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(f.requests.length,1);
});
test('failure backs off across visibility changes and retries no sooner than 60s',async t=>{
 const f=setup(t,0,{...cached(),checked_at:new Date(Date.now()-300001).toISOString()},true);f.reply(0,{},false);await tick();
 f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));assert.equal(f.requests.length,1);
 await f.w.advance(59999);assert.equal(f.requests.length,1);await f.w.advance(1);assert.equal(f.requests.length,2);
});
test('anonymous has no recurring heartbeat',async t=>{
 const f=setup(t,0,{...cached(),authenticated:false},true);await f.w.advance(1200000);assert.equal(f.requests.length,0);
});
test('inactive page stops heartbeat and activity resumes one overdue confirmation',async t=>{
 const f=setup(t,0,cached(),true);await f.w.advance(300000);f.reply(0,dated());await tick();
 await f.w.advance(300000);f.reply(1,dated());await tick();await f.w.advance(300001);assert.equal(f.requests.length,2);
 f.w.document.dispatchEvent(new f.w.Event('keydown'));await f.w.advance(1001);assert.equal(f.requests.length,3);
});

test('twenty navigation restores within TTL issue zero identity reads',async t=>{
 const f=setup(t,0,cached(),true);
 for(let i=0;i<20;i++){
  f.w.dispatchEvent(new f.w.Event('pagehide'));
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));
 }
 assert.equal(f.requests.length,0);assert.match(f.w.document.body.textContent,/Cached User/);
});
test('long sleep has one confirmation and retains stale display until explicit false',async t=>{
 const f=setup(t,0,cached(),true);let hidden=true;
 Object.defineProperty(f.w.document,'hidden',{get:()=>hidden});
 f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));await f.w.advance(3600000);
 assert.equal(f.requests.length,0);hidden=false;
 f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));
 f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));
 assert.equal(f.requests.length,1);assert.ok(f.w.document.body.textContent.includes('Cached User'));
 f.reply(0,{authenticated:false,checked_at:new Date(f.w.Date.now()).toISOString(),display_ttl_seconds:60});await tick();
 assert.match(f.w.document.body.textContent,/Sign in/);
 await f.w.advance(300000);assert.equal(f.requests.length,1);
});
test('repeated failure waits 60 then 120 then 240 seconds',async t=>{
 const f=setup(t,0,{...cached(),checked_at:new Date(Date.now()-300001).toISOString()},true);
 for(const [i,delay] of [60000,120000,240000].entries()){
  f.reply(i,{},false);await tick();
  await f.w.advance(delay-1);assert.equal(f.requests.length,i+1);
  await f.w.advance(1);assert.equal(f.requests.length,i+2);
 }
});
test('two visible tabs invalidate independently without sharing credentials',async t=>{
 const a=setup(t,0,cached(),true),b=setup(t,0,cached(),true);
 a.w.document.dispatchEvent(new a.w.Event('teacher:identity-change'));
 const marker=a.w.localStorage.getItem('teacher:identity-change');
 b.w.localStorage.setItem('teacher:identity-change',marker);
 b.w.dispatchEvent(new b.w.StorageEvent('storage',{key:'teacher:identity-change',newValue:marker}));
 assert.equal(a.requests.length,1);assert.equal(b.requests.length,1);
 for(const f of [a,b]){
  f.reply(0,{authenticated:false,checked_at:new Date().toISOString(),display_ttl_seconds:60});await tick();
  assert.match(f.w.document.body.textContent,/Sign in/);
  assert.equal(f.w.document.querySelector('a[href="/admin"]'),null);
  assert.ok(!f.w.localStorage.getItem('teacher:identity-change').includes('TOKEN'));
 }
});
for(const status of [1101,1102,500,503])test(`summary failure ${status} keeps a stale successful identity without an error`,async t=>{
 const f=setup(t,0,{...cached(),checked_at:new Date(Date.now()-3600000).toISOString()});assert.equal(f.requests.length,1);f.reply(0,{error:status},false);await tick();
 assert.match(f.w.document.body.textContent,/Cached User/);assert.equal(f.w.document.querySelector('[data-public-session] a[href="/auth/login"]'),null);assert.equal(f.w.document.querySelector('.academic-identity-feedback'),null);assert.equal(f.w.document.querySelector('input'),null);
});
test('aborted summary preserves successful display and only explicit false signs out',async t=>{
 const f=setup(t,0,{...cached(),checked_at:new Date(Date.now()-3600000).toISOString()});
 f.w.document.dispatchEvent(new f.w.Event('teacher:navigation-start'));f.reply(0,{authenticated:false});await tick();assert.match(f.w.document.body.textContent,/Cached User/);
 f.w.document.dispatchEvent(new f.w.Event('teacher:navigation-cancel'));f.reply(1,{authenticated:false});await tick();assert.match(f.w.document.body.textContent,/Sign in/);
});
test('local list replacement resumes components without another summary in the display window',async t=>{
 const f=setup(t,0,cached(),true);for(let i=0;i<20;i++){f.w.document.dispatchEvent(new f.w.Event('public:querychange'));f.w.document.dispatchEvent(new f.w.Event('public:appended'));}
 assert.equal(f.requests.length,0);assert.match(f.w.document.body.textContent,/Cached User/);await f.w.advance(300000);assert.equal(f.requests.length,1);
});
test('snapshot fields never carry CSRF, expiry or private permissions and old version is discarded',t=>{
 const f=setup(t,0,cached());f.w.TeacherIdentityCache.save(dated());const value=JSON.parse(f.w.sessionStorage.getItem('teacher:identity-display:v2'));assert.deepEqual(Object.keys(value).sort(),['authenticated','can_enter_admin','checked_at','display_name','username']);
 f.w.sessionStorage.setItem('teacher:identity-display:v2',JSON.stringify({...value,csrf:'FORGED'}));assert.equal(f.w.TeacherIdentityCache.load(),null);
 f.w.sessionStorage.setItem('teacher:identity-display:v1',JSON.stringify(dated()));f.w.eval(fs.readFileSync(require('node:path').join(__dirname,'../frontend/shared/static/js/identity-cache.js'),'utf8'));assert.equal(f.w.sessionStorage.getItem('teacher:identity-display:v1'),null);
});
test('a cached admin link never grants private values when the live endpoint rejects it',async t=>{
 const f=setup(t,1,cached());assert.equal(f.requests.length,1);assert.match(f.requests[0].url,/admin-project-fields/);assert.equal(f.requests[0].options.cache,'no-store');f.reply(0,{},false);await tick();assert.equal(f.w.document.querySelector('[data-private-value]'),null);assert.match(f.w.document.body.textContent,/Cached User/);
});
test('summary timeout keeps stale identity and delays retries',async t=>{
 const f=setup(t,0,{...cached(),checked_at:new Date(Date.now()-3600000).toISOString()},true);await f.w.advance(15000);assert(f.requests[0].options.signal.aborted);f.requests[0].reject(new f.w.DOMException('Timed out','AbortError'));await tick();
 assert.match(f.w.document.body.textContent,/Cached User/);f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));assert.equal(f.requests.length,1);await f.w.advance(59999);assert.equal(f.requests.length,1);await f.w.advance(1);assert.equal(f.requests.length,2);
});
test('private component failure preserves live logout and does not re-probe on each list change',async t=>{
 const f=setup(t,1,{...cached(),checked_at:new Date(Date.now()-300001).toISOString()});f.reply(0,dated());await tick();f.reply(1,{},false);await tick();assert.equal(f.w.document.querySelector('input[name=_csrf]').value,'TOKEN');
 for(let i=0;i<10;i++){f.w.document.dispatchEvent(new f.w.Event('public:querychange'));f.w.document.dispatchEvent(new f.w.Event('public:appended'));}assert.equal(f.requests.length,2);assert.match(f.w.document.body.textContent,/unsafe/);
});
