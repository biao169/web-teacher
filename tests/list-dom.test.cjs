/* Real shared modules + server-rendered HTML, in a simulated DOM (not a browser). */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const project=path.resolve(__dirname,'..');
const fixtures=JSON.parse(execFileSync(process.env.TEST_PYTHON||'python3',['-B','-c',`
import sys,json,tempfile,asyncio
sys.path.insert(0,'tests')
from list_fixture import client_at
with tempfile.TemporaryDirectory() as directory:
    client,r=client_at(directory)
    url='/admin/profiles?sort=name&direction=asc&size=20'
    asyncio.run(r.sql.batch([("INSERT INTO media_assets(uid,object_key,title,size,status) VALUES (?,?,?,?,?)",('trash-'+str(i),'trash-'+str(i)+'.png','Trash '+str(i),1536,'trash')) for i in range(3)]))
    media='/admin/media_assets?f.status=trash'
    print(json.dumps({'html':client.get(url).text,'fragment':client.get(url,headers={'X-Native-List':'1'}).json(),'mediahtml':client.get(media).text,'mediafragment':client.get(media,headers={'X-Native-List':'1'}).json()}))
    client.close()
`],{cwd:project,encoding:'utf8',maxBuffer:4*1024*1024}));

function runtime({media=false,failPurge=false,mobile=false,confirmResult=true,fail=[],storageFailure=false,readFailure=false,url='/admin/profiles?sort=name&direction=asc&size=20'}={}){
 if(media)url='/admin/media_assets?f.status=trash';
 const dom=new JSDOM(media?fixtures.mediahtml:fixtures.html,{url:'http://127.0.0.1:8765'+url,pretendToBeVisual:true});
 const w=dom.window,document=w.document,errors=[],navigation=[],requests=[],confirmations=[],timers=new Set(),modules=new Map();
 const viewport={matches:mobile,listener:null,addEventListener(type,listener){this.listener=listener}};
 let current=new URL(w.location.href);
 const location={get href(){return current.href},get search(){return current.search},get pathname(){return current.pathname},get origin(){return current.origin},get hash(){return current.hash},assign(value){current=new URL(value,current);navigation.push(current.href)}};
 const later=(fn,delay=0)=>{const timer=setTimeout(()=>{timers.delete(timer);fn()},delay);timers.add(timer);return timer};
 const storage=storageFailure?{getItem(){throw Error('storage denied')},setItem(){throw Error('storage denied')},removeItem(){throw Error('storage denied')}}:w.localStorage;
 w.HTMLCanvasElement.prototype.getContext=()=>{throw Error('canvas unavailable')};
 const sandbox={window:w,document,location,history:{state:null,replaceState(state,unused,value){current=new URL(value,current)}},
  console:{log(){},warn(){},error(...args){errors.push(args)}},URL,URLSearchParams,performance,
  localStorage:storage,sessionStorage:storage,innerWidth:1280,innerHeight:800,
  setTimeout:later,clearTimeout(timer){clearTimeout(timer);timers.delete(timer)},
  requestAnimationFrame:fn=>later(fn,2),cancelAnimationFrame:timer=>{clearTimeout(timer);timers.delete(timer)},
  getComputedStyle:w.getComputedStyle.bind(w),confirm:message=>{confirmations.push(message);return confirmResult},
  matchMedia:query=>query==='(max-width: 767px)'?viewport:{matches:true},navigator:w.navigator,
  fetch:async(input,options={})=>{
   requests.push({url:String(input),options});const body=options.body?JSON.parse(options.body):{};
   const failed=(readFailure&&options.method!=='POST')||(failPurge&&body.action==='purge');
   return {ok:!failed,status:failed?503:200,url:new URL(input,current).href,json:async()=>failed?{error:'Synthetic read failure'}:body.action==='purge-prepare'?{token:'synthetic-token',name:'Trash file',mode:'永久删除文件及登记',size:1536}:options.method==='POST'?{ok:true}:media?fixtures.mediafragment:fixtures.fragment}
  }
 };
 for(const name of ['AbortController','Event','CustomEvent','MouseEvent','KeyboardEvent','MutationObserver','Option','HTMLElement','FormData'])sandbox[name]=w[name];
 const context=vm.createContext(sandbox),base='http://source.test/assets/admin/js/';
 function getModule(specifier,referrer=base){
  const identifier=new URL(specifier,referrer).href;
  const name=path.basename(new URL(identifier).pathname);
  if(fail.includes(name))throw Error('Injected module failure: '+name);
  if(modules.has(identifier))return modules.get(identifier);
  const relative=new URL(identifier).pathname.replace('/assets/admin/','frontend/admin/static/');
  const module=new vm.SourceTextModule(fs.readFileSync(path.join(project,relative),'utf8'),{
   context,identifier,importModuleDynamically:async(specifier,referrer)=>load(specifier,referrer.identifier)
  });
  modules.set(identifier,module);return module;
 }
 async function load(specifier,referrer=base){
  const module=getModule(specifier,referrer);
  if(module.status==='unlinked')await module.link((specifier,referrer)=>getModule(specifier,referrer.identifier));
  if(module.status==='linked')await module.evaluate();
  return module;
 }
 return {document,w,location,navigation,requests,errors,confirmations,load,
  viewport(value){viewport.matches=value;viewport.listener?.()},
  failReads(value){readFailure=value},
  root:()=>document.querySelector('.native-list'),
  close(){for(const timer of timers)clearTimeout(timer);dom.window.close()}
 };
}
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5))}assert.ok(check(),'condition was not reached')}
async function headers(r){return (await r.load('native-table-headers.js?v=0.15.38')).namespace}
async function list(r){return (await r.load('native-list.js?v=0.15.38')).namespace}

