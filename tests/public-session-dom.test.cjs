const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const script=fs.readFileSync(require('node:path').join(__dirname,'../frontend/public/static/js/public-session.js'),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
function setup(t,count=1){
 const dom=new JSDOM('<span data-public-session data-lang="en"><a data-auth-open href="/auth/login">Sign in</a></span>'+Array.from({length:count},(_,i)=>`<div data-project-private="p${i}"><div class="project-main">Public</div></div>`).join(''),{url:'https://site.test/en/projects',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window,requests=[];w.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));w.eval(script);
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
