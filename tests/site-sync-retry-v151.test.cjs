const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('frontend/admin/static/js/native-site-sync.js','utf8');
const body=source.slice(source.indexOf(' async function api('),source.indexOf(' async function run(fn)'));
function make(request,waitFor){return new Function('request','waitFor','status','notify','checkpoint','report',`const retryCodes=new Set(['sync_timeout']),retrySeconds=[0,0,0],paced=new Set(['advance']);let pause=false;${body};return api;`)(request,waitFor,{},()=>{},()=>{},()=>{});}
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
