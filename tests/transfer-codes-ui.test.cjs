const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom'),{load}=require('./helpers/transfer-modules.cjs');
async function setup(fetch){
 const dom=new JSDOM('<html lang="en"><head><meta name="transfer-base" content="/transfer"></head><body><main data-portal data-csrf="csrf"><button data-mode="lan"></button><button data-mode="relay"></button><button data-mode="cache"></button><button data-view="receive"></button><form id="transfer-code-form"><input><button>Receive</button></form><p id="transfer-code-status"></p><div id="output"></div></main></body></html>',{url:'https://teacher.test/transfer/'});
 const timers=new Set(),ctx=vm.createContext({document:dom.window.document,window:dom.window,location:dom.window.location,navigator:dom.window.navigator,URL,Error,TypeError,AbortController,Uint8Array,crypto:webcrypto,btoa:global.btoa,fetch,setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);timers.add(id);return id},clearTimeout:id=>{clearTimeout(id);timers.delete(id)}});
 const m=await load(ctx,'portal-codes.js');return {dom,d:dom.window.document,ctx,c:m.namespace,close:()=>{for(const id of timers)clearTimeout(id);dom.window.close()}};
}
const response=value=>({ok:true,json:async()=>value});
test('six-character code chooses mode and retains receive key after uncertain response',async()=>{
 let calls=[],count=0,accepted;
 const s=await setup(async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});if(++count===1)throw new TypeError('lost response');return response({mode:'relay',session:{code:'a'.repeat(32),name:'data.bin',role:'receive'}})});
 try{let selected=0;s.d.querySelector('[data-mode=relay]').onclick=()=>selected++;s.c.registerCodeReceiver('relay',{busy:()=>false,accept:async(r,key)=>accepted={r,key}});
 await assert.rejects(s.c.receiveCode(' ab1234 '));await s.c.receiveCode('AB1234');assert.equal(calls.length,2);assert.equal(calls[0].body.key,calls[1].body.key);assert.equal(accepted.key,calls[0].body.key);assert.equal(calls[0].url,'/transfer/api/codes/resolve');assert.equal(selected,1);
 assert.throws(()=>s.c.normalizeCode('AB１２３４'));assert.equal(s.c.normalizeCode('ab1234'),'AB1234');
 }finally{s.close()}
});
test('active receiver and malformed code prevent network requests',async()=>{
 let requests=0;const s=await setup(async()=>{requests++;return response({})});try{s.c.registerCodeReceiver('lan',{busy:()=>true});await assert.rejects(s.c.receiveCode('AB1234'),/Finish or cancel/);await assert.rejects(s.c.receiveCode('bad'),/two letters/);assert.equal(requests,0)}finally{s.close()}
});
test('code card retries without recreating upload, copy fallback selects text, language retains code',async()=>{
 let attempts=0;const s=await setup(async()=>{if(++attempts===1)return {ok:false,json:async()=>({error:'传输码操作过于频繁，请稍后重试'})};return response({code:'AB1234',expires_at:Date.now()+60000})});
 try{const host=s.d.querySelector('#output'),card=s.c.codeCard(host);await card.show({mode:'offline',target:'a'.repeat(32)});assert.match(host.textContent,/Could not get a code/);assert(host.querySelector('button').disabled);
 host.querySelectorAll('button')[1].click();await new Promise(r=>setTimeout(r,10));const input=host.querySelector('input');assert.equal(input.value,'AB1234');host.querySelector('button').click();await new Promise(r=>setTimeout(r,10));assert.equal(input.selectionStart,0);assert.equal(input.selectionEnd,6);
 const i=(await load(s.ctx,'transfer-i18n.js')).namespace;await i.setLanguage('zh',{refreshHeader:false});assert.match(host.textContent,/请手动复制/);assert.equal(input.value,'AB1234');card.clear();assert(host.firstElementChild.hidden);assert.equal(input.value,'');assert.equal(attempts,2);
 }finally{s.close()}
});
test('cleared sender card ignores delayed code result',async()=>{
 let finish;const s=await setup(()=>new Promise(r=>finish=r));try{const host=s.d.querySelector('#output'),card=s.c.codeCard(host),pending=card.show({mode:'lan',target:'a'.repeat(32),key:'k'.repeat(43)});card.clear();finish(response({code:'AB1234',expires_at:Date.now()+60000}));await pending;assert.equal(host.querySelector('input').value,'');assert(host.firstElementChild.hidden)}finally{s.close()}
});
test('derived offline capability remains same-origin and strictly validated',async()=>{
 const s=await setup();try{const c=(await load(s.ctx,'portal-core.js')).namespace,token='tc.'+'a'.repeat(32)+'.'+'b'.repeat(64);assert.equal(c.shareURL('/transfer/s/'+token,'https://teacher.test'),'https://teacher.test/transfer/s/'+token);for(const value of ['https://other.test/transfer/s/'+token,'/transfer/s/'+token+'?x=1','/transfer/s/'+token+'x'])assert.throws(()=>c.shareURL(value,'https://teacher.test'))}finally{s.close()}
});

