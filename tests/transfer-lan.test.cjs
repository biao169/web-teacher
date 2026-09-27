const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{webcrypto}=require('node:crypto');
async function core(){const context=vm.createContext({Error,Promise,setTimeout,clearTimeout,Date,ArrayBuffer,Uint8Array,Number,JSON,Array,Math,crypto:webcrypto});const modules=new Map();function mod(name){if(!modules.has(name))modules.set(name,new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../transfer/frontend/native',name),'utf8'),{context,identifier:name}));return modules.get(name)}const m=mod('lan-core.js');await m.link(spec=>mod(spec.split('?')[0].replace('./','')));await m.evaluate();return m.namespace}
class Channel extends EventTarget{
 constructor(){super();this.readyState='open';this.bufferedAmount=0;this.maxBuffered=0}
 send(data){if(this.readyState!=='open')throw Error('closed');this.bufferedAmount+=typeof data==='string'?data.length:data.byteLength;this.maxBuffered=Math.max(this.maxBuffered,this.bufferedAmount);setImmediate(()=>{this.bufferedAmount=0;if(this.peer.readyState==='open'){const e=new Event('message');e.data=data;this.peer.dispatchEvent(e)}})}
 close(){if(this.readyState==='closed')return;this.readyState='closed';this.dispatchEvent(new Event('close'));if(this.peer?.readyState!=='closed')this.peer?.close()}
}
const turn=()=>new Promise(r=>setImmediate(r));
function channels(){const a=new Channel(),b=new Channel();a.peer=b;b.peer=a;return [a,b]}
test('multi-block direct transfer reuses sink ACK and closes before completion',async()=>{
 const {Wire,sendFile,receiveFile,BLOCK}=await core(),[a,b]=channels(),send=new Wire(a),recv=new Wire(b),data=new Uint8Array(BLOCK*3+21);webcrypto.getRandomValues(data.subarray(0,65536));data[data.length-1]=91;
 let readBlocks=0,written=0,closed=false,saved=false,release;const gate=new Promise(r=>release=r),pieces=[];
 const file={size:data.length,slice:(start,end)=>{readBlocks++;return {arrayBuffer:async()=>data.slice(start,end).buffer}}};
 const sending=sendFile({wire:send,file}),receiving=receiveFile({wire:recv,size:data.length,onSaved:()=>{saved=true},sink:{write:async part=>{assert.equal(part.position,written);if(written===0)await gate;pieces.push(part.data);written+=part.data.length},close:async()=>{closed=true}}});
 for(let i=0;i<20;i++)await turn();assert.equal(readBlocks,1);assert.equal(written,0);release();
 await Promise.all([sending,receiving]);assert.equal(written,data.length);assert.ok(closed&&saved);assert.deepEqual(Buffer.concat(pieces.map(x=>Buffer.from(x))),Buffer.from(data));assert.ok(a.maxBuffered<=81920);a.close();
});
test('corrupt data does not write, acknowledge or close destination',async()=>{
 const {Wire,receiveFile}=await core(),[a,b]=channels(),send=new Wire(a),recv=new Wire(b);let writes=0,closed=0;
 const result=receiveFile({wire:recv,size:2,sink:{write:async()=>writes++,close:async()=>closed++}});
 await send.next();await send.send({type:'block',offset:0,size:2,sha256:'0'.repeat(64)});await send.send(new Uint8Array([1,2]).buffer);
 await assert.rejects(result,/校验失败/);assert.equal(writes,0);assert.equal(closed,0);a.close();
});
test('oversized frames and flooded queues close instead of accumulating',async()=>{
 const {Wire,BLOCK}=await core();for(const flood of [false,true]){const [a,b]=channels(),recv=new Wire(b);if(flood){for(let i=0;i<80;i++)a.send(new ArrayBuffer(16384))}else a.send(new ArrayBuffer(BLOCK));await turn();assert.ok(recv.error);assert.equal(recv.bytes,0);assert.equal(recv.queue.length,0)}
});
test('slow DataChannel buffer blocks next send; close rejects pending read',async()=>{
 const {Wire}=await core(),[a,b]=channels(),wire=new Wire(a);a.bufferedAmount=90000;let done=false;const sending=wire.send({type:'pull',offset:0}).then(()=>done=true);await turn();assert.equal(done,false);a.bufferedAmount=0;await sending;const reading=wire.next();a.close();await assert.rejects(reading,/断开/)
});
test('wrong ACK and false final save never claim completion',async()=>{
 const {Wire,sendFile}=await core(),[a,b]=channels(),wire=new Wire(a),peer=new Wire(b);const result=sendFile({wire,file:{size:1,slice:()=>({arrayBuffer:async()=>new Uint8Array([1]).buffer})}});
 await peer.send({type:'pull',offset:0});await peer.next();await peer.next();await peer.send({type:'ack',offset:2,sha256:'x'});await assert.rejects(result,/确认校验失败/);a.close();
});
test('selected ICE route is reported without claiming physical LAN or exposing addresses',async()=>{
 const {connectionPath}=await core();const stats=new Map([['transport',{type:'transport',selectedCandidatePairId:'pair'}],['pair',{type:'candidate-pair',localCandidateId:'local',remoteCandidateId:'remote'}],['local',{candidateType:'host',protocol:'udp',address:'192.168.1.1'}],['remote',{candidateType:'host'}]]);
 const pc={getStats:async()=>stats};const label=String(await connectionPath(pc));assert.match(label,/host ↔ host/);assert.match(label,/需实测确认/);assert.ok(!label.includes('192.168'));
 stats.set('remote',{candidateType:'relay'});await assert.rejects(connectionPath(pc),/中继/);
});
test('disk close failure cannot send saved message',async()=>{
 const {Wire,sendFile,receiveFile}=await core(),[a,b]=channels(),send=new Wire(a),recv=new Wire(b);let saved=false;
 const sending=sendFile({wire:send,file:{size:1,slice:()=>({arrayBuffer:async()=>new Uint8Array([7]).buffer})}});
 const receiving=receiveFile({wire:recv,size:1,sink:{write:async()=>{},close:async()=>{throw Error('disk full')}},onSaved:()=>saved=true});
 await assert.rejects(receiving,/disk full/);assert.equal(saved,false);a.close();await assert.rejects(sending,/断开/);
});
test('unsupported UI disables direct controls and keeps cached panels',async()=>{
 const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');let html=fs.readFileSync(path.join(__dirname,'../transfer/frontend/native/portal.html'),'utf8').replace(/\{%[\s\S]*?%\}/g,'').replace(/\{\{[\s\S]*?\}\}/g,'').replace('name="transfer-base" content=""','name="transfer-base" content="/transfer"');
 const dom=new JSDOM(html,{url:'https://teacher.test/transfer/'}),context=vm.createContext({document:dom.window.document,window:dom.window,Error,ArrayBuffer,Uint8Array,Date,Promise,setTimeout,clearTimeout,fetch:()=>{throw Error('unexpected request')}}),modules=new Map();
 function mod(name){if(!modules.has(name))modules.set(name,new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../transfer/frontend/native',name),'utf8'),{context,identifier:name}));return modules.get(name)}const m=mod('portal-lan.js');await m.link(spec=>mod(spec.split('?')[0].replace('./','')));await m.evaluate();
 for(const id of ['lan-send','lan-join','lan-save'])assert.ok(dom.window.document.getElementById(id).disabled);assert.match(dom.window.document.getElementById('lan-status').textContent,/HTTPS/);assert.ok(dom.window.document.querySelector('[data-cached-panels]'));dom.window.close();
});
test('file picker stays single while status polling continues; cancellation clears the room',async()=>{
 const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');const html=fs.readFileSync(path.join(__dirname,'../transfer/frontend/native/portal.html'),'utf8').replace(/\{%[\s\S]*?%\}/g,'').replace(/\{\{[\s\S]*?\}\}/g,'').replace('name="transfer-base" content=""','name="transfer-base" content="/transfer"');
 const dom=new JSDOM(html,{url:'https://teacher.test/transfer/'}),w=dom.window;let pickers=0,cancels=0;const timers=new Map();let id=0;
 Object.defineProperty(w,'isSecureContext',{value:true});Object.defineProperty(w,'crypto',{value:webcrypto});w.RTCPeerConnection=function(){};w.showSaveFilePicker=()=>{pickers++;return new Promise(()=>{})};
 const state={code:'a'.repeat(32),role:'receive',size:100,name:'sample.bin',paired:true,description:{type:'offer',sdp:'test'}};
 const context=vm.createContext({document:w.document,window:w,crypto:webcrypto,btoa:w.btoa.bind(w),Error,ArrayBuffer,Uint8Array,Number,JSON,Date,Promise,AbortController,setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key},clearTimeout:key=>timers.delete(key),fetch:async url=>{if(url.endsWith('/cancel'))cancels++;return {ok:true,json:async()=>state}}}),modules=new Map();
 function mod(name){if(!modules.has(name))modules.set(name,new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../transfer/frontend/native',name),'utf8'),{context,identifier:name}));return modules.get(name)}const module=mod('portal-lan.js');await module.link(spec=>mod(spec.split('?')[0].replace('./','')));await module.evaluate();
 w.document.getElementById('lan-code').value=state.code;w.document.getElementById('lan-join').click();await turn();
 async function tick(ms){const [key,timer]=[...timers].find(([,t])=>t.ms===ms);timers.delete(key);timer.fn();await turn()}
 await tick(1000);const save=w.document.getElementById('lan-save');assert.equal(save.disabled,false);save.click();assert.equal(pickers,1);await tick(2000);assert.equal(save.disabled,true);save.click();assert.equal(pickers,1);
 w.document.getElementById('lan-cancel').click();await turn();assert.equal(cancels,1);assert.equal(w.document.getElementById('lan-join').disabled,false);dom.window.close();
});
