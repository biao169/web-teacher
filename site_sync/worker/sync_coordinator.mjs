// One alarm per site. D1 leases remain the source of truth; no payload storage.
import {paused} from './control.mjs';
import {RELEASE,frames} from './diagnostics.mjs';
export class Coordinator {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async next(){
    const row=await this.env.DB.prepare(`SELECT min(due) AS due,(SELECT max(lease_until) FROM sync_tasks) AS lease FROM (
      SELECT CASE WHEN status='running' THEN lease_until ELSE max(next_run_at,lease_until) END AS due
      FROM sync_tasks WHERE status='running' OR (status IN ('ready','waiting','cancel_requested') AND (phase!='await_confirmation' OR cancel_intent=1))
      UNION ALL SELECT next_run_at FROM sync_schedules WHERE enabled=1
    )`).first();
    return row?.due==null?null:Math.max(Number(row.due),Number(row.lease||0))*1000;
  }
  async control(){
    await this.ctx.storage.delete('failures');
    await this.ctx.storage.deleteAlarm();
    return this.wake();
  }
  async wake(){
    if(await paused(this.env)){await this.ctx.storage.deleteAlarm();return 'paused';}
    const due=await this.next();
    if(due===null){await this.ctx.storage.deleteAlarm();return 'idle';}
    const when=Math.max(Date.now()+10000,due),old=await this.ctx.storage.getAlarm();
    if(old===null||(!(await this.ctx.storage.get('failures'))&&when<old))await this.ctx.storage.setAlarm(when);
    return 'armed';
  }
  async alarm(){
    if(await paused(this.env)){await this.ctx.storage.deleteAlarm();return;}
    // Persist a recovery wake BEFORE crossing the service boundary.
    await this.ctx.storage.setAlarm(Date.now()+60000);
    try{
      const raw=await this.env.SYNC_RUNNER.sync_tick();
      const result=JSON.parse(raw);
      if(result.action==='disabled'){await this.ctx.storage.deleteAlarm();return;}
      await this.ctx.storage.delete('failures');
      if(await paused(this.env)){await this.ctx.storage.deleteAlarm();return;}
      const due=await this.next();
      if(due===null)await this.ctx.storage.deleteAlarm();
      else await this.ctx.storage.setAlarm(Math.max(Date.now()+10000,due));
    }catch(error){
      if(await paused(this.env)){await this.ctx.storage.deleteAlarm();return;}
      const failures=Math.min(12,(await this.ctx.storage.get('failures')||0)+1);
      await this.ctx.storage.put('failures',failures);
      await this.ctx.storage.setAlarm(Date.now()+Math.min(1800000,10000*2**Math.min(failures-1,8)));
      console.warn(JSON.stringify({component:'sync-coordinator',release:RELEASE,stage:'runner_callback',code:'SYNC_RPC_FAILED',failures,native_frames:frames(error)}));
    }
  }
}
