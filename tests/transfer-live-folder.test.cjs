const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{webcrypto}=require('node:crypto');
const {directory}=require('./helpers/folder-fs.cjs'),base=path.join(__dirname,'../transfer/frontend/native');
const meta={name:'research',kind:'folder',size:5,fileCount:3,directoryCount:3};
const entries=[{kind:'directory',path:'a',offset:0},{kind:'file',path:'a/one',size:3,offset:0,lastModified:1},{kind:'directory',path:'empty',offset:3},{kind:'file',path:'two',size:2,offset:3,lastModified:1},{kind:'file',path:'zero',size:0,offset:5,lastModified:1}];
function selection(){return {rootName:meta.name,totalBytes:5,fileCount:3,directoryCount:3,entries:entries.map(e=>e.kind==='file'?{...e,file:new Blob([e.path==='a/one'?'abc':e.path==='two'?'de':''])}:{...e})}}
async function modules(document){const ctx=vm.createContext({document,Blob,TextEncoder,ArrayBuffer,Uint8Array,Date,Promise,setTimeout,clearTimeout,crypto:webcrypto});const loaded={};async function load(name){return require('./helpers/transfer-modules.cjs').load(ctx,name)}const all={};for(const name of ['live-folder.js','lan-core.js','relay-core.js','receive-core.js']){const m=await load(name);await m.evaluate();Object.assign(all,m.namespace)}return all}
const manifestReply=()=>({...meta,entries,total:5,next:null});
class Channel extends EventTarget{
 constructor(){super();this.readyState='open';this.bufferedAmount=0}
 send(data){setImmediate(()=>{if(this.peer.readyState==='open'){const event=new Event('message');event.data=data;this.peer.dispatchEvent(event)}})}
 close(){if(this.readyState==='closed')return;this.readyState='closed';this.dispatchEvent(new Event('close'));this.peer?.close()}
}
function channels(){const a=new Channel(),b=new Channel();a.peer=b;b.peer=a;return [a,b]}
test('shared adapter snapshots local selection and submits only metadata in bounded pages',async()=>{
 const source=selection(),c=await modules({querySelector:()=>({folderSelection:source})}),chosen=c.selectedFolder();assert.equal(chosen.descriptor.maxFileBytes,3);assert.equal(await chosen.file.slice(1,4).text(),'bcd');let sealed=false;
 await c.submitManifest(async(op,data)=>{if(op==='seal'){sealed=true;return}assert(data.entries.every(e=>!('file' in e)&&!('offset' in e)));return {received:data.after+data.entries.length}},source);assert(sealed);
});
test('LAN folder stream saves files and empty entries before the sender sees completion',async()=>{
 const c=await modules({querySelector:()=>({folderSelection:selection()})}),root=directory(),sink=await c.directoryStream(root,meta,async()=>manifestReply()),[a,b]=channels(),send=new c.Wire(a),recv=new c.Wire(b);let saved=false;
 try{await Promise.all([c.sendFile({wire:send,file:c.selectedFolder().file}),c.receiveFile({wire:recv,size:5,sink,onSaved:()=>{saved=true;assert.equal(root.children.get('research').children.get('zero').data.length,0)}})]);assert(saved);assert.equal(root.children.get('research').children.get('a').children.get('one').data.toString(),'abc');assert.equal(root.children.get('research').children.get('two').data.toString(),'de')}finally{a.close()}
});
test('online relay aggregate stream shares ACK and folder sink; no file data in metadata',async()=>{
 const c=await modules({querySelector:()=>({folderSelection:selection()})}),root=directory(),sink=await c.directoryStream(root,meta,async()=>manifestReply());let block=null,offset=0,saved=false,peak=0;const session={size:5,offset:0};
 const state=()=>({name:'research',size:5,offset,saved,ready:true,pending:!!block,wait_ms:0});
 const sending=c.relaySend({file:c.selectedFolder().file,call:async()=>state(),put:async(at,body)=>{assert.equal(at,offset);assert.equal(block,null);block=new Uint8Array(await body.arrayBuffer());peak=Math.max(peak,block.byteLength)},sleep:()=>new Promise(r=>setImmediate(r))});
 const receiving=(async()=>{await c.receive({session,sink,hash:c.digest,read:async at=>{while(!block)await new Promise(r=>setImmediate(r));return {offset:at,data:block,sha256:await c.digest(block)}},call:async(op,p)=>{offset=p.end;block=null;return {offset}}});await sink.close();saved=true})();
 await Promise.all([sending,receiving]);assert.equal(peak,5);assert.equal(root.children.get('research').children.get('two').data.toString(),'de');assert.equal(root.children.get('research').children.get('empty').kind,'directory');
});
test('empty root over LAN completes with no binary payload',async()=>{
 const c=await modules(),root=directory(),info={name:'empty',size:0,fileCount:0,directoryCount:1},sink=await c.directoryStream(root,info,async()=>({...info,entries:[],total:0,next:null})),[a,b]=channels();let binaries=0;const old=a.send.bind(a);a.send=data=>{if(typeof data!=='string')binaries++;old(data)};
 try{await Promise.all([c.sendFile({wire:new c.Wire(a),file:{size:0,slice(){throw Error('read unexpected')}}}),c.receiveFile({wire:new c.Wire(b),size:0,sink})]);assert.equal(binaries,0);assert(root.children.has('empty'))}finally{a.close()}
});
test('metadata preflight rejects online memory overflow before creating rooms',async()=>{
 const source=selection();source.entries=Array.from({length:3000},(_,i)=>({kind:'file',path:String(i)+'x'.repeat(1000),size:0,lastModified:0,file:new Blob()}));source.fileCount=3000;source.totalBytes=0;
 const c=await modules({querySelector:()=>({folderSelection:source})});assert.throws(()=>c.selectedFolder(),/2 MiB/);
});
test('cancelled directory preparation does not create a destination folder',async()=>{const c=await modules(),root=directory();await assert.rejects(c.directoryStream(root,meta,async()=>manifestReply(),{stopped:()=>true}),/取消/);assert.equal(root.children.size,0)});

