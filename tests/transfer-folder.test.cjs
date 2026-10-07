const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const base=path.join(__dirname,'../transfer/frontend/native');
async function core(){const ctx=vm.createContext({setTimeout,AbortController});const m=new vm.SourceTextModule(fs.readFileSync(path.join(base,'folder-manifest.js'),'utf8'),{context:ctx});await m.link(require('./helpers/transfer-modules.cjs').linker(ctx));await m.evaluate();return m.namespace}
const f=(name,size=3,relative='')=>({name,size,lastModified:9,webkitRelativePath:relative,arrayBuffer(){throw Error('Must not read content')}});
const file=(name,size=3)=>({kind:'file',name,getFile:async()=>f(name,size)});
const dir=(name,children=[])=>({kind:'directory',name,async *values(){for(const child of children)yield child}});
test('directory handles retain hierarchy, same basenames and empty directories without reading content',async()=>{
 const c=await core(),m=await c.fromHandle(dir('研究数据',[dir('空目录'),dir('甲',[file('a.txt',0)]),dir('乙',[file('a.txt',7)])]));
 assert.equal(m.rootName,'研究数据');assert.equal(m.fileCount,2);assert.equal(m.directoryCount,4);assert.equal(m.totalBytes,7);assert.equal(m.emptyDirectoriesKnown,true);
 assert.deepEqual(Array.from(m.entries,x=>x.path),['乙','乙/a.txt','甲','甲/a.txt','空目录'].sort());
});
test('compatible directory input preserves relative paths and reports empty-directory limitation',async()=>{
 const c=await core(),m=await c.fromFileList([f('a.txt',4,'root/sub/a.txt'),f('b.txt',2,'root/b.txt')]);
 assert.equal(m.totalBytes,6);assert.equal(m.directoryCount,2);assert.equal(m.emptyDirectoriesKnown,false);assert(m.entries.find(x=>x.path==='sub/a.txt').file);
 await assert.rejects(c.fromFileList([]),/空文件夹/);
 await assert.rejects(c.fromFileList([f('x',1,'a/x'),f('y',1,'b/y')]),/一个根/);
});
test('portable paths reject traversal, absolute paths, separators, reserved names and collisions',async()=>{
 const c=await core();for(const p of ['../x','/tmp/a','C:/a','a\\b','a//b','a/CON.txt','a/foo.','a/\0x'])assert.throws(()=>c.validPath(p),p);
 await assert.rejects(c.fromHandle(dir('root',[file('A.txt'),file('a.txt')])),/冲突/);
 await assert.rejects(c.fromHandle(dir('root',[file('é.txt'),file('e\u0301.txt')])),/冲突/);
 await assert.rejects(c.fromFileList([f('a',1,'r/x'),f('b',1,'r/x/b')]),/冲突/);
});
test('limits, safe integer totals, permission errors and cancellation reject partial manifests',async()=>{
 const c=await core();await assert.rejects(c.fromHandle(dir('root',[file('a'),file('b')]),{limits:{files:1}}),/数量/);
 await assert.rejects(c.fromHandle(dir('root',[dir('a')]),{limits:{directories:1}}),/数量/);
 await assert.rejects(c.fromHandle(dir('root',[dir('a',[file('b')])]),{limits:{depth:1}}),/层级/);
 await assert.rejects(c.fromHandle(dir('root',[file('a',Number.MAX_SAFE_INTEGER),file('b',1)])),/安全计数/);
 const controller=new AbortController();controller.abort();await assert.rejects(c.fromHandle(dir('root'),{signal:controller.signal}),/取消/);
 await assert.rejects(c.fromHandle(dir('root',[{kind:'file',name:'x',getFile:async()=>{throw Error('Denied')}}])),/Denied/);
});
test('legacy drag reader drains all batches and preserves empty directory',async()=>{
 const c=await core();let reads=0;
 const entry={name:'folder',isDirectory:true,createReader(){return {readEntries(done){reads++;done(reads===1?[{name:'a',isFile:true,file:done=>done(f('a'))}]:reads===2?[{name:'empty',isDirectory:true,createReader:()=>({readEntries:done=>done([])})}]:[])}}}};
 const m=await c.fromEntry(entry);assert.equal(reads,3);assert.equal(m.fileCount,1);assert.equal(m.directoryCount,2);assert.equal(m.emptyDirectoriesKnown,true);
});
test('drag handles are captured synchronously and a single file is rejected',async()=>{
 const c=await core();let captured=false;const read=c.captureDrop([{kind:'file',getAsFileSystemHandle(){captured=true;return Promise.resolve(dir('folder'))}}]);assert(captured);assert.equal((await read()).fileCount,0);
 await assert.rejects(c.captureDrop([{kind:'file',getAsFileSystemHandle:()=>Promise.resolve(file('a'))}])(),/文件夹/);
 assert.throws(()=>c.captureDrop([{kind:'file'},{kind:'file'}]),/一个文件夹/);
});
async function ui(picker){
 const html=fs.readFileSync(path.join(base,'portal.html'),'utf8').replace(/\{%[\s\S]*?%\}/g,'').replace(/\{\{[\s\S]*?\}\}/g,'');
 const dom=new JSDOM(html,{url:'https://teacher.test/transfer/'}),w=dom.window;w.isSecureContext=true;w.showDirectoryPicker=picker;let requests=0;
 const ctx=vm.createContext({window:w,document:w.document,CustomEvent:w.CustomEvent,AbortController,setTimeout,fetch(){requests++;throw Error('No uploads allowed')}}),modules={};
 async function load(name){return require('./helpers/transfer-modules.cjs').load(ctx,name)}
 const m=await load('portal-folder.js');await m.evaluate();return {dom,w,d:w.document,requests:()=>requests};
}
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5))}throw Error('UI timeout')}
test('UI pages directory preview, stores only local manifest and never creates transport tasks',async()=>{
 const {dom,d,requests}=await ui(async()=>dir('samples',Array.from({length:125},(_,i)=>file('file-'+String(i).padStart(3,'0')))));
 try{d.querySelector('#folder-choose').click();await until(()=>d.querySelector('[data-folder-preview]').folderSelection);assert.equal(d.querySelectorAll('#folder-list li').length,100);assert.equal(d.querySelector('#folder-next').disabled,false);d.querySelector('#folder-next').click();assert.equal(d.querySelectorAll('#folder-list li').length,25);assert.equal(requests(),0);assert.match(d.querySelector('#folder-status').textContent,/尚未开始/);d.querySelector('#folder-clear').click();assert.equal(d.querySelector('[data-folder-preview]').folderSelection,null);assert.equal(d.querySelectorAll('#folder-list li').length,0)}finally{dom.window.close()}
});
test('UI cancellation discards a late picker result',async()=>{
 let release;const {dom,d,requests}=await ui(()=>new Promise(resolve=>release=resolve));
 try{d.querySelector('#folder-choose').click();d.querySelector('#folder-clear').click();release(dir('late',[file('x')]));await new Promise(r=>setTimeout(r,20));assert.equal(d.querySelector('[data-folder-preview]').folderSelection,null);assert.equal(requests(),0)}finally{dom.window.close()}
});

test('tree ordering keeps descendants next to their parent',async()=>{const c=await core(),m=await c.fromHandle(dir('root',[file('a.txt'),dir('a',[file('z')])]));assert.deepEqual(Array.from(m.entries,x=>x.path),['a','a/z','a.txt'])});
