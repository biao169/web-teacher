const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const base=path.join(__dirname,'../transfer/frontend/native');
async function core(){const ctx=vm.createContext({Blob,setTimeout,AbortController,crypto:crypto.webcrypto});const modules={};async function load(name){return require('./helpers/transfer-modules.cjs').load(ctx,name)}const m=await load('folder-upload.js');await m.evaluate();return m.namespace}
function manifest(count=2){const entries=Array.from({length:count},(_,i)=>({kind:'file',path:'file'+i,size:2,lastModified:1,file:new Blob(['ab'])}));return {rootName:'folder',totalBytes:count*2,fileCount:count,directoryCount:1,entries}}
const current={id:'a'.repeat(32),token:'a'.repeat(43)};
function server(m,{confirmed=0,received=0}={}){let stored=m.entries.slice(0,received).map(e=>({...e,file:undefined})),sealed=false,created=0,blocks=[];const log=[];
 const digest=async data=>crypto.createHash('sha256').update(Buffer.from(await data.arrayBuffer())).digest('hex');
 const call=async(url,options)=>{log.push(url);const data=options?.body&&typeof options.body==='string'?JSON.parse(options.body):{};
 if(url==='/api/folders'){created++;return current}
 if(url.includes('/manifest')&&!options){const after=Number(url.split('after=')[1]||0),entries=stored.slice(after,after+100);return {name:m.rootName,size:m.totalBytes,fileCount:m.fileCount,directoryCount:m.directoryCount,received:stored.length,manifestReady:sealed,state:'uploading',entries,next:after+entries.length<stored.length?after+entries.length:null}}
 if(url.endsWith('/manifest')){assert.equal(data.after,stored.length);assert(data.entries.length<=100);stored.push(...data.entries);return {received:stored.length}}
 if(url.endsWith('/seal')){assert.equal(stored.length,m.entries.length);sealed=true;return {ok:true}}
 if(url.endsWith('/chunk')){assert(sealed);assert.equal(Number(options.headers['X-Offset']),confirmed);assert(options.body.size<=1048576);blocks.push(await options.body.text());confirmed+=options.body.size;return {offset:confirmed}}
 if(url==='/api/tasks/'+current.id){const file=(await core()).folderFile(m);return {name:m.rootName,size:m.totalBytes,state:'uploading',paged:true,confirmed,version:1,parts:confirmed?[{offset:0,size:confirmed,sha256:await digest(file.slice(0,confirmed))}]:[],next_offset:null}}
 throw Error(url)};
 return {call,log,blocks,created:()=>created};
}
test('one task for 205 files, paged manifests, reuses chunk stream',async()=>{const c=await core(),m=manifest(205),s=server(m);let created;const result=await c.sendFolder({manifest:m,csrf:'csrf',call:s.call,created:v=>created=v});assert(result.complete);assert.equal(created.id,current.id);assert.equal(s.created(),1);assert.equal(s.log.filter(u=>u.endsWith('/manifest')).length,4);assert.equal(s.blocks.join(''),'ab'.repeat(205))});
test('bounded virtual file slices across original file boundaries',async()=>{const c=await core(),m=manifest(),file=c.folderFile(m);assert.equal(await file.slice(1,3).text(),'ba');assert.throws(()=>file.slice(0,1048577),/内存/)});
test('resume verifies stored paths and hashes, never creates another task',async()=>{const c=await core(),m=manifest(),s=server(m,{received:1,confirmed:2});assert((await c.sendFolder({manifest:m,current,csrf:'x',call:s.call})).complete);assert.equal(s.created(),0);assert.equal(s.blocks.join(''),'ab')});
test('mismatching manifest blocks chunks',async()=>{const c=await core(),m=manifest(),s=server(m,{received:1});m.entries[0].path='changed';await assert.rejects(c.sendFolder({manifest:m,current,call:s.call}),/原任务不同/);assert.equal(s.blocks.length,0)});
test('empty directory seals without trying single-file upload',async()=>{const c=await core(),m=manifest(0),s=server(m);assert((await c.sendFolder({manifest:m,call:s.call})).complete);assert.equal(s.blocks.length,0)});
test('stop between manifest batches preserves one task for continuation',async()=>{const c=await core(),m=manifest(205),s=server(m);let stop=false;const r=await c.sendFolder({manifest:m,call:s.call,progress:()=>stop=true,stopped:()=>stop});assert.equal(r.complete,false);assert.equal(s.blocks.length,0);assert.equal(s.created(),1)});
test('folder send UI creates one visible link, disables replacement during send, and keeps resume record',async()=>{
 const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');const html=fs.readFileSync(path.join(base,'portal.html'),'utf8').replace(/\{%[\s\S]*?%\}/g,'').replace(/\{\{[\s\S]*?\}\}/g,'');
 const dom=new JSDOM(html,{url:'https://teacher.test/transfer/'}),w=dom.window,d=w.document;d.querySelector('[data-portal]').dataset.user='user1';const panel=d.querySelector('[data-folder-preview]');panel.folderSelection=manifest();let finish;
 const ctx=vm.createContext({document:d,sessionStorage:w.sessionStorage,location:w.location,URL,CustomEvent:w.CustomEvent});
 const send=new vm.SyntheticModule(['sendFolder'],function(){this.setExport('sendFolder',async opts=>{assert.equal(d.querySelector('#folder-clear').disabled,true);assert.equal(panel.folderBusy,true);opts.created(current);await new Promise(resolve=>finish=resolve);opts.progress({phase:'upload',bytes:4,total:4});return {complete:true,current}})},{context:ctx});
 const dep=new vm.SyntheticModule(['bytes','transferPath','transferBase','request'],function(){this.setExport('transferBase','');this.setExport('request',async()=>{});this.setExport('bytes',n=>n+' B');this.setExport('transferPath',p=>'/transfer'+p)},{context:ctx});
 const m=new vm.SourceTextModule(fs.readFileSync(path.join(base,'portal-folder-send.js'),'utf8'),{context:ctx});await m.link(require('./helpers/transfer-modules.cjs').linker(ctx,{'folder-upload.js':send,'portal-core.js':dep}));await m.evaluate();
 try{d.querySelector('#folder-send').click();assert.equal(d.querySelector('#folder-send').disabled,true);assert(JSON.parse(w.sessionStorage.getItem('transfer-folder-v1:user1')).id===current.id);finish();await new Promise(r=>setImmediate(r));assert.equal(panel.folderBusy,false);assert.equal(d.querySelector('#folder-link').value,'https://teacher.test/transfer/s/'+current.token);assert.match(d.querySelector('#folder-send-status').textContent,/原层级保存/);assert.equal(d.querySelector('#folder-link').hidden,false)}finally{w.close()}
});