test('arrow toggles asc/desc/asc, keeps independent conditions and resets page',async t=>{
 const r=runtime({url:'/admin/profiles?q=Alpha&c.title=Professor&source.news=1&size=50&page=4'});t.after(()=>r.close());
 const h=await headers(r),root=r.root();
 assert.equal(h.mountListHeaders(root),h.mountListHeaders(root));
 for(const expected of ['asc','desc','asc']){
  root.querySelector('[data-column-sort="name"]').click();
  const query=new URL(r.location.href).searchParams;
  assert.equal(query.get('direction'),expected);assert.equal(query.get('sort'),'name');
  assert.equal(query.get('q'),'Alpha');assert.equal(query.get('c.title'),'Professor');
  assert.equal(query.get('source.news'),'1');assert.equal(query.get('size'),'50');assert.equal(query.has('page'),false);
 }
 assert.equal(r.navigation.length,3);
});

test('text/boolean filters and clear affect only the selected column',async t=>{
 const r=runtime({url:'/admin/profiles?sort=name&direction=desc&f.is_active=1&size=20&page=3'});t.after(()=>r.close());await headers(r);
 r.root().querySelector('[data-column-popup="name"]').click();
 let pop=r.document.querySelector('[role="dialog"]');assert.ok(pop);
 pop.querySelector('input').value='Bravo';pop.querySelector('button').click();
 assert.equal(new URL(r.location.href).searchParams.get('c.name'),'Bravo');
 r.root().querySelector('[data-column-popup="is_active"]').click();
 pop=r.document.querySelector('[role="dialog"]');pop.querySelector('select').value='0';pop.querySelector('button').click();
 assert.equal(new URL(r.location.href).searchParams.get('f.is_active'),'0');
 r.root().querySelector('[data-column-popup="name"]').click();
 r.document.querySelector('[role="dialog"]').querySelectorAll('button')[1].click();
 const query=new URL(r.location.href).searchParams;
 assert.equal(query.has('c.name'),false);assert.equal(query.get('f.is_active'),'0');assert.equal(query.get('direction'),'desc');
});