for(const mode of ['lan','relay'])test(mode+' controller displays short code and adopts resolved internal session',async()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../transfer/frontend/native/portal.html'),'utf8').replace(/\{%[\s\S]*?%\}/g,'').replace(/\{\{[\s\S]*?\}\}/g,''),{url:'https://teacher.test/transfer/'}),d=dom.window.document;
 d.documentElement.lang='en';d.querySelector('meta[name=transfer-base]').content='/transfer';d.querySelector('[data-portal]').dataset.csrf='csrf';
 Object.defineProperty(dom.window,'isSecureContext',{value:true});dom.window.showSaveFilePicker=()=>{};dom.window.RTCPeerConnection=function(){};Object.defineProperty(dom.window,'crypto',{value:webcrypto});
 const timers=new Set(),calls=[],room='a'.repeat(32);let role='send';
 const ctx=vm.createContext({window:dom.window,document:d,location:dom.window.location,navigator:dom.window.navigator,URL,Error,TypeError,AbortController,Uint8Array,crypto:webcrypto,btoa:global.btoa,CustomEvent:dom.window.CustomEvent,setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);timers.add(id);return id},clearTimeout:id=>{clearTimeout(id);timers.delete(id)},fetch:async(url,options)=>{calls.push({url,data:JSON.parse(options.body)});if(url.endsWith('/create'))return response({code:room,name:'test.bin',size:3,role:'send',kind:'file'});if(url.endsWith('/issue'))return response({code:'AB1234',expires_at:Date.now()+60000});if(url.endsWith('/resolve'))return response({mode,session:{code:room,name:'test.bin',size:3,role:'receive',kind:'file'}});return response({cancelled:true})}});
 try{await load(ctx,'portal-'+mode+'.js');const codes=(await load(ctx,'portal-codes.js')).namespace;
 Object.defineProperty(d.querySelector('#'+mode+'-file'),'files',{value:[{name:'test.bin',size:3}]});d.querySelector('#'+mode+'-send').click();await new Promise(r=>setTimeout(r,15));assert.equal(d.querySelector('#'+mode+'-pair').value,'AB1234');assert.equal(calls.filter(x=>x.url.endsWith('/issue')).length,1);
 d.querySelector('#'+mode+'-cancel').click();await new Promise(r=>setTimeout(r,15));assert(d.querySelector('#'+mode+'-pair-box').hidden);
 await codes.receiveCode('ab1234');assert.equal(calls.filter(x=>x.url.endsWith('/resolve')).length,1);assert.equal(calls.filter(x=>x.url.endsWith('/join')).length,0);assert.equal(d.querySelector('#'+mode+'-cancel').disabled,false);assert.equal(d.querySelector('#'+mode+'-join').disabled,true);
 }finally{for(const id of timers)clearTimeout(id);dom.window.close()}
});
