import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Coordinator} from './sync_coordinator.mjs';
function fixture(result={action:'stepped'},due=Date.now()/1000+10){
 let alarm=null;const data=new Map(),calls=[];
 const storage={getAlarm:async()=>alarm,setAlarm:async t=>{alarm=t;calls.push(t);},deleteAlarm:async()=>{alarm=null;},get:async k=>data.get(k),put:async(k,v)=>data.set(k,v),delete:async k=>data.delete(k)};
 const env={DB:{prepare:()=>({first:async()=>({due,lease:0})})},SYNC_RUNNER:{sync_tick:async()=>{assert.ok(alarm);if(result instanceof Error)throw result;return JSON.stringify(result);}}};
 return {c:new Coordinator({storage},env),storage,data,calls,get alarm(){return alarm;}};
}
test('successful alarm prearms recovery and schedules next task',async()=>{const f=fixture();await f.c.alarm();assert.equal(f.calls.length,2);assert.ok(f.alarm>=Date.now()+9000);});
test('failed RPC keeps durable retries bounded and Cron does not shorten backoff',async()=>{const f=fixture(Error('1102'));f.data.set('failures',11);const now=Date.now();await f.c.alarm();assert.ok(f.alarm<=Date.now()+1800000);assert.ok(f.alarm>=now+1800000);const alarm=f.alarm;await f.c.wake();assert.equal(f.alarm,alarm);});
test('no pending work and emergency pause remove alarms',async()=>{for(const f of [fixture({},null),fixture({action:'disabled'})]){await f.c.alarm();assert.equal(f.alarm,null);}});
