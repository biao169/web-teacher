const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const script=fs.readFileSync('frontend/public/static/js/public-recovery.js','utf8');
function fixture(t,{url='https://example.org/en/profiles?q=a#row',attempted='0',success=false,helper=false,reply=null}={}) {
 const dom=new JSDOM(success?'<script data-public-recovery-success></script>':`<section data-public-recovery data-attempted="${attempted}"><p data-recovery-message></p><span data-recovery-status></span><a data-recovery-reload href="?__recover=1">Reload</a></section>${helper?'<button data-recovery-helper></button>':''}`,{url});t.after(()=>dom.window.close());
 const w=dom.window;w.document.documentElement.lang='en';let n=0;const timers=new Map(),calls=[];
 const doll=w.document.querySelector('[data-recovery-helper]');const captures=new Set();
 if(doll){
  doll.getBoundingClientRect=()=>{const left=(doll.style.left?parseFloat(doll.style.left):700),top=(doll.style.top?parseFloat(doll.style.top):500);return {left,top,width:108,height:126,right:left+108,bottom:top+126};};
  doll.setPointerCapture=id=>captures.add(id);doll.hasPointerCapture=id=>captures.has(id);doll.releasePointerCapture=id=>captures.delete(id);
  w.document.querySelector('a').getBoundingClientRect=()=>({left:300,top:300,right:450,bottom:350,width:150,height:50});
 }
 const context=vm.createContext({document:w.document,window:w,location:{href:url,replace:()=>assert.fail('must not navigate')},AbortController,TextDecoder,fetch:(u,o)=>{calls.push(u);return reply?reply(u,o):new Promise(()=>{});},history:w.history,URL,setTimeout:(f,ms)=>{assert.ok([1000,15000].includes(ms));timers.set(++n,f);return n},clearTimeout:id=>timers.delete(id)});
 const execute=()=>vm.runInContext(script,context);execute();
 return {w,timers,calls,execute,doll,captures,fire:()=>{const list=[...timers.values()];timers.clear();list.forEach(f=>f());},click:()=>w.document.querySelector('a').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,button:0})),hide:()=>w.dispatchEvent(new w.PageTransitionEvent('pagehide',{persisted:true})),show:()=>w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}))};
}
test('one delayed navigation preserving query/hash; repeated setup cannot retry twice',t=>{const f=fixture(t);assert.equal(f.timers.size,1);f.execute();assert.equal(f.timers.size,1);f.fire();f.fire();f.click();assert.deepEqual(f.calls,['/en/profiles?q=a&__recover=1']);});
test('second failure never automatically retries; manual reload keeps marker',t=>{const f=fixture(t,{url:'https://example.org/zh?__recover=1',attempted:'1'});assert.equal(f.timers.size,0);f.fire();assert.equal(f.calls.length,0);f.click();assert.deepEqual(f.calls,['/zh?__recover=1']);});
test('URL guard independently prevents automatic retry',t=>{const f=fixture(t,{url:'https://example.org/en?__recover=1'});assert.equal(f.timers.size,0);});
test('manual click cancels timer and only sends once',t=>{const f=fixture(t);f.click();assert.equal(f.timers.size,1);f.fire();f.click();assert.equal(f.calls.length,1);});
test('pagehide cancels timer; BFCache restore stays manual',t=>{const f=fixture(t);f.hide();assert.equal(f.timers.size,0);f.fire();assert.equal(f.calls.length,0);f.show();assert.equal(f.timers.size,0);assert.match(f.w.document.querySelector('[data-recovery-status]').textContent,/stopped/);f.click();assert.equal(f.calls.length,1);});
test('successful recovery removes only marker and preserves history state',t=>{const f=fixture(t,{success:true,url:'https://example.org/en/projects?page=2&f.x=a&f.x=b&__recover=1#record'});assert.equal(f.w.location.href,'https://example.org/en/projects?page=2&f.x=a&f.x=b#record');assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);});
test('unmarked page cannot clean URL or schedule reload',t=>{const f=fixture(t,{success:true,url:'https://example.org/en?x=1'});assert.equal(f.w.location.search,'?x=1');assert.equal(f.calls.length,0);});

