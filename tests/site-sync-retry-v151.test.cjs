const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('frontend/admin/static/js/native-site-sync.js','utf8');
test('successful resource-limited steps pace the next request using the server interval',async()=>{
 const code=source.slice(source.indexOf(' async function request('),source.indexOf(' const retrySeconds='));
 let at=0;const waits=[],calls=[];
 const request=new Function('adminFetch','Date','waitFor','checkpoint','root','rayText',`const paced=new Set(['advance']),intervalMs=1000;let nextBatchAt=0,pause=false;${code};return request;`)(
  async()=>{calls.push(at);return {ok:true,json:async()=>({request_interval_ms:15000})}},
  {now:()=>at},async ms=>{waits.push(ms);at+=ms},()=>{},{dataset:{csrf:'token'}},()=>''
 );
 await request('advance',{uid:'t'});await request('get',{uid:'t'});await request('advance',{uid:'t'});
 assert.deepEqual(waits,[15000]);assert.deepEqual(calls,[0,0,15000]);
});
const body=source.slice(source.indexOf(' async function api('),source.indexOf(' async function run(fn)'));
function make(request,waitFor){return new Function('request','waitFor','status','notify','checkpoint','report',`const retryCodes=new Set(['sync_timeout']),retrySeconds=[0,0,0],retryLimit=3,paced=new Set(['advance']);let pause=false;${body};return api;`)(request,waitFor,{},()=>{},()=>{},()=>{});}
test('reads checkpoint once then waits until server deadline without polling',async()=>{
 const calls=[],delays=[];let count=0;const until=Date.now()+600000;
 const api=make(async action=>{calls.push(action);if(action==='get')return {work:{status:'paused',retryable:true,retry_after:new Date(until).toISOString()}};if(!count++)throw Object.assign(new Error('wait'),{code:'sync_retry_wait'});return {ok:true}},async ms=>{delays.push(ms);assert.deepEqual(calls,['advance','get'])});
 assert.deepEqual(await api('advance',{uid:'t'}),{ok:true});assert.deepEqual(calls,['advance','get','advance']);assert(delays[0]>599000);
});
test('permanent paused checkpoint stops automatic replay',async()=>{
 const calls=[];const api=make(async action=>{calls.push(action);if(action==='get')return {work:{status:'paused',retryable:false}};throw Object.assign(new Error('timeout'),{code:'sync_timeout'})},async()=>assert.fail('must not wait or retry'));
 await assert.rejects(api('advance',{uid:'t'}));assert.deepEqual(calls,['advance','get']);
});
test('lost response uses the persisted running recovery deadline',async()=>{
 let n=0;const until=Date.now()+300000;const delays=[];
 const api=make(async action=>{if(action==='get')return {work:{status:'running',recover_after:new Date(until).toISOString()}};if(!n++)throw Object.assign(new Error('unavailable'),{httpStatus:503});return {}},async ms=>delays.push(ms));
 await api('advance',{uid:'t'});assert(delays[0]>299000);
});
for(const code of [1101,'1101',1102,'1102'])test(String(code)+' '+typeof code+' reads durable checkpoint before bounded retry',async()=>{
 let calls=[],attempt=0;const until=Date.now()+300000;
 const api=make(async action=>{calls.push(action);if(action==='get')return {work:{status:'running',recover_after:new Date(until).toISOString()}};if(!attempt++)throw Object.assign(new Error('terminated'),{httpStatus:503,code});return {ok:true}},async ms=>assert(ms>299000));
 assert.deepEqual(await api('advance',{uid:'t'}),{ok:true});assert.deepEqual(calls,['advance','get','advance']);
});
test('1102 never replays an action outside the checkpoint protocol',async()=>{
 let calls=0;const api=make(async()=>{calls++;throw Object.assign(new Error('terminated'),{httpStatus:503,code:'1102'})},async()=>assert.fail());
 await assert.rejects(api('start',{}));assert.equal(calls,1);
});

test('persisted progress continues beyond three browser recoveries',async()=>{
 let count=0,reads=0;
 const api=make(async action=>{
  if(action==='get'){reads++;return {work:{status:'paused',retryable:true,checkpoint:'saved-'+count},policy:{no_progress_retry_limit:8}}}
  if(++count<=40)throw Object.assign(new Error('temporary'),{code:'sync_timeout'});
  return {done:true};
 },async()=>{});
 assert.deepEqual(await api('advance',{uid:'same'}),{done:true});assert.equal(reads,40);
});
test('unchanged checkpoint cannot refill browser recovery budget',async()=>{
 let count=0;
 const api=make(async action=>{
  if(action==='get')return {work:{status:'running',checkpoint:'same'},policy:{no_progress_retry_limit:8}};
  count++;throw Object.assign(new Error('temporary'),{httpStatus:503});
 },async()=>{});
 await assert.rejects(api('advance',{uid:'same'}));assert.equal(count,9);
});

test('first retry honors server evidence of committed progress',async()=>{
 let attempt=0;const messages=[];
 const api=make(async action=>{
  if(action==='get')return {work:{status:'paused',retryable:true,retry_count:0,last_outcome:'progress_after_error',checkpoint:'saved'},policy:{no_progress_retry_limit:0}};
  if(!attempt++)throw Object.assign(new Error('interrupted'),{code:'1101'});
  return {done:true};
 },async()=>{});
 assert.deepEqual(await api('advance',{uid:'same'}),{done:true});
});

const monitorState=new Function(source.slice(source.indexOf(' function monitorState('),source.indexOf(' function monitorControls('))+';return monitorState;')();
for(const phase of ['done','cancelled'])test('unconfirmed '+phase+' stays pending in monitor',()=>{
 assert.deepEqual(monitorState({execution_phase:phase,work_status:'running',recover_after:'2099-01-01T00:00:00Z'},Date.now()),['等待完成回执','warning']);
 assert.deepEqual(monitorState({execution_phase:phase,work_status:'running'},Date.now()),['回执逾期 · 待核对','warning']);
});
