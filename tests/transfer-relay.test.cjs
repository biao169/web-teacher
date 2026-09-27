const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
async function mod(name,extra={}){const context=vm.createContext({Error,Promise,setTimeout,Uint8Array,Number,...extra}),m=new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../transfer/frontend/native',name),'utf8'),{context});await m.link(require('./helpers/transfer-modules.cjs').linker(context));await m.evaluate();return m.namespace}
test('relay sender waits for receiver ACK before reading next file block',async()=>{
 const {relaySend}=await mod('relay-core.js');let reads=0,puts=0,progress=0;const states=[{offset:0,pending:false},{offset:0,pending:true},{offset:1048576,pending:false},{offset:1048577,pending:false},{offset:1048577,saved:true}];
 const file={name:'x',size:1048577,slice:(a,b)=>{reads++;return {a,b}}};
 await relaySend({file,call:async()=>({name:'x',size:file.size,ready:true,wait_ms:0,...states.shift()}),put:async()=>puts++,progress:n=>progress=n,sleep:async()=>{assert.ok(reads<=2)}});
 assert.equal(reads,2);assert.equal(puts,2);assert.equal(progress,file.size);
});
test('uncertain upload is not replayed; resume consults receiver checkpoint',async()=>{
 const {relaySend}=await mod('relay-core.js');const file={name:'x',size:1,slice:()=>new Uint8Array([1])};let puts=0;
 await assert.rejects(relaySend({file,call:async()=>({name:'x',size:1,ready:true,offset:0}),put:async()=>{puts++;throw Error('lost reply')}}),/lost reply/);
 assert.equal(await relaySend({file,call:async()=>({name:'x',size:1,ready:true,offset:1,saved:true}),put:async()=>{throw Error('must not replay')}}),true);assert.equal(puts,1);
});
test('quota waiting and pause never read a file block',async()=>{
 const {relaySend}=await mod('relay-core.js');let stopped=false;const result=await relaySend({file:{name:'x',size:9,slice:()=>{throw Error('read ahead')}},call:async()=>({name:'x',size:9,offset:0,ready:false}),put:()=>{},sleep:async()=>stopped=true,stopped:()=>stopped});assert.equal(result,false);
});
test('binary reader rejects declared/actual overflow and truncated content',async()=>{
 const {readBlock}=await mod('chunk-client.js');for(const [declared,size] of [[1048577,1],[2,3],[4,3]]){
  let reads=0,cancelled=false;const response={ok:true,headers:{get:key=>key==='X-Chunk-Size'?String(declared):'0'},body:{cancel:async()=>cancelled=true,getReader:()=>({read:async()=>reads++?{done:true}:{value:new Uint8Array(size)},cancel:async()=>cancelled=true})}};
  await assert.rejects(readBlock(response),/大小异常|超过|未完整/);assert.ok(cancelled);
 }
});
test('unsupported receive UI keeps sending and cached receive available',async()=>{
 const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');let html=fs.readFileSync(path.join(__dirname,'../transfer/frontend/native/portal.html'),'utf8').replace(/\{%[\s\S]*?%\}/g,'').replace(/\{\{[\s\S]*?\}\}/g,'').replace('name="transfer-base" content=""','name="transfer-base" content="/transfer"');
 const dom=new JSDOM(html,{url:'https://teacher.test/transfer/'}),context=vm.createContext({document:dom.window.document,window:dom.window,Error,Promise,setTimeout,clearTimeout,ArrayBuffer,Uint8Array,Number,fetch:()=>{throw Error('unexpected')}}),modules=new Map();
 function module(name){if(!modules.has(name))modules.set(name,new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../transfer/frontend/native',name),'utf8'),{context,identifier:name}));return modules.get(name)}const m=module('portal-relay.js');await m.link(spec=>module(spec.split('?')[0].replace('./','')));await m.evaluate();
 assert.ok(dom.window.document.getElementById('relay-join').disabled);assert.equal(dom.window.document.getElementById('relay-send').disabled,false);assert.ok(dom.window.document.querySelector('#receive'));dom.window.close();
});
