import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Coordinator} from './sync_coordinator.mjs';
function fixture(result={action:'stepped'},due=Date.now()/1000+10){
 let alarm=null;const data=new Map(),calls=[];
 const storage={getAlarm:async()=>alarm,setAlarm:async t=>{alarm=t;calls.push(t);},deleteAlarm:async()=>{alarm=null;},get:async k=>data.get(k),put:async(k,v)=>data.set(k,v),delete:async k=>data.delete(k)};
 const env={DB:{prepare:()=>({first:async()=>({due,lease:0}),bind:()=>({first:async()=>null})})},SYNC_RUNNER:{sync_tick:async()=>{assert.ok(alarm);if(result instanceof Error)throw result;return JSON.stringify(result);}}};
 return {c:new Coordinator({storage},env),storage,data,calls,get alarm(){return alarm;}};
}
test('successful alarm prearms recovery and schedules next task',async()=>{const f=fixture();await f.c.alarm();assert.equal(f.calls.length,2);assert.ok(f.alarm>=Date.now()+9000);});
test('failed RPC keeps durable retries bounded and Cron does not shorten backoff',async()=>{const f=fixture(Error('1102'));f.data.set('failures',11);const now=Date.now();await f.c.alarm();assert.ok(f.alarm<=Date.now()+1800000);assert.ok(f.alarm>=now+1800000);const alarm=f.alarm;await f.c.wake();assert.equal(f.alarm,alarm);});
test('no pending work and emergency pause remove alarms',async()=>{for(const f of [fixture({},null),fixture({action:'disabled'})]){await f.c.alarm();assert.equal(f.alarm,null);}});

test('persistent pause deletes alarms before contacting runner; resume clears failure backoff',async()=>{
 const f=fixture();let stopped=true,calls=0;
 f.c.env.DB.prepare=()=>({bind:()=>({first:async()=>({value:stopped?'1':'0'})}),first:async()=>({due:Date.now()/1000,lease:0})});
 f.c.env.SYNC_RUNNER.sync_tick=async()=>{calls++;return '{"action":"idle"}';};
 f.data.set('failures',9);await f.storage.setAlarm(Date.now()+1800000);
 await f.c.wake();assert.equal(f.alarm,null);
 await f.c.alarm();assert.equal(calls,0);assert.equal(f.alarm,null);
 stopped=false;await f.c.control();assert.equal(f.data.has('failures'),false);assert.ok(f.alarm<Date.now()+12000);
});
test('pause during runner execution prevents rearming on success and failure',async()=>{
 for(const fail of [false,true]){
  const f=fixture();let stopped=false;
  f.c.env.DB.prepare=()=>({bind:()=>({first:async()=>({value:stopped?'1':'0'})})});
  f.c.env.SYNC_RUNNER.sync_tick=async()=>{stopped=true;if(fail)throw Error('terminated');return '{"action":"stepped"}';};
  await f.c.alarm();assert.equal(f.alarm,null);
 }
});