test('fixed scope is not cleared; Escape closes and restores focus',async t=>{
 const r=runtime();t.after(()=>r.close());await headers(r);
 const button=r.root().querySelector('[data-column-popup="name"]');button.dataset.fixedValue='Alpha';button.click();
 const pop=r.document.querySelector('[role="dialog"]');
 assert.equal(pop.querySelector('input').disabled,true);assert.equal(pop.querySelectorAll('button')[1].disabled,true);
 r.document.dispatchEvent(new r.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(r.document.querySelector('[role="dialog"]'),null);assert.equal(r.document.activeElement,button);
 button.click();r.document.body.dispatchEvent(new r.w.Event('pointerdown',{bubbles:true}));
 assert.equal(r.document.querySelector('[role="dialog"]'),null);
});

test('optional column module failure does not block headers or mutations',async t=>{
 const r=runtime({fail:['native-columns.js']});t.after(()=>r.close());const m=await list(r),dispose=m.mountList(r.root());t.after(dispose);
 await until(()=>r.root().querySelector('[data-list-feature-failure="列设置"]'));
 assert.equal(r.root().dataset.listReady,'true');assert.equal(r.root().querySelector('[data-toggle-field]').disabled,false);
 r.root().querySelector('[data-column-popup="name"]').click();assert.ok(r.document.querySelector('[role="dialog"]'));
 assert.equal(r.root().querySelector('[data-list-load-status]').hidden,true);
});

test('optional media module failure is isolated from the list controller',async t=>{
 const r=runtime({fail:['native-media.js']});t.after(()=>r.close());
 const thumb=r.document.createElement('img');thumb.dataset.mediaThumb='test-only';r.root().append(thumb);
 const m=await list(r),dispose=m.mountList(r.root());t.after(dispose);
 await until(()=>r.root().querySelector('[data-list-feature-failure="媒体预览"]'));
 r.root().querySelector('[data-column-sort="name"]').click();assert.equal(r.navigation.length,1);
 assert.equal(r.root().querySelector('[data-toggle-field]').disabled,false);
});

test('core import failure retains independent headers, HTML search and links',async t=>{
 const r=runtime({fail:['native-list.js']});t.after(()=>r.close());await headers(r);
 await r.load('native.js?v=0.15.32');await until(()=>r.document.documentElement.dataset.nativeReady==='true');
 assert.equal(r.root().dataset.listReady,'failed');
 assert.equal(r.root().querySelector('.native-query button').disabled,false);
 assert.equal(r.root().querySelector('[data-delete]').disabled,true);
 assert.equal(r.root().querySelector('[data-list-load-status]').getAttribute('role'),'alert');
 r.root().querySelector('[data-column-sort="name"]').click();assert.equal(r.navigation.length,1);
 assert.ok(r.root().querySelector('a[href*="/edit"]'));
});

test('storage and canvas exceptions retain working columns and headers',async t=>{
 const r=runtime({storageFailure:true});t.after(()=>r.close());const m=await list(r),dispose=m.mountList(r.root());t.after(dispose);
 await until(()=>!r.root().querySelector('[data-column-controls]').disabled);
 r.root().querySelector('[data-columns-recommended]').click();
 assert.match(r.root().querySelector('[data-column-feedback]').textContent,/未能保存/);
 r.root().querySelector('[data-column-sort="name"]').click();assert.equal(r.navigation.length,1);
 assert.equal(r.root().querySelector('[data-list-feature-failure]'),null);
});

test('mount/dispose/remount attaches exactly one action listener',async t=>{
 const r=runtime();t.after(()=>r.close());const m=await list(r),root=r.root();
 const first=m.mountList(root);assert.equal(m.mountList(root),first);first();first();
 const second=m.mountList(root);t.after(second);assert.notEqual(second,first);
 const before=r.root();before.querySelector('[data-toggle-field]').click();
 await until(()=>r.root()!==before);
 assert.equal(r.requests.filter(item=>item.options.method==='POST').length,1);
 assert.equal(r.requests.filter(item=>!item.options.method).length,1);
});

test('repeated partial refresh retains query, draft, selection, focus, and single handlers',async t=>{
 const r=runtime();t.after(()=>r.close());const m=await list(r);m.mountList(r.root());
 for(let i=1;i<=3;i++){
  const before=r.root(),search=before.querySelector('#search'),selected=before.querySelector('[data-select-row]');
  search.value='未提交草稿';selected.checked=true;
  const button=before.querySelector('[data-toggle-field]');button.focus();button.click();
  await until(()=>r.root()!==before);
  assert.equal(r.requests.filter(item=>item.options.method==='POST').length,i);
  assert.equal(r.requests.filter(item=>!item.options.method).length,i);
  assert.equal(r.root().querySelector('#search').value,'未提交草稿');
  assert.equal(r.root().querySelector('[data-select-row]').checked,true);
  assert.ok(r.document.activeElement.matches('[data-toggle-field]'));
  assert.equal(new URL(r.location.href).searchParams.get('sort'),'name');
  r.root().querySelector('[data-column-popup="name"]').click();
  assert.equal(r.document.querySelectorAll('.native-popover').length,1);
  r.document.dispatchEvent(new r.w.KeyboardEvent('keydown',{key:'Escape'}));
 }
 m.mountList(r.root())();
});

test('failed follow-up read never replays a successful write; retry is read-only',async t=>{
 const r=runtime({readFailure:true});t.after(()=>r.close());const m=await list(r);m.mountList(r.root());
 const before=r.root();before.querySelector('[data-toggle-field]').click();
 await until(()=>before.dataset.listStale==='true');
 assert.equal(before.querySelector('[data-toggle-field]').disabled,true);
 assert.equal(r.requests.filter(item=>item.options.method==='POST').length,1);
 assert.match(r.document.querySelector('[data-notice-text]').textContent,/写操作不会自动重试/);
 r.failReads(false);
 r.document.querySelector('[data-notice-id="list-operation"] .toast-body button').click();
 await until(()=>r.root()!==before);
 assert.equal(r.requests.filter(item=>item.options.method==='POST').length,1);
 assert.equal(r.requests.filter(item=>!item.options.method).length,2);
 assert.equal(r.root().querySelector('[data-toggle-field]').disabled,false);
 m.mountList(r.root())();
});

for(const bulk of [false,true])test(`account deletion confirmation ${bulk?'batch':'single'} cancels without a request`,async t=>{
 const r=runtime({confirmResult:false});t.after(()=>r.close());
 r.root().dataset.deleteConfirm='删除账号会清除其主站登录会话，审计历史保留。确认删除？';
 (await list(r)).mountList(r.root());
 if(bulk){
  const boxes=[...r.root().querySelectorAll('[data-select-row]')];
  for(const box of boxes.slice(0,2)){box.checked=true;box.dispatchEvent(new r.w.Event('change',{bubbles:true}))}
  r.root().querySelector('[data-bulk-delete]').click();
 }else r.root().querySelector('[data-delete]').click();
 assert.equal(r.confirmations.length,1);
 assert.ok(r.confirmations[0].includes('主站登录会话'));
 if(bulk)assert.ok(r.confirmations[0].includes('已选 2 条'));
 assert.equal(r.requests.length,0);
});

test('grouped sidebar collapse, mobile drawer and Escape preserve focus',async t=>{
 const r=runtime();t.after(()=>r.close());await r.load('workspace.js');
 const shell=r.document.querySelector('[data-workspace]'),sidebar=r.document.querySelector('.workspace-sidebar'),pane=r.document.querySelector('.workspace-pane');
 assert.ok(r.document.querySelectorAll('.workspace-menu-title').length>=4);
 const toggle=r.document.querySelector('[data-sidebar-toggle]');toggle.click();
 assert.equal(shell.classList.contains('sidebar-collapsed'),true);assert.equal(toggle.getAttribute('aria-expanded'),'false');
 r.viewport(true);assert.equal(shell.classList.contains('sidebar-collapsed'),false);assert.equal(sidebar.inert,true);
 const opener=r.document.querySelector('[data-drawer-open]');opener.click();
 assert.equal(pane.inert,true);assert.equal(sidebar.inert,false);assert.equal(sidebar.getAttribute('aria-modal'),'true');
 assert.equal(r.document.activeElement,sidebar.querySelector('[data-drawer-close]'));
 shell.dispatchEvent(new r.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(r.document.activeElement,opener);assert.equal(pane.inert,false);assert.equal(sidebar.inert,true);
 r.viewport(false);assert.equal(shell.classList.contains('sidebar-collapsed'),true);assert.equal(sidebar.inert,false);
});

test('sidebar remains usable when preference storage is unavailable',async t=>{
 const r=runtime({storageFailure:true,mobile:true});t.after(()=>r.close());await r.load('workspace.js');
 r.document.querySelector('[data-drawer-open]').click();assert.equal(r.document.querySelector('.workspace-sidebar').inert,false);
 r.document.querySelector('.workspace-backdrop').click();assert.equal(r.document.querySelector('.workspace-sidebar').inert,true);
 r.viewport(false);r.document.querySelector('[data-sidebar-toggle]').click();
 assert.ok(r.document.querySelector('[data-workspace]').classList.contains('sidebar-collapsed'));
});

test('grouped navigation retains permission notice and keyboard focus return',async t=>{
 const r=runtime();t.after(()=>r.close());
 r.w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 r.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new r.w.Event('close'))};
 await r.load('native-access.js');
 const link=r.document.querySelector('.workspace-menu a');link.dataset.accessDenied='教师与团队';link.focus();link.click();
 assert.ok(r.document.querySelector('.native-access-dialog').textContent.includes('教师与团队'));
 r.document.querySelector('[data-access-close]').click();await until(()=>r.document.activeElement===link);
 assert.equal(r.document.querySelector('.native-access-dialog'),null);assert.equal(r.requests.length,0);
});


