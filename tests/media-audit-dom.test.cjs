/* Server-rendered inventory UI with the real shared modules; simulated DOM. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process'),{JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const project=path.resolve(__dirname,'..');
const html=execFileSync(process.env.TEST_PYTHON||'python3',['-B','-c',`
import sys,tempfile,asyncio
from pathlib import Path
sys.path.insert(0,'tests')
from list_fixture import client_at
from backend.app.native.auth import Auth
from backend.app.native.media_audit import MediaAudit
with tempfile.TemporaryDirectory() as directory:
 client,r=client_at(directory)
 async def prepare():
  r.auth=Auth(r.sql,r.passwords);r.p=await r.auth.principal(client.cookies.get(r.config.name('session')))
  for name in ('one.jpg','two.jpg','three.pdf'):
   (r.media_store.root/name).write_bytes(Path('tests/fixtures/media/sample.'+name.rsplit('.',1)[1]).read_bytes())
  audit=MediaAudit(r);state=await audit.start()
  while state['phase']!='done':state=await audit.step(state['id'],state['version'])
 asyncio.run(prepare())
 print(client.get('/admin/media/audit').text)
 client.close()
`],{cwd:project,encoding:'utf8',maxBuffer:2*1024*1024});

async function fixture({mime='image/jpeg',fail=[]}={}){
 const dom=new JSDOM(html,{url:'http://127.0.0.1:8765/admin/media/audit',pretendToBeVisual:true});
 const w=dom.window,document=w.document,modules=new Map(),requests=[],navigation=[],errors=[],timers=new Set();let current=new URL(w.location.href),copied='';
 const location={get href(){return current.href},get origin(){return current.origin},get search(){return current.search},get pathname(){return current.pathname},get hash(){return current.hash},assign(value){current=new URL(value,current);navigation.push(current.href)},reload(){navigation.push('reload')}};
 w.HTMLCanvasElement.prototype.getContext=()=>null;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
 const later=(fn,ms=0)=>{const id=setTimeout(()=>{timers.delete(id);fn()},ms);timers.add(id);return id};
 const sandbox={window:w,document,location,history:{state:null,replaceState(state,unused,url){current=new URL(url,current)}},URL,URLSearchParams,performance,innerWidth:1280,innerHeight:800,
  localStorage:w.localStorage,sessionStorage:w.sessionStorage,navigator:{clipboard:{writeText:async text=>copied=text}},
  console:{log(){},warn(){},error(...args){errors.push(args)}},getComputedStyle:w.getComputedStyle.bind(w),matchMedia:()=>({matches:true}),
  setTimeout:later,clearTimeout(id){clearTimeout(id);timers.delete(id)},requestAnimationFrame:fn=>later(fn,1),cancelAnimationFrame:id=>clearTimeout(id),
  fetch:async(input,options={})=>{const body=options.body?JSON.parse(options.body):null;requests.push({input:String(input),options,body});return {ok:true,status:200,url:String(input),type:'basic',headers:{get:key=>key==='content-type'?mime:null},json:async()=>body?.action==='recheck'?{category:'unregistered',note:''}:body?.action==='prepare_import'?{token:'example',source:'one.jpg',target:'one.jpg',mode:'register'}:{done:true}}}
 };
 for(const name of ['AbortController','Event','CustomEvent','MouseEvent','KeyboardEvent','MutationObserver','Option','HTMLElement','FormData'])sandbox[name]=w[name];
 const context=vm.createContext(sandbox),base='http://source.test/assets/admin/js/';
 function moduleFor(specifier,referrer=base){
  const identifier=new URL(specifier,referrer).href,name=path.basename(new URL(identifier).pathname);
  if(fail.includes(name))throw Error('Synthetic unavailable module');
  if(modules.has(identifier))return modules.get(identifier);
  const module=new vm.SourceTextModule(fs.readFileSync(path.join(project,'frontend/admin/static/js',name),'utf8'),{context,identifier,importModuleDynamically:async(specifier,referrer)=>load(specifier,referrer.identifier)});
  modules.set(identifier,module);return module;
 }
 async function load(specifier,referrer=base){const module=moduleFor(specifier,referrer);if(module.status==='unlinked')await module.link((s,r)=>moduleFor(s,r.identifier));if(module.status==='linked')await module.evaluate();return module}
 await load('native-table-headers.js?v=0.15.113');await load('native.js?v=0.15.113');
 return {w,document,requests,navigation,errors,location,get copied(){return copied},root:document.querySelector('#audit-report'),
  async ready(){await until(()=>document.documentElement.dataset.nativeReady==='true'&&document.querySelector('[data-list-load-status]').hidden)},
  close(){for(const id of timers)clearTimeout(id);dom.window.close()}
 };
}
async function until(predicate){for(let i=0;i<150;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5))}assert.ok(predicate(),'state not reached')}

test('audit mounts only its adapter; shared selection, bulk recheck and path copy work',async t=>{
 const r=await fixture();t.after(()=>r.close());await r.ready();
 assert.equal(r.root.dataset.listReady,undefined);assert.equal(r.document.querySelector('[data-column-controls]').disabled,false);
 const boxes=r.root.querySelectorAll('[data-select-row]'),all=r.root.querySelector('[data-select-all]');boxes[0].click();
 assert.equal(all.indeterminate,true);assert.match(r.root.querySelector('[data-selected-count]').textContent,/1/);
 all.click();assert.equal([...boxes].filter(box=>box.checked).length,3);
 r.root.querySelector('[data-audit-recheck-selected]').click();await until(()=>r.requests.filter(x=>x.body?.action==='recheck').length===3);
 assert.ok(r.requests.every(x=>x.options.method==='POST'));
 r.root.querySelector('[data-audit-copy]').click();await until(()=>r.copied.split('\n').length===3);
 r.root.querySelector('[data-selection-clear]').click();assert.ok([...boxes].every(box=>!box.checked));
 assert.equal(r.errors.length,0);
});

test('multiple category options survive apply, other filters and two-way sort',async t=>{
 const r=await fixture();t.after(()=>r.close());await r.ready();
 r.root.querySelector('[data-column-popup="category"]').click();let pop=r.document.querySelector('.native-popover'),select=pop.querySelector('select');
 assert.equal(select.multiple,true);for(const o of select.options)o.selected=['missing','unregistered'].includes(o.value);
 [...pop.querySelectorAll('button')].find(button=>button.textContent==='应用').click();
 let url=new URL(r.navigation.at(-1));assert.deepEqual(JSON.parse(url.searchParams.get('f.category')),['missing','unregistered']);
 r.root.querySelector('[data-column-sort="size"]').click();url=new URL(r.navigation.at(-1));assert.equal(url.searchParams.get('direction'),'asc');
 r.root.querySelector('[data-column-sort="size"]').click();url=new URL(r.navigation.at(-1));assert.equal(url.searchParams.get('direction'),'desc');assert.ok(url.searchParams.get('f.category'));
 r.root.querySelector('[data-column-popup="category"]').click();pop=r.document.querySelector('.native-popover');
 [...pop.querySelectorAll('button')].find(button=>button.textContent==='清除此列').click();assert.equal(new URL(r.navigation.at(-1)).searchParams.has('f.category'),false);
});

for(const [mime,selector] of [['image/jpeg','img'],['video/mp4','video'],['application/pdf','iframe']])test('unregistered '+mime+' opens on demand and closes cleanly',async t=>{
 const r=await fixture({mime});t.after(()=>r.close());await r.ready();
 assert.equal(r.requests.length,0);r.root.querySelector('[data-media-peek]').click();
 await until(()=>r.document.querySelector('.native-media-viewer '+selector));
 const dialog=r.document.querySelector('.native-media-viewer');assert.equal(r.requests.filter(x=>x.options.method==='HEAD').length,1);
 assert.match(dialog.querySelector(selector).src,/\/api\/admin\/media-audit\//);
 dialog.close();assert.equal(r.document.querySelector('.native-media-viewer'),null);
});

test('row selection stays available if the optional thumbnail module fails',async t=>{
 const r=await fixture({fail:['native-media.js']});t.after(()=>r.close());await r.ready();
 r.root.querySelector('[data-select-row]').click();assert.match(r.root.querySelector('[data-selected-count]').textContent,/1/);
 r.root.querySelector('[data-column-popup="name"]').click();assert.ok(r.document.querySelector('.native-popover'));
 assert.match(r.document.querySelector('[data-audit-feedback]').textContent,/媒体预览未能加载/);
});
