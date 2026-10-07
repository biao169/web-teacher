const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../transfer/frontend/native/receive-core.js'),'utf8');
async function core(){const context=vm.createContext({Error,Promise,setTimeout}),m=new vm.SourceTextModule(source,{context});await m.link(require('./helpers/transfer-modules.cjs').linker(context));await m.evaluate();return m.namespace}
const session=()=>({id:'test',size:4,offset:0});
test('slow sink and ACK independently fence the next read',async()=>{
 const {receive}=await core(),s=session(),events=[];let writeDone,ackDone;
 const writeGate=new Promise(r=>writeDone=r),ackGate=new Promise(r=>ackDone=r);
 const done=receive({session:s,sink:{write:async v=>{events.push('write '+v.position);await writeGate}},read:async offset=>{events.push('read '+offset);return {offset,data:new Uint8Array(2),sha256:'ok'}},hash:async()=> 'ok',call:async(a,v)=>{events.push('ack '+v.offset);await ackGate;return {offset:v.end}}});
 await new Promise(r=>setImmediate(r));assert.deepEqual(events,['read 0','write 0']);writeDone();await new Promise(r=>setImmediate(r));assert.deepEqual(events,['read 0','write 0','ack 0']);ackDone();assert.equal(await done,true);assert.equal(s.offset,4);
});
test('lost ACK response resumes ACK without writing the block twice',async()=>{
 const {receive}=await core(),s=session();let writes=0,reads=0,fail=true;
 const args={session:s,sink:{write:async()=>writes++},read:async offset=>{reads++;return {offset,data:new Uint8Array(4),sha256:'ok'}},hash:async()=> 'ok',call:async(a,v)=>{if(fail)throw Error('lost ACK');return {offset:v.end}}};
 await assert.rejects(receive(args),/lost ACK/);assert.equal(s.offset,0);assert.ok(s.pending);fail=false;assert.equal(await receive(args),true);assert.equal(writes,1);assert.equal(reads,1);
});
test('corruption and oversized block never write or acknowledge',async()=>{
 const {receive}=await core();for(const size of [2,1048577])await assert.rejects(receive({session:{...session(),size:2000000},sink:{write:()=>{throw Error('unexpected write')}},read:async()=>({offset:0,data:new Uint8Array(size),sha256:'wrong'}),hash:async()=> 'ok',call:()=>{throw Error('unexpected ACK')}}),/校验失败/);
});
test('pause stops before another read and does not claim final disk save',async()=>{
 const {receive}=await core();let pause=false,reads=0,closed=0;const s=session();
 const done=await receive({session:s,sink:{write:async()=>{},close:()=>closed++},read:async offset=>{reads++;return {offset,data:new Uint8Array(2),sha256:'ok'}},hash:async()=> 'ok',call:async(a,v)=>{pause=true;return {offset:v.end}},stopped:()=>pause});
 assert.equal(done,false);assert.equal(reads,1);assert.equal(closed,0);assert.equal(s.offset,2);
});
test('unsupported browser keeps native download without starting a receive session',async()=>{
 const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
 let html=fs.readFileSync(path.join(__dirname,'../transfer/frontend/native/portal.html'),'utf8').replace(/\{%[\s\S]*?%\}/g,'').replace(/\{\{[\s\S]*?\}\}/g,'');
 html=html.replace('name="transfer-base" content=""','name="transfer-base" content="/transfer"');
 const dom=new JSDOM(html,{url:'https://teacher.test/transfer/'}),context=vm.createContext({document:dom.window.document,window:dom.window,location:dom.window.location,URL,Error,TypeError,Number,JSON,Array,Uint8Array,AbortController,setTimeout,clearTimeout,fetch:()=>{throw Error('unexpected request')}});
 const modules=new Map();function module(name){if(!modules.has(name))modules.set(name,new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../transfer/frontend/native/',name),'utf8'),{context,identifier:name}));return modules.get(name)}
 const controller=module('portal-receive.js');await controller.link(spec=>module(spec.split('?')[0].replace('./','')));await controller.evaluate();
 assert.equal(dom.window.document.querySelector('[data-stream-receive]').hidden,true);assert.equal(dom.window.document.querySelector('#stream-unavailable').hidden,false);assert.equal(dom.window.document.querySelector('#receive').hidden,false);dom.window.close();
});
