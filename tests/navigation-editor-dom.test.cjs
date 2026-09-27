const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const root=path.join(__dirname,'..');
const html=execFileSync(process.env.TEST_PYTHON||'python',['-c',`import sys,tempfile
from pathlib import Path
sys.path.insert(0,'tests')
from list_fixture import client_at
with tempfile.TemporaryDirectory() as d:
 c,r=client_at(Path(d))
 response=c.get('/admin/navigation_items/new')
 assert response.status_code==200,response.text
 print(response.text)
 c.close()
`],{cwd:root,encoding:'utf8',maxBuffer:4e6});
const source=fs.readFileSync(path.join(root,'frontend/admin/static/js/native-navigation.js'),'utf8');
async function setup({location='header',conditions=[],table='projects',delayed=false}={}){
 const dom=new JSDOM(html,{url:'https://teacher.test/admin/navigation_items/new'}),w=dom.window,d=w.document,form=d.querySelector('#native-editor');
 const cfg=d.querySelector('[data-navigation-config]'),config=JSON.parse(cfg.textContent);Object.assign(config,{table,conditions,lang:'en',can_preview:true});cfg.textContent=JSON.stringify(config);d.querySelector('#nav-target').value=table;
 const field=n=>form.elements.namedItem(n);field('location').value=location;field('kind').value='route';field('path').value=location==='admin-sidebar'?'/admin/projects':'/en/projects';field('title').value='My nav';
 const calls=[],pending=[],timers=new Set();
 const result=data=>data.action==='parse'?{table:'projects',conditions:[],lang:data.path.startsWith('/zh')?'zh':'en',path:data.path,can_preview:true}:{path:field('path').value,total:2,html:'<p>Public preview</p>'};
 const assist=async(_name,data)=>{calls.push(data);if(delayed)return new Promise(resolve=>pending.push({resolve,data}));return result(data)};
 const ctx=vm.createContext({document:d,MutationObserver:w.MutationObserver,Option:w.Option,TextEncoder,URLSearchParams,structuredClone,AbortController,Event:w.Event,crypto:require('node:crypto').webcrypto,btoa:w.btoa.bind(w),setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);timers.add(id);return id},clearTimeout:id=>{clearTimeout(id);timers.delete(id)}});
 const api=new vm.SyntheticModule(['assist'],function(){this.setExport('assist',assist)},{context:ctx});
 const help=new vm.SourceTextModule(fs.readFileSync(path.join(root,'frontend/admin/static/js/native-field-help.js'),'utf8'),{context:ctx});
 const m=new vm.SourceTextModule(source,{context:ctx});await m.link(s=>s.includes('native-assistance')?api:help);await m.evaluate();
 function change(control,value,type='change'){control.value=value;control.dispatchEvent(new w.Event(type,{bubbles:true}))}
 return {dom,d,field,calls,pending,change,close(){for(const id of timers)clearTimeout(id);w.close()}};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('front target selection retains placement and supports Chinese contains with ASCII stored path',async()=>{
 const x=await setup();try{
 x.change(x.d.querySelector('#nav-target'),'projects');assert.equal(x.field('location').value,'header');
 x.d.querySelector('[data-nav-add]').click();const row=x.d.querySelector('.native-nav-condition');assert.equal(row.querySelector('[data-nav-operator]').value,'contains');
 x.change(row.querySelector('[data-nav-condition-value]'),'人工智能','input');assert(/^[\x00-\x7f]*$/.test(x.field('path').value));assert.match(x.field('path').value,/^\/en\/projects\?nf=/);
 x.d.querySelector('[data-nav-preview]').click();await settle();const req=x.calls.at(-1);assert.equal(req.location,'header');assert.equal(req.conditions[0].value,'人工智能');assert.equal(req.conditions[0].operator,'contains');assert.match(x.d.querySelector('[data-nav-feedback]').textContent,/公开/);
 }finally{x.close()}
});
test('public fields exclude private project data, status is exact and condition removal restores plain link',async()=>{
 const x=await setup();try{x.d.querySelector('[data-nav-add]').click();let row=x.d.querySelector('.native-nav-condition'),select=row.querySelector('select');assert(![...select.options].some(o=>['amount','principal','members'].includes(o.value)));
 x.change(select,'status');row=x.d.querySelector('.native-nav-condition');assert.equal(row.querySelector('[data-nav-operator]').options.length,1);assert.equal(row.querySelector('[data-nav-operator]').value,'eq');
 x.change(row.querySelector('[data-nav-condition-value]'),'进行中','input');row.querySelector('[data-nav-remove]').click();assert.equal(x.field('path').value,'/en/projects');assert.equal(x.d.querySelectorAll('.native-nav-condition').length,0);
 }finally{x.close()}
});
test('reset preserves unrelated title and restores initial location and conditions',async()=>{
 const x=await setup({location:'footer',conditions:[{field:'name',operator:'eq',value:'初始'}]});try{
 x.change(x.field('location'),'hero');x.change(x.d.querySelector('[data-nav-condition-value]'),'修改','input');x.field('title').value='Keep title';x.d.querySelector('[data-nav-reset]').click();assert.equal(x.field('location').value,'footer');assert.equal(x.d.querySelector('[data-nav-condition-value]').value,'初始');assert.equal(x.d.querySelector('[data-nav-operator]').value,'eq');assert.equal(x.field('title').value,'Keep title');
 }finally{x.close()}
});
test('legacy sidebar sends the original equality payload',async()=>{
 const x=await setup({location:'admin-sidebar',conditions:[{field:'name',value:'原值'}]});try{
 assert.equal(x.d.querySelector('[data-nav-operator]').options.length,2);x.d.querySelector('[data-nav-preview]').click();await settle();const req=x.calls.at(-1);assert.equal(req.location,'admin-sidebar');assert.equal(req.conditions[0].value,'原值');assert.equal(Object.hasOwn(req.conditions[0],'operator'),false);assert(x.d.querySelector('[data-nav-pending]').hidden);
 }finally{x.close()}
});
test('stale preview cannot replace newer draft or survive a kind change',async()=>{
 const x=await setup({conditions:[{field:'name',operator:'contains',value:'old'}],delayed:true});try{
 x.d.querySelector('[data-nav-preview]').click();x.change(x.d.querySelector('[data-nav-condition-value]'),'new','input');const path=x.field('path').value;
 x.pending[0].resolve({path:'/stale',total:99,html:'STALE'});await settle();assert.equal(x.field('path').value,path);assert(!x.d.querySelector('[data-nav-results]').textContent.includes('STALE'));
 x.d.querySelector('[data-nav-preview]').click();x.change(x.field('kind'),'external');x.pending[1].resolve({path:'/wrong',total:5,html:'WRONG'});await settle();assert.equal(x.field('path').value,path);assert(!x.d.querySelector('[data-nav-results]').textContent.includes('WRONG'));
 }finally{x.close()}
});
test('switching location retains valid contains condition',async()=>{
 const x=await setup({conditions:[{field:'name',operator:'contains',value:'词'}]});try{x.change(x.field('location'),'admin-sidebar');assert(x.d.querySelector('[data-nav-operator]').checkValidity());assert.match(x.field('path').value,/c.name=/);x.change(x.d.querySelector('[data-nav-operator]'),'eq');assert(x.d.querySelector('[data-nav-operator]').checkValidity());assert.match(x.field('path').value,/f.name=/)}finally{x.close()}
});
test('preset selection keeps footer placement and reads public target',async()=>{
 const x=await setup({location:'footer',table:''});try{x.change(x.d.querySelector('#nav-route-preset'),'/zh/projects');await settle();await settle();assert.equal(x.field('location').value,'footer');assert.equal(x.d.querySelector('#nav-target').value,'projects');assert.equal(x.calls[0].action,'parse');assert.equal(x.calls[0].location,'footer');assert(x.field('path').value.startsWith('/zh/projects'))}finally{x.close()}
});