test('media size header edits KB but preserves byte query contract',async t=>{
 const r=runtime({media:true});t.after(()=>r.close());await headers(r);
 const button=r.root().querySelector('[data-column-popup="size"]');button.click();
 const input=r.document.querySelector('.native-popover input');input.value='1.5';
 r.document.querySelector('.native-popover .btn-primary').click();
 assert.equal(new URL(r.navigation[0]).searchParams.get('f.size'),'1536');
 button.click();assert.equal(r.document.querySelector('.native-popover input').value,'1.5');
});

test('cancelled permanent deletion sends preflight only',async t=>{
 const r=runtime({media:true,confirmResult:false});t.after(()=>r.close());const m=await list(r);m.mountList(r.root());
 r.root().querySelector('[data-media-purge]').click();
 await until(()=>r.confirmations.length===1&&r.root().getAttribute('aria-busy')!=='true');
 assert.match(r.confirmations[0],/不可撤销/);
 assert.deepEqual(r.requests.filter(v=>v.options.method==='POST').map(v=>JSON.parse(v.options.body).action),['purge-prepare']);
});

test('batch permanent deletion preflights every item before confirm, stops on failure',async t=>{
 const r=runtime({media:true,failPurge:true});t.after(()=>r.close());const m=await list(r);m.mountList(r.root());
 const root=r.root();root.querySelector('[data-select-all]').click();
 root.querySelector('[data-bulk-purge]').click();
 await until(()=>r.requests.some(v=>v.options.method!=='POST'));
 const writes=r.requests.filter(v=>v.options.method==='POST').map(v=>JSON.parse(v.options.body));
 assert.deepEqual(writes.map(v=>v.action),['purge-prepare','purge-prepare','purge-prepare','purge']);
 assert.ok(writes.slice(0,3).every(v=>v.immediate===undefined));
 assert.equal(writes[3].token,'synthetic-token');assert.match(r.confirmations[0],/不受保留期限制/);
});

