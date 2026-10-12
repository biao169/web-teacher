const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const cache=fs.readFileSync('frontend/shared/static/js/identity-cache.js','utf8'),session=fs.readFileSync('frontend/public/static/js/public-session.js','utf8');
const value={authenticated:true,username:'new-user',display_name:'New User',can_enter_admin:false,checked_at:new Date().toISOString()};
function page(t){const d=new JSDOM('<span data-public-session data-lang="en"><a data-auth-open href="/auth/login">Sign in</a></span>',{url:'https://test.local/en',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>d.window.close());return d.window;}
test('successful handoff clears retry and old identity, broadcasts only stamp, new page skips summary',t=>{
 const w=page(t);w.eval(cache);const c=w.TeacherIdentityCache;c.save({...value,username:'old'});c.failure();let changes=0;w.document.addEventListener('teacher:identity-change',()=>changes++);
 assert.equal(c.acceptLogin({...value,csrf:'NEVER',permissions:{admin:true}},false),true);assert.equal(changes,0);assert.equal(c.retryAt(),0);
 assert.deepEqual(Object.keys(c.load()).sort(),['authenticated','can_enter_admin','checked_at','display_name','username']);assert.equal(c.load().username,'new-user');assert(!JSON.stringify(w.localStorage).includes('new-user'));
 let requests=0;w.fetch=()=>{requests++;throw Error('Unexpected read')};w.eval(session);assert.equal(requests,0);assert.match(w.document.body.textContent,/New User/);assert.equal(w.document.querySelector('input'),null);
 for(let i=0;i<10;i++)w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(requests,0);
});
test('restoration cancels old summary, ignores late result and does not perform another summary',async t=>{
 const w=page(t);w.eval(cache);let reads=[];w.fetch=(url,options)=>new Promise(resolve=>reads.push({url,options,resolve}));w.eval(session);assert.equal(reads.length,1);
 assert(w.TeacherIdentityCache.acceptLogin(value));assert.equal(reads[0].options.signal.aborted,true);assert.equal(reads.length,1);
 reads[0].resolve({ok:true,json:async()=>({authenticated:false})});await new Promise(r=>setTimeout(r,0));assert.match(w.document.body.textContent,/New User/);assert.equal(w.TeacherIdentityCache.load().authenticated,true);
});
test('invalid success payload cannot replace existing identity',t=>{const w=page(t);w.eval(cache);const c=w.TeacherIdentityCache;c.save(value);for(const bad of [{authenticated:false},{...value,username:''},{...value,can_enter_admin:'yes'}])assert.equal(c.acceptLogin(bad),false);assert.equal(c.load().username,'new-user');});