async function ui(mode){
 const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');let html=fs.readFileSync(path.join(base,'portal.html'),'utf8').replace(/\{%[\s\S]*?%\}/g,'').replace(/\{\{[\s\S]*?\}\}/g,'');html=html.replace('name="transfer-base" content=""','name="transfer-base" content="/transfer"');
 const dom=new JSDOM(html,{url:'https://teacher.test/transfer/'}),w=dom.window,d=w.document,events=[],timers=new Set(),root=directory();d.documentElement.lang='en';w.isSecureContext=true;w.RTCPeerConnection=function(){};w.showDirectoryPicker=async()=>{events.push('picker');return root};Object.defineProperty(w,'crypto',{value:webcrypto});d.querySelector('[data-folder-preview]').folderSelection=selection();
 let release;const gate=new Promise(r=>release=r);const fetch=async(url,options)=>{const op=url.split('/').pop(),data=JSON.parse(options.body);events.push(op);if(op==='manifest'&&data.entries){await gate;return new Response(JSON.stringify({received:data.entries.length}))}return new Response(JSON.stringify(op==='create'?{code:'a'.repeat(32),...meta,role:'send'}:op==='seal'?{manifestReady:true}:op==='issue'?{code:'AB1234',expires_at:Date.now()+60000}:{cancelled:true}))};
 const ctx=vm.createContext({window:w,document:d,crypto:webcrypto,Blob,TextEncoder,Uint8Array,ArrayBuffer,URL,location:w.location,AbortController,fetch,btoa:w.btoa.bind(w),setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);timers.add(t);return t},clearTimeout});
 const mods={};async function load(name){return require('./helpers/transfer-modules.cjs').load(ctx,name)}const m=await load('portal-'+mode+'.js');await m.evaluate();return {dom,d,events,release,close(){for(const timer of timers)clearTimeout(timer);dom.window.close()}};
}
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5))}throw Error('UI timeout')}
for(const mode of ['lan','relay'])test(mode+' controller reveals one folder pairing code only after manifest seal',async()=>{
 const u=await ui(mode);try{u.d.querySelector('#'+mode+'-folder-send').click();await until(()=>u.events.includes('manifest'));assert.equal(u.d.querySelector('#'+mode+'-pair-box').hidden,true);u.release();await until(()=>u.d.querySelector('#'+mode+'-pair').value==='AB1234');assert.deepEqual(u.events,['create','manifest','seal','issue']);assert.equal(u.d.querySelector('#'+mode+'-pair').value,'AB1234');u.d.querySelector('#'+mode+'-cancel').click();await until(()=>u.events.includes('cancel'))}finally{u.close()}
});