function pointer(f,target,type,x,y,id=1,pointerType='mouse') {
 const e=new f.w.MouseEvent(type,{clientX:x,clientY:y,button:0,cancelable:true,bubbles:true});
 Object.defineProperties(e,{pointerId:{value:id},pointerType:{value:pointerType},isPrimary:{value:true}});target.dispatchEvent(e);
}
for(const type of ['mouse','touch']) test(type+' drag clamps to viewport and releases listeners',t=>{
 const f=fixture(t,{helper:true,attempted:'1'});pointer(f,f.doll,'pointerdown',710,510,1,type);assert.equal(f.captures.size,1);
 pointer(f,f.w,'pointermove',2000,2000,1,type);
 assert.equal(parseFloat(f.doll.style.left),f.w.innerWidth-108);assert.equal(parseFloat(f.doll.style.top),f.w.innerHeight-126);
 pointer(f,f.w,'pointerup',2000,2000,1,type);assert.equal(f.captures.size,0);
 const pos=f.doll.style.cssText;pointer(f,f.w,'pointermove',30,30,1,type);assert.equal(f.doll.style.cssText,pos);assert.equal(f.calls.length,0);
});
test('drag cannot obstruct Reload',t=>{
 const f=fixture(t,{helper:true,attempted:'1'});pointer(f,f.doll,'pointerdown',710,510);pointer(f,f.w,'pointermove',330,330);
 const b=f.doll.getBoundingClientRect();assert.ok(b.right+8<=300||b.left>=458||b.bottom+8<=300||b.top>=358);
});
test('pointercancel and lost capture stop movement',t=>{
 const f=fixture(t,{helper:true,attempted:'1'});
 for(const event of ['pointercancel','lostpointercapture']){pointer(f,f.doll,'pointerdown',710,510);pointer(f,event==='pointercancel'?f.w:f.doll,event,710,510);const pos=f.doll.style.cssText;pointer(f,f.w,'pointermove',1,1);assert.equal(f.doll.style.cssText,pos);assert.equal(f.captures.size,0);}
});
test('pagehide disposes drag and BFCache allows fresh manual drag only',t=>{
 const f=fixture(t,{helper:true});pointer(f,f.doll,'pointerdown',710,510);f.hide();assert.equal(f.captures.size,0);const pos=f.doll.style.cssText;
 pointer(f,f.w,'pointermove',200,200);pointer(f,f.doll,'pointerdown',710,510);assert.equal(f.doll.style.cssText,pos);assert.equal(f.captures.size,0);
 f.show();assert.equal(f.timers.size,0);pointer(f,f.doll,'pointerdown',710,510);assert.equal(f.captures.size,1);
});
test('resize clamps helper to smaller viewport',t=>{const f=fixture(t,{helper:true,attempted:'1'});f.w.innerWidth=390;f.w.innerHeight=600;f.w.dispatchEvent(new f.w.Event('resize'));const b=f.doll.getBoundingClientRect();assert.ok(b.right<=390&&b.bottom<=600);});
test('keyboard arrows move helper without scheduling work',t=>{const f=fixture(t,{helper:true,attempted:'1'});const x=parseFloat(f.doll.style.left);f.doll.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowLeft',cancelable:true}));assert.equal(parseFloat(f.doll.style.left),x-12);assert.equal(f.timers.size,0);});

test('failed fetch stays on recovery page and permits only manual retry',async t=>{const f=fixture(t,{reply:async()=>new Response('',{status:500})});f.fire();await new Promise(setImmediate);assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);assert.ok(f.w.document.querySelector('[data-public-recovery]'));assert.match(f.w.document.querySelector('[data-recovery-status]').textContent,/stopped/);f.fire();assert.equal(f.calls.length,1);f.click();await new Promise(setImmediate);assert.equal(f.calls.length,2);});
test('successful fetch replaces HTML without a document navigation',async t=>{const f=fixture(t,{reply:async()=>new Response('<!doctype html><html><body><h1>Restored</h1></body></html>',{headers:{'content-type':'text/html'}})});f.fire();await new Promise(setImmediate);assert.equal(f.w.document.querySelector('h1').textContent,'Restored');assert.equal(f.w.location.href,'https://example.org/en/profiles?q=a#row');assert.equal(f.calls.length,1);});
test('pagehide aborts active fetch and prevents stale DOM replacement',async t=>{let done,signal;const f=fixture(t,{reply:(u,o)=>{signal=o.signal;return new Promise(r=>done=r)}});f.fire();f.hide();assert.ok(signal.aborted);done(new Response('<html><body>late</body></html>',{headers:{'content-type':'text/html'}}));await new Promise(setImmediate);assert.ok(f.w.document.querySelector('[data-public-recovery]'));});
