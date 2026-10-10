const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require(process.env.JSDOM_PATH||'jsdom');
const script=fs.readFileSync(path.join(__dirname,'../frontend/public/static/js/public-stream.js'),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
async function setup(t,identity='signed-in'){
 const navigation=[];const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>{if(error.message.includes('navigation'))navigation.push(error);else throw error;});
 const dom=new JSDOM(`<main data-public-identity="${identity}" data-public-revision="rev"></main>`,{url:'https://example.test/en',runScripts:'outside-only',virtualConsole});t.after(()=>dom.window.close());
 const w=dom.window,requests=[];w.fetch=(url,options)=>new Promise((resolve,reject)=>{requests.push({url,options,resolve,reject});options.signal.addEventListener('abort',()=>reject(Error('aborted')));});
 w.eval(script);await tick();
 function show(){w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));}
 function hide(){w.dispatchEvent(new w.PageTransitionEvent('pagehide',{persisted:true}));}
 return {w,requests,show,hide,navigation};
}
test('authenticated BFCache body stays hidden until current identity is confirmed',async t=>{
 const f=await setup(t);f.hide();assert.equal(f.w.document.body.style.visibility,'hidden');f.show();
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.cache,'no-store');
 assert.equal(f.w.document.body.style.visibility,'hidden');
 f.requests[0].resolve({ok:true,json:async()=>({identity:'signed-in',revision:'rev'})});await tick();
 assert.equal(f.w.document.body.style.visibility,'');
});
for(const scenario of ['logout','permissions','revision','http-error','malformed','network'])test(`restore ${scenario} never reveals stale authenticated HTML`,async t=>{
 const f=await setup(t);f.hide();f.show();const request=f.requests[0];
 if(scenario==='network')request.reject(Error('offline'));
 else request.resolve({ok:scenario!=='http-error',json:async()=>scenario==='malformed'?{}:{identity:scenario==='logout'?'':scenario==='permissions'?'new-grants':'signed-in',revision:scenario==='revision'?'new-rev':'rev'}});
 await tick();assert.equal(f.w.document.body.style.visibility,'hidden');
 assert.equal(f.navigation.length,1); // jsdom reports the attempted full reload.
});
test('anonymous offline restore can keep public content',async t=>{
 const f=await setup(t,'');f.hide();f.show();f.requests[0].reject(Error('offline'));await tick();assert.equal(f.w.document.body.style.visibility,'');
});
test('pagehide cancels in-flight restore and late reply cannot reveal it',async t=>{
 const f=await setup(t);f.hide();f.show();f.hide();assert.equal(f.requests[0].options.signal.aborted,true);await tick();assert.equal(f.w.document.body.style.visibility,'hidden');
});

test('restore timeout aborts verification and reloads authenticated page',async t=>{
 const f=await setup(t);let timeout;
 const original=f.w.setTimeout;f.w.setTimeout=(callback,delay)=>delay===5000?(timeout=callback,1):original(callback,delay);
 f.hide();f.show();timeout();await tick();
 assert.equal(f.requests[0].options.signal.aborted,true);assert.equal(f.navigation.length,1);assert.equal(f.w.document.body.style.visibility,'hidden');
});