test('backend selector explicitly switches destination, supports contains, and frontend selector switches back',async()=>{
 const x=await setup({location:'footer'});try{
 assert.equal(x.d.querySelector('label[for="nav-route-preset"]').textContent,'前台界面');
 assert.equal(x.d.querySelector('label[for="nav-admin-target"]').textContent,'后台界面');
 x.change(x.d.querySelector('#nav-admin-target'),'projects');
 assert.equal(x.field('location').value,'admin-sidebar');assert.equal(x.d.querySelector('#nav-route-preset').value,'');
 x.d.querySelector('[data-nav-add]').click();let row=x.d.querySelector('.native-nav-condition');
 x.change(row.querySelector('select'),'name');row=x.d.querySelector('.native-nav-condition');
 x.change(row.querySelector('[data-nav-operator]'),'contains');x.change(row.querySelector('[data-nav-condition-value]'),'机械','input');
 assert.match(x.field('path').value,/^\/admin\/projects\?c.name=/);assert(/^[\x00-\x7f]*$/.test(x.field('path').value));
 x.d.querySelector('[data-nav-preview]').click();await settle();assert.equal(x.calls.at(-1).conditions[0].operator,'contains');
 x.change(x.d.querySelector('#nav-route-preset'),'/zh/projects');await settle();await settle();
 assert.equal(x.field('location').value,'header');assert.equal(x.d.querySelector('#nav-admin-target').value,'');
 assert.equal(x.field('path').value,'/zh/projects');
 x.d.querySelector('[data-nav-reset]').click();assert.equal(x.field('location').value,'footer');assert.equal(x.d.querySelector('#nav-admin-target').value,'');
 }finally{x.close()}
});
