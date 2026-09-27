const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createHash}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../transfer/frontend/native/portal-core.js'),'utf8');
async function core(){const context=vm.createContext({URL,Error,TypeError,Number,JSON,Array,Uint8Array,AbortController,setTimeout,clearTimeout});const module=new vm.SourceTextModule(source,{context});await module.link(require('./helpers/transfer-modules.cjs').linker(context));await module.evaluate();return module.namespace}
const current={id:'a'.repeat(32),token:'b'.repeat(43)},hash=async blob=>createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
function file(text='hello'){return Object.assign(new Blob([text]),{name:'测试.txt'})}
test('receive accepts only same-origin exact capability path',async()=>{const c=await core();assert.equal(c.shareURL('/s/'+current.token,'https://transfer.test'),'https://transfer.test/s/'+current.token);for(const bad of ['https://evil.test/s/'+current.token,'javascript:alert(1)','https://u:p@transfer.test/s/'+current.token,'/s/'+current.token+'?x=1','/s/no','/s/'+current.token+'#x'])assert.throws(()=>c.shareURL(bad,'https://transfer.test'))});
test('new upload creates once and sends exact consecutive chunks',async()=>{const c=await core(),f=file('x'.repeat(1048580)),calls=[];let saved;const value=await c.upload({file:f,csrf:'csrf',maxBytes:2000000,hash,created:v=>saved=v,call:async(url,o)=>{calls.push([url,o]);if(url==='/api/tasks')return current;return {offset:Number(o.headers['X-Offset'])+o.body.size}}});assert.equal(value.complete,true);assert.equal(saved,current);assert.equal(calls.length,3);assert.equal(calls[2][1].headers['X-Offset'],'1048576');assert.equal(JSON.parse(calls[0][1].body)._csrf,'csrf')});
test('resume verifies prefix before any write; wrong content does not upload',async()=>{const c=await core(),f=file(),calls=[];await assert.rejects(c.upload({file:f,current,csrf:'x',maxBytes:100,hash,call:async(url,o)=>{calls.push([url,o]);return {name:f.name,size:f.size,state:'uploading',parts:[{size:2,sha256:'bad'}]}}}),/不同/);assert.equal(calls.length,1);assert.equal(calls[0][1],undefined)});
test('completed checkpoint recovers a lost final response without writing',async()=>{const c=await core(),f=file();let reads=0;const result=await c.upload({file:f,current,maxBytes:100,hash,call:async(url,o)=>{assert.equal(o,undefined);reads++;return {name:f.name,size:f.size,state:'ready',parts:[{size:f.size,sha256:await hash(f)}]}}});assert.equal(result.complete,true);assert.equal(reads,1)});
test('unknown write result is never automatically retried',async()=>{const c=await core();let calls=0;await assert.rejects(c.upload({file:file(),maxBytes:100,call:async()=>{calls++;throw Error('timeout')}}),/timeout/);assert.equal(calls,1)});
test('pause keeps current task and avoids the next chunk',async()=>{const c=await core();let stop=false,calls=0;const result=await c.upload({file:file(),maxBytes:100,call:async()=>{calls++;return current},created:()=>stop=true,stopped:()=>stop});assert.equal(result.complete,false);assert.equal(result.current,current);assert.equal(calls,1)});
test('invalid or over-limit file does not reserve a task',async()=>{const c=await core();for(const f of [file(''),file('oversize'),Object.assign(file(),{name:'../bad'})])await assert.rejects(c.upload({file:f,maxBytes:3,call:()=>{throw Error('unexpected call')}}),/文件/)});
test('expired checkpoint and malformed offset stop safely',async()=>{const c=await core();await assert.rejects(c.upload({file:file(),current,maxBytes:100,call:async()=>({expired:true,state:'ready'})}),/结束/);await assert.rejects(c.upload({file:file(),maxBytes:100,call:async url=>url==='/api/tasks'?current:{offset:999}}),/位置异常/)});
test('switching panels retains file input and progress nodes; anonymous view does not request APIs',async()=>{
 const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');const template=fs.readFileSync(path.join(__dirname,'../transfer/frontend/native/portal.html'),'utf8').replace(/\{%[\s\S]*?%\}/g,'').replace(/\{\{[\s\S]*?\}\}/g,'');const dom=new JSDOM(template,{url:'https://transfer.test'}),d=dom.window.document;let calls=0;
 const context=vm.createContext({document:d,window:dom.window,sessionStorage:dom.window.sessionStorage,location:dom.window.location,navigator:dom.window.navigator,confirm:()=>true,URL,Error,TypeError,Number,JSON,Array,Uint8Array,AbortController,setTimeout,clearTimeout,fetch:()=>{calls++;throw Error('unexpected request')}});
 const coreModule=new vm.SourceTextModule(source,{context}),controller=new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../transfer/frontend/native/portal.js'),'utf8'),{context});await controller.link(require('./helpers/transfer-modules.cjs').linker(context));await controller.evaluate();
 const input=d.querySelector('#file'),progress=d.querySelector('#progress');progress.value=42;d.querySelector('[data-view=receive]').click();assert.equal(d.querySelector('[data-area=send]').hidden,true);d.querySelector('[data-view=all]').click();assert.equal(d.querySelector('#file'),input);assert.equal(d.querySelector('#progress'),progress);assert.equal(progress.value,42);assert.equal(calls,0);dom.window.close();
});
test('integrated transfer prefixes requests and rejects legacy or external share paths',async()=>{
 const calls=[],context=vm.createContext({document:{querySelector:()=>({content:'/transfer'})},URL,Error,TypeError,AbortController,setTimeout,clearTimeout,fetch:async(url)=>{calls.push(url);return {ok:true,json:async()=>({ok:true})}}});
 const m=new vm.SourceTextModule(source,{context});await m.link(require('./helpers/transfer-modules.cjs').linker(context));await m.evaluate();const c=m.namespace;
 assert.equal(c.shareURL('/transfer/s/'+'a'.repeat(43),'https://teacher.test'),'https://teacher.test/transfer/s/'+'a'.repeat(43));
 for(const value of ['/s/'+'a'.repeat(43),'/transfer-other/s/'+'a'.repeat(43),'https://other.test/transfer/s/'+'a'.repeat(43)])assert.throws(()=>c.shareURL(value,'https://teacher.test'));
 await c.request('/api/tasks');assert.deepEqual(calls,['/transfer/api/tasks']);
});
test('paged resume checks all pages before any upload',async()=>{
 const c=await core(),f=file('abcd');let reads=0,writes=0;
 const result=await c.upload({file:f,current,maxBytes:10,hash,call:async(url,o)=>{
  assert.equal(o,undefined);reads++;return {name:f.name,size:f.size,state:'ready',paged:true,confirmed:4,version:12,parts:[{offset:reads===1?0:2,size:2,sha256:await hash(f.slice(reads===1?0:2,reads===1?2:4))}],next_offset:reads===1?2:null};
 }});assert.equal(result.complete,true);assert.equal(reads,2);assert.equal(writes,0);
});
test('changed recovery snapshot and repeated cursor refuse writes',async()=>{
 const c=await core(),f=file('abcd');let reads=0;
 await assert.rejects(c.upload({file:f,current,maxBytes:10,hash,call:async(url,o)=>{assert.equal(o,undefined);reads++;return {name:f.name,size:f.size,state:'uploading',paged:true,confirmed:4,version:reads,parts:[{offset:0,size:2,sha256:await hash(f.slice(0,2))}],next_offset:2}}}),/变化/);
});