test('corresponding author markers match complete names and render text safely',async t=>{
 const r=runtime();t.after(()=>r.close());const {authorMarkers,paintAuthorMarkers}=(await r.load('native-corresponding-authors.js')).namespace;
 const rows=authorMarkers('A Chen; 张三; Chen','a chen; 张三');
 assert.deepEqual(Array.from(rows,v=>v.corresponding),[true,true,false]);
 const host=r.document.createElement('div');paintAuthorMarkers(host,'A Chen; <img src=x>','A Chen; Other');
 assert.equal(host.querySelectorAll('sup').length,1);assert.equal(host.querySelector('img'),null);assert.match(host.textContent,/姓名待核对：Other/);
});

test('metadata draft fills empty correspondence, protects existing value and supports explicit replacement and undo',async t=>{
 const r=runtime();t.after(()=>r.close());const {createDraftReview}=(await r.load('native-draft-review.js')).namespace;
 const host=r.document.createElement('div');host.innerHTML='<form><div class="native-field"><input name="corresponding_authors"></div></form><section><div data-metadata-review><div data-review-source></div><div data-metadata-rows></div><button data-metadata-apply></button><button data-metadata-dismiss></button></div></section><p></p>';r.document.body.append(host);
 const form=host.querySelector('form'),root=host.querySelector('section'),feedback=host.querySelector('p'),input=form.elements.namedItem('corresponding_authors');let paints=0;
 const review=createDraftReview({form,root,labels:{corresponding_authors:'通讯作者'},sourceNames:['corresponding_authors'],generate:()=>paints++,citations:new Map()});
 const show=name=>review.show({corresponding_authors:name},{host,source:'OpenAlex',feedback,autoApply:true});
 show('A Chen');assert.equal(input.value,'A Chen');assert.equal(paints,1);
 form.querySelector('[data-metadata-undo-field]').click();assert.equal(input.value,'');
 input.value='Original';show('New');assert.equal(input.value,'Original');
 const check=root.querySelector('input[type=checkbox]');assert.equal(check.checked,false);check.checked=true;check.dispatchEvent(new r.w.Event('change'));root.querySelector('[data-metadata-apply]').click();assert.equal(input.value,'New');
 form.querySelector('[data-metadata-undo-field]').click();assert.equal(input.value,'Original');
});

