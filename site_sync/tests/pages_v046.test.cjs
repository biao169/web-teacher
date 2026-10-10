const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const fixture=JSON.parse(fs.readFileSync(process.env.SYNC_UI_FIXTURE,'utf8'));
const source=n=>fs.readFileSync('site_sync/frontend/static/'+n,'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const settle=()=>new Promise(r=>setTimeout(r,15));
async function setup(page,monitor={}){
 const dom=new JSDOM(fixture.pages[page],{url:'https://site.example/admin/site-sync?section='+page,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
 const timers=[],originalTimer=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>ms===60000?(timers.push(fn),timers.length):originalTimer(fn,ms);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.AbortSignal.timeout=()=>undefined;w.notify=()=>{};
 let fail=false;
 w.fetch=async(url,options={})=>{
  calls.push({url:String(url),options});let value={};
  if(String(url).endsWith('/options'))value=fixture.options;
  else if(String(url).includes('/status-summary?'))value={items:monitor.items||[],cursor:null,server_time:100};
  else if(String(url).endsWith('/detail'))value=monitor.detail||{};
  else if(String(url).endsWith('/logs')||String(url).includes('/items'))value={items:[],cursor:null};
  else if(String(url).endsWith('/schedules')&&!options.body)value={items:[],cursor:null,server_time:100};
  else if(String(url).includes('/proposals'))value={items:[]};
  else if(String(url).includes('/retry-policy'))value={fast_retry_seconds:10};
  else if(String(url).includes('/credentials'))value=options.body?{source:'database'}:{source:'environment'};
  else if(String(url).endsWith('/tasks'))value={task_id:'a'.repeat(32)};
  else if(String(url).endsWith('/proposal'))value={task_id:'b'.repeat(32),approval_required:true};
  else if(String(url).endsWith('/connectivity'))value={ok:true,connectivity_ok:true,authorization_ok:false,message:'连接正常，缺少授权',steps:[{stage:'peer_authorization',missing_scope_details:[{label:'权限',scope:'restore_auth_permissions'}]}]};
  if(monitor.failDetail&&String(url).endsWith('/detail'))return {ok:false,status:503,text:async()=>JSON.stringify({error:'Injected detail failure',request_id:'d'.repeat(32)}),headers:new Headers()};
  if(fail&&options.body)value={error:'对端缺少授权：权限',code:'SYNC_PEER_SCOPE_MISSING',request_id:'c'.repeat(32)};
  return {ok:!(fail&&options.body),status:fail&&options.body?409:200,text:async()=>JSON.stringify(value),json:async()=>value,headers:new Headers()};
 };
 const context=dom.getInternalVMContext();
 vm.runInContext(source('model.mjs'),context);
 vm.runInContext(source('status-poller.mjs'),context);
 vm.runInContext(source('feedback.mjs'),context);
 vm.runInContext(source('panel.mjs'),context);
 if(['connection','settings','create'].includes(page)){
  // Modules normally have separate scopes.
  vm.runInContext('(()=>{'+source('proposal-client.mjs')+';'+source('proposal-ui.mjs')+';window.installProposal=installProposal;})()',context);
  vm.runInContext('(()=>{'+source('connection.mjs')+'})()',context);
 }
 if(page==='connection')vm.runInContext('(()=>{'+source('credentials.mjs')+'})()',context);
 await settle();
 return {w,dom,calls,timers,fail(){fail=true;},close(){dom.window.close();}};
}
for(const page of Object.keys(fixture.pages))test('independent '+page+' initializes without hidden page requests',async()=>{
 const s=await setup(page);try{
  const d=s.w.document;
  assert.equal(d.querySelector('[data-sync-operation]').open,false,d.querySelector('[data-operation-log]').textContent);
  assert.equal(s.calls.some(c=>c.url.includes('/status-summary?')),page==='tasks');
  assert.equal(s.calls.some(c=>c.url.endsWith('/schedules')),page==='schedules');
  if(['create','schedules'].includes(page))assert.equal(d.querySelectorAll('[name=scope]').length,20);
  assert.equal(d.querySelector('#sync-control'),null);
  if(['tasks','schedules'].includes(page)){d.querySelector('[data-auto-refresh]').click();assert.equal(d.querySelector('[data-auto-refresh]').getAttribute('aria-pressed'),'false');}
 }finally{s.close();}
});
test('manual task success and authorization failure show modal with task or request ID',async()=>{
 const s=await setup('create');try{
  const d=s.w.document,f=d.querySelector('[data-create]'),check=f.querySelector('[name=scope]');
  check.checked=true;check.dispatchEvent(new s.w.Event('change'));
  f.dispatchEvent(new s.w.Event('submit',{cancelable:true}));await settle();
  assert.equal(d.querySelector('[data-sync-operation]').open,true);
  assert.match(d.querySelector('[data-operation-log]').textContent,/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
  d.querySelector('[data-operation-close]').click();s.fail();
  f.dispatchEvent(new s.w.Event('submit',{cancelable:true}));await settle();
  assert.match(d.querySelector('[data-operation-log]').textContent,/SYNC_PEER_SCOPE_MISSING/);
  assert.match(d.querySelector('[data-operation-log]').textContent,/cccccccc/);
 }finally{s.close();}
});
test('probe displays authorization warning independently of connection success',async()=>{
 const s=await setup('connection');try{
  const d=s.w.document;await d.querySelector('[data-sync-probe]').onclick();
  assert.match(d.querySelector('[data-operation-log]').textContent,/restore_auth_permissions/);
  assert.equal(d.querySelector('[data-sync-probe]').disabled,false);
 }finally{s.close();}
});
test('key generation and save never place key in operation log',async()=>{
 const s=await setup('connection');try{
  const d=s.w.document;d.querySelector('[data-key-generate]').click();
  const key=d.querySelector('[name=sync_key]').value;assert.equal(key.length,64);
  assert.ok(!d.querySelector('[data-operation-log]').textContent.includes(key));
  d.querySelector('[data-operation-close]').click();
  d.querySelector('#sync-credentials').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await settle();
  assert.match(d.querySelector('[data-operation-log]').textContent,/已保存并生效/);
  assert.ok(!d.querySelector('[data-operation-log]').textContent.includes(key));
 }finally{s.close();}
});
test('shared confirmation cancel sends no mutation and renders text only',async()=>{
 const s=await setup('tasks');try{
  const d=s.w.document;
  const result=vm.runInContext("confirmAction('<img src=x onerror=alert(1)>')",s.dom.getInternalVMContext());
  assert.equal(d.querySelector('[data-operation-log] img'),null);
  d.querySelector('[data-operation-close]').click();assert.equal(await result,false);
  assert.equal(s.calls.filter(c=>c.options.body).length,0);
 }finally{s.close();}
});
test('push and schedule submission use the same result dialog',async()=>{
 for(const page of ['create','schedules']){
  const s=await setup(page);try{
   const d=s.w.document,form=d.querySelector(page==='create'?'[data-create]':'[data-schedule]');
   form.querySelector('[name=scope]').checked=true;
   if(page==='create')d.querySelector('[data-proposal]').click();
   else form.dispatchEvent(new s.w.Event('submit',{cancelable:true}));
   await settle();
   assert.equal(d.querySelector('[data-sync-operation]').open,true);
   assert.match(d.querySelector('[data-operation-log]').textContent,page==='create'?/对端任务 bbbbbbbb/:/服务端已接受/);
   const request=s.calls.find(c=>c.options.body&&c.url.endsWith(page==='create'?'/proposal':'/schedules'));
   assert.ok(request);
   assert.equal(JSON.parse(request.options.body).scope.length,1);
  }finally{s.close();}
 }
});

function terminalFixture(){
 const task={task_id:'e'.repeat(32),peer_id:'peer',status:'done',phase:'done',mode:'scheduled',auto_confirm:1,scope_json:'["restore_profiles","restore_media_assets"]',progress_seq:37,total_errors:46,no_progress_count:0,created_at:1,last_dispatched_at:1791460482,last_progress_at:1791460482,next_run_at:0,lease_until:0,fast_retries:30,slice_bytes:32768,initial_slice_bytes:32768,min_slice_bytes:4096,slow_retry_seconds:900,auto_shrink:1};
 const history={kind:'error',phase:'cleanup',progress_seq:36,occurred_at:100,recovered:true,detail:{error:'JsException',diagnostic:{error_category:'exception'}}};
 return {items:[task],detail:{task,server_time:1791461000,execution:{terminal:true,status:'completed',phase:'completed',progress_seq:37,historical_error:history,last_work_checkpoint:{phase:'cleanup',table:0,after:''}},media:{committed:2279934,total:2279934},body:{committed:5457,total:5457},counts:[],current:[],offsets:[],files:[],diagnostic_events:[history],clone:{phase:'done',label:'已完成',completed_tables:2,total_tables:2,storage:'service_meta'},retry_policy:{fast_retry_seconds:10}}};
}
test('completed detail separates history; polling only requests summary even when expanded',async()=>{
 const f=await setup('tasks',terminalFixture());try{
  const button=[...f.w.document.querySelectorAll('[data-tasks] button')].find(x=>x.textContent.includes('展开'));button.click();await settle();
  assert.match(f.w.document.querySelector('[data-current-state]').textContent,/completed.*37/);
  assert.match(f.w.document.querySelector('[data-progress]').textContent,/历史错误.*已恢复：是/);
  assert.match(f.w.document.querySelector('[data-checkpoint]').textContent,/最后工作断点（历史）/);
  assert.equal(f.w.document.querySelector('[data-error]').textContent,'');
  const start=f.calls.length;await f.timers.pop()();await settle();
  assert.deepEqual(f.calls.slice(start).map(x=>new URL(x.url).pathname),['/admin/site-sync/api/status-summary']);
 }finally{f.close();}
});
test('detail 503 is local to details and does not stop summary refresh',async()=>{
 const f=await setup('tasks',{...terminalFixture(),failDetail:true});try{
  [...f.w.document.querySelectorAll('[data-tasks] button')].find(x=>x.textContent.includes('展开')).click();await settle();
  assert.match(f.w.document.querySelector('[data-detail-error]').textContent,/detail.*503/);
  assert.doesNotMatch(f.w.document.querySelector('[data-message]').textContent,/503/);
  f.w.document.querySelector('dialog[open]')?.close();
  const start=f.calls.length;await f.timers.pop()();await settle();
  assert.deepEqual(f.calls.slice(start).map(x=>new URL(x.url).pathname),['/admin/site-sync/api/status-summary']);
 }finally{f.close();}
});
test('schedule origin appears only when supplied and remains text',async()=>{
 for(const source of [undefined,'hourly-pull','<img src=x onerror=alert(1)>']){
  const monitor=terminalFixture();if(source)monitor.items[0].source_schedule_id=source;
  const f=await setup('tasks',monitor);try{
   const cell=f.w.document.querySelector('[data-tasks] .sync-id');
   if(source)assert.ok(cell.textContent.includes('来源定时任务：'+source));else assert.ok(!cell.textContent.includes('来源'));
   assert.equal(cell.querySelector('img'),null);
  }finally{f.close();}
 }
});
