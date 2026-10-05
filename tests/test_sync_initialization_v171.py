"""Diagnostic boundaries survive resource loss without changing sync decisions."""
import asyncio,json
from unittest.mock import AsyncMock
import pytest
from backend.app.native import site_sync_initialization as init,site_sync_dispatch as dispatch,site_sync_schedule as schedule,site_sync_work as work
from backend.app.native.site_sync_gate import load
from tests.test_site_sync_v121 import pair
from tests.test_sync_grant_errors_v169 import seed
from tests.test_sync_dispatch_v170 import saved,expire
run=asyncio.run

def test_timeline_is_bounded_isolated_and_noop_without_context():
 async def execute():
  await init.advance('authorization')  # HTTP/manual callers do not write diagnostics.
  async def one(name):
   receipt={};timeline=init.Timeline(receipt);written=[]
   async def save():
    written.append(json.loads(json.dumps(receipt)));await asyncio.sleep(0);return True
   with init.recording(timeline,save):
    await init.advance(name)
    await init.advance(name)  # adjacent duplicates do not add a write
    timeline.finish('completed')
   return receipt,written
  a,b=await asyncio.gather(one('resource_modules'),one('authorization'))
  assert len(a[1])==len(b[1])==1
  assert a[0]['initialization']['stages'][0]['phase']=='resource_modules'
  assert b[0]['initialization']['stages'][0]['phase']=='authorization'
  assert all(x[0]['initialization']['stages'][0]['elapsed_ms']>=0 for x in (a,b))
  receipt={};timeline=init.Timeline(receipt);save=AsyncMock(return_value=True)
  with init.recording(timeline,save):
   for _ in range(20):
    await init.advance('resource_modules');await init.advance('authorization')
  assert len(timeline.value['stages'])==init.MAX_STAGES and save.await_count==init.MAX_STAGES
 run(execute())


def test_business_timeline_preserves_real_progress_and_previous_summary(pair):
 api,_,r,*_=pair;uid=seed(api,r)
 execute=lambda selected:schedule.tick(r,prune_history=False,dispatch_uid=selected)
 before=run(work.position(r.sql,uid))['work']['attempt']
 assert run(dispatch.run(r.sql,execute,kind=r.kind))['status']=='ok'
 receipt=saved(r,uid);trace=receipt['initialization'];rows=trace['stages']
 assert [x['phase'] for x in rows]==['receipt_reconcile','dispatch','authorization','execution_lease','business_step','receipt_save']
 assert all(x['status']=='completed' and x['elapsed_ms']>=0 for x in rows)
 assert trace['elapsed_ms']>=0 and trace['record_write_ms']>=0
 assert run(work.position(r.sql,uid))['work']['attempt']>before
 run(dispatch.run(r.sql,execute,kind=r.kind))
 previous=saved(r,uid)['previous_initialization']
 assert previous['last_stage']['phase']=='receipt_save' and 'stages' not in previous


def test_revocation_remains_permanent_and_points_to_authorization(pair):
 api,_,r,*_=pair;uid=seed(api,r)
 grant=run(load(r.sql,'site-sync:manual:'+uid))
 run(r.sql.batch([('UPDATE auth_roles SET is_active=0 WHERE uid=?',(grant['owner']['role_uid'],))]))
 before=run(work.position(r.sql,uid))
 result=run(dispatch.run(r.sql,lambda selected:schedule.tick(r,prune_history=False,dispatch_uid=selected),kind=r.kind))
 assert result['status']=='paused'
 last=saved(r,uid)['initialization']['stages'][-1]
 assert last['phase']=='authorization' and last['status']=='failed'
 assert not run(load(r.sql,'site-sync:manual:'+uid))['enabled']
 assert run(work.position(r.sql,uid))==before


def test_failed_diagnostic_write_does_not_revoke_grant(pair,monkeypatch):
 api,_,r,*_=pair;uid=seed(api,r);before=run(work.position(r.sql,uid));original=r.sql.batch;injected=[]
 async def fail_once(statements):
  statement,args=statements[0]
  if statement.startswith('UPDATE service_meta SET value=') and args[1]==dispatch.PREFIX+uid:
   rows=json.loads(args[0]).get('initialization',{}).get('stages',[])
   if rows and rows[-1]['phase']=='authorization' and not injected:
    injected.append(True);raise RuntimeError('PRIVATE connection detail')
  return await original(statements)
 monkeypatch.setattr(r.sql,'batch',fail_once)
 result=run(dispatch.run(r.sql,lambda selected:schedule.tick(r,prune_history=False,dispatch_uid=selected),kind=r.kind))
 assert injected and result['status']=='paused'
 assert run(load(r.sql,'site-sync:manual:'+uid))['enabled']
 assert run(work.position(r.sql,uid))==before
 receipt=saved(r,uid)
 assert receipt['retryable'] and receipt['initialization']['stages'][-1]['phase']=='authorization'
 assert 'PRIVATE' not in json.dumps(receipt)


def test_stage_receipt_cas_loss_stops_before_further_business(pair,monkeypatch):
 api,_,r,*_=pair;uid=seed(api,r);original=r.sql.batch;before=run(work.position(r.sql,uid));changed=[]
 async def race(statements):
  statement,args=statements[0]
  if statement.startswith('UPDATE service_meta SET value=') and args[1]==dispatch.PREFIX+uid:
   rows=json.loads(args[0]).get('initialization',{}).get('stages',[])
   if rows and rows[-1]['phase']=='authorization' and not changed:
    changed.append(True)
    await original([dispatch.put(dispatch.PREFIX+uid,{'token':'new-owner'})])
  return await original(statements)
 monkeypatch.setattr(r.sql,'batch',race)
 result=run(dispatch.run(r.sql,lambda selected:schedule.tick(r,prune_history=False,dispatch_uid=selected),kind=r.kind))
 assert result=={'skipped':'busy'} and changed
 assert saved(r,uid)=={'token':'new-owner'}
 assert run(work.position(r.sql,uid))==before
 assert run(load(r.sql,'site-sync:manual:'+uid))['enabled']


def test_forced_termination_keeps_running_phase_without_fabricated_duration(pair):
 class Terminated(BaseException):pass
 api,_,r,*_=pair;uid=seed(api,r)
 async def execute(selected):
  await init.advance('resource_factory')
  raise Terminated()
 with pytest.raises(Terminated):run(dispatch.run(r.sql,execute,kind='worker'))
 trace=saved(r,uid)['initialization'];last=trace['stages'][-1]
 assert last['phase']=='resource_factory' and last['status']=='running'
 assert 'elapsed_ms' not in last and 'finished_at' not in last
 expire(r,uid)
 async def success(selected):
  await init.advance('resource_factory');return {'status':'ok'}
 run(dispatch.run(r.sql,success,kind='worker'))
 assert saved(r,uid)['previous_initialization']['last_stage']==last

def test_stage_elapsed_excludes_acknowledged_marker_writes(monkeypatch):
 clock=[100.0];monkeypatch.setattr(init.time,'monotonic',lambda:clock[0])
 async def execute():
  receipt={};timeline=init.Timeline(receipt)
  async def save():clock[0]+=5;return True
  with init.recording(timeline,save):
   await init.advance('resource_modules');clock[0]+=2
   await init.advance('authorization');clock[0]+=3
   timeline.finish('completed')
  assert [x['elapsed_ms'] for x in timeline.value['stages']]==[2000,3000]
  assert timeline.value['record_write_ms']==10000
  assert timeline.value['elapsed_ms']==15000
 run(execute())