test('single translation sends selected target version and keeps current filters',async t=>{
 const r=runtime();t.after(()=>r.close());const m=await list(r),root=r.root(),row=root.querySelector('tbody tr[data-uid]');
 const button=r.document.createElement('button');button.type='button';button.dataset.translateEntry='';button.dataset.translationUid='actual-target';button.dataset.translationStamp='actual-target-version';row.lastElementChild.append(button);m.mountList(root);button.click();
 await until(()=>r.requests.some(v=>v.options.method==='POST'));
 const request=r.requests.find(v=>v.options.method==='POST'),body=JSON.parse(request.options.body);
 assert.equal(body.target_uid,'actual-target');assert.equal(body.stamp,'actual-target-version');assert.equal(body._csrf,root.dataset.csrf);
 assert.match(request.url,new RegExp('/translation-groups/'+row.dataset.uid+'/translate\\?'));
 assert.equal(new URL(request.url,'http://local').searchParams.get('sort'),'name');
});

test('media KB cells use integers and a compact default width',async t=>{
 const r=runtime({media:true});t.after(()=>r.close());const m=await list(r);m.mountList(r.root());
 assert.equal(r.root().querySelector('td[data-column=size]').textContent.trim(),'2');
 await until(()=>r.root().querySelector('th[data-column=size]').style.width==='100px');
 assert.equal(r.root().querySelector('[data-purge-immediate]'),null);
});
