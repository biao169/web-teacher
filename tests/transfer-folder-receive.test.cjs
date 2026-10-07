const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.join(__dirname,'../transfer/frontend/native');
async function core(){const ctx=vm.createContext({Uint8Array,Date,Promise,setTimeout});const modules={};async function load(name){return require('./helpers/transfer-modules.cjs').load(ctx,name)}const m=await load('folder-receive.js');await m.evaluate();const r=await load('receive-core.js');await r.evaluate();return {...m.namespace,receive:r.namespace.receive}}
const {directory}=require('./helpers/folder-fs.cjs');
const info={name:'research',size:5,fileCount:3,directoryCount:3};
const entries=[{kind:'directory',path:'a',offset:0},{kind:'file',path:'a/one',size:3,offset:0},{kind:'directory',path:'empty',offset:3},{kind:'file',path:'two',size:2,offset:3},{kind:'file',path:'zero',size:0,offset:5}];
const manifest=()=>({...info,entries:entries.map(e=>({...e}))});
const bytes=s=>new Uint8Array(Buffer.from(s));
test('paged manifest validates counts, hierarchy, offsets and portable paths',async()=>{const c=await core();const result=await c.readManifest(async()=>({...info,entries,total:5,next:null}),info);assert.equal(result.entries.length,5);
 for(const bad of [[{kind:'file',path:'../x',size:5,offset:0}],[{kind:'file',path:'a/no-parent',size:5,offset:0}],entries.map((e,i)=>({...e,...(i===1?{offset:1}:{})})),entries.map((e,i)=>({...e,...(i===3?{path:'A'}:{})}))])await assert.rejects(c.readManifest(async()=>({...info,entries:bad,total:5,next:null}),info));
});
test('directory sink splits a chunk across files, closes complete files and preserves empty entries',async()=>{const c=await core(),parent=directory(),sink=await c.folderSink(parent,manifest());await sink.write({position:0,data:bytes('abcde')});assert(await sink.finish());const root=parent.children.get('research');assert.equal(root.children.get('a').children.get('one').data.toString(),'abc');assert.equal(root.children.get('two').data.toString(),'de');assert.equal(root.children.get('zero').data.length,0);assert.equal(root.children.get('empty').kind,'directory');assert.equal(sink.completed,3)});
test('existing directory and same-name file are never overwritten',async()=>{const c=await core(),parent=directory();const old=await parent.getDirectoryHandle('research',{create:true});const existing=await old.getFileHandle('mine',{create:true});existing.data=Buffer.from('keep');await parent.getFileHandle('research (1)',{create:true});const sink=await c.folderSink(parent,manifest());assert.equal(sink.name,'research (2)');await sink.write({position:0,data:bytes('abcde')});await sink.finish();assert.equal(existing.data.toString(),'keep')});
test('unexpected entry inside fresh root stops without overwriting',async()=>{const c=await core(),parent=directory(),sink=await c.folderSink(parent,manifest());await parent.children.get('research').getDirectoryHandle('a',{create:true});await assert.rejects(sink.write({position:0,data:bytes('abcde')}),/同名/);assert(sink.broken)});
test('pause and lost ACK resume without rewriting saved file bytes',async()=>{const c=await core(),parent=directory(),sink=await c.folderSink(parent,manifest()),session={size:5,offset:0};let lost=true,reads=0;
 const options={session,sink,read:async offset=>{reads++;return {offset,data:bytes('abcde'),sha256:'ok'}},hash:async()=> 'ok',call:async()=>{if(lost)throw Error('lost');return {offset:5}}};
 await assert.rejects(c.receive(options),/lost/);assert.equal(session.offset,0);assert(session.pending);lost=false;assert(await c.receive(options));assert(await sink.finish());assert.equal(reads,1);assert.equal(parent.children.get('research').children.get('two').writes,1)
});
test('cancel aborts current temporary file and retains completed files',async()=>{const c=await core(),parent=directory(),sink=await c.folderSink(parent,manifest());await sink.write({position:0,data:bytes('abcd')});assert.equal(sink.completed,1);await sink.abort();const root=parent.children.get('research');assert.equal(root.children.get('a').children.get('one').data.toString(),'abc');assert.equal(root.children.get('two').data.length,0)});
test('empty root and trailing empty entries complete without network data',async()=>{const c=await core(),parent=directory();const sink=await c.folderSink(parent,{name:'empty',size:0,fileCount:0,directoryCount:1,entries:[]});assert(await sink.finish());const zeros=await c.folderSink(parent,{name:'zeros',size:0,fileCount:1,directoryCount:2,entries:[{kind:'directory',path:'empty',offset:0},{kind:'file',path:'zero',size:0,offset:0}]});assert.equal(await zeros.finish(()=>true),false);assert(await zeros.finish());assert.equal(zeros.completed,1)});
test('failed final close never acknowledges and requires explicit cancel',async()=>{const c=await core(),parent=directory(),sink=await c.folderSink(parent,manifest());await sink.write({position:0,data:bytes('a')});const file=parent.children.get('research').children.get('a').children.get('one');file.closeFail=true;let acks=0;await assert.rejects(c.receive({session:{size:5,offset:1},sink,read:async offset=>({offset,data:bytes('bcde'),sha256:'ok'}),hash:async()=> 'ok',call:async()=>{acks++}}),/close failed/);assert.equal(acks,0);assert(sink.broken);await sink.abort()});
async function ui({directorySupport=true,loseAck=false}={}){
 const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');let html=fs.readFileSync(path.join(base,'portal.html'),'utf8').replace(/\{%[\s\S]*?%\}/g,'').replace(/\{\{[\s\S]*?\}\}/g,'');html=html.replace('name="transfer-base" content=""','name="transfer-base" content="/transfer"');
 const dom=new JSDOM(html,{url:'https://teacher.test/transfer/'}),w=dom.window,d=w.document,parent=directory(),events=[];w.isSecureContext=true;w.showSaveFilePicker=()=>{throw Error('must choose directory')};if(directorySupport)w.showDirectoryPicker=async()=>{events.push('picker');return parent};let lost=loseAck;
 const token='t'.repeat(43),chunk=bytes('abcde'),crypto=require('node:crypto').webcrypto,digest=require('node:crypto').createHash('sha256').update(chunk).digest('hex');
 const fetch=async(url,options)=>{const action=url.split('/').pop();events.push(action);
  const values={'share-info':{...info,kind:'folder'},receive:{id:'r',name:info.name,size:5,kind:'folder',offset:0},manifest:{...info,entries,total:5,next:null},ack:{offset:5,complete:false},finish:{complete:true}};
  if(action==='chunk')return new Response(chunk,{headers:{'X-Chunk-Size':'5','X-Chunk-Offset':'0','X-Chunk-SHA256':digest}});
  if(action==='ack'&&lost){lost=false;return new Response(JSON.stringify({error:'lost ACK'}),{status:503})}
  if(action==='finish')assert.equal(parent.children.get('research').children.get('zero').data.length,0);
  assert(values[action],action);return new Response(JSON.stringify(values[action]));
 };
 const ctx=vm.createContext({document:d,window:w,location:w.location,URL,Error,TypeError,Number,JSON,Array,Uint8Array,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,fetch,crypto,btoa:w.btoa.bind(w)}),mods={};async function load(name){return require('./helpers/transfer-modules.cjs').load(ctx,name)}const m=await load('portal-receive.js');await m.evaluate();d.querySelector('#receive-link').value='https://teacher.test/transfer/s/'+token;return {dom,d,parent,events};
}
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5))}throw Error('UI timeout')}
test('controller chooses directory in click gesture and resumes lost ACK with the same session',async()=>{
 const {dom,d,parent,events}=await ui({loseAck:true});try{
  d.querySelector('#inspect-share').click();await until(()=>!d.querySelector('#stream-start').disabled);d.querySelector('#stream-start').click();await until(()=>d.querySelector('#stream-feedback').textContent.includes('lost ACK'));
  assert(events.indexOf('picker')<events.indexOf('receive'));assert.equal(d.querySelector('[data-portal]').dataset.receiving,'true');
  d.querySelector('#stream-start').click();await until(()=>d.querySelector('#stream-feedback').textContent.includes('完整保存'));
  assert.equal(events.filter(e=>e==='receive').length,1);assert.equal(events.filter(e=>e==='chunk').length,1);assert.equal(parent.children.get('research').children.get('two').writes,1);assert.equal(d.querySelector('[data-portal]').dataset.receiving,'false');assert.equal(d.querySelector('#receive-progress').value,100);
 }finally{dom.window.close()}
});
test('unsupported directory writer explains limitation without creating a receive session',async()=>{
 const {dom,d,events}=await ui({directorySupport:false});try{d.querySelector('#inspect-share').click();await until(()=>d.querySelector('#stream-feedback').textContent.includes('不支持目录写入'));assert.equal(d.querySelector('#stream-start').disabled,true);assert.equal(events.filter(e=>e==='receive').length,0);assert.equal(events.filter(e=>e==='picker').length,0)}finally{dom.window.close()}
});
