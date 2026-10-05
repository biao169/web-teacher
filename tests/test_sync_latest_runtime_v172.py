"""Latest-only Worker continuation: no general resources, same candidates/guards."""
import asyncio,json,subprocess,sys
from types import ModuleType
from unittest.mock import Mock
import pytest
from deploy.cloudflare.tests.test_startup_lazy import entry
from tests.test_site_sync_v121 import pair
from tests.test_sync_platform_v131 import pair as platform_pair,local_pair
from tests.test_site_sync_v123 import enable
from backend.app.native import site_sync_schedule as schedule,site_sync_tasks as tasks,site_sync_latest_runtime as latest,site_sync_latest_gate as gate,site_sync_manual as manual,site_sync_work as work
from backend.app.native.site_sync_gate import load
from backend.app.native.catalog import Error,now
run=asyncio.run

def seed(api,r,manual_grant=True):
 enable(api,auto=True)
 context=run(schedule.context(r,run(load(r.sql))))
 uid=run(tasks.start(context,'pull',['students'],lightweight=True,latest_only=True,manual=manual_grant))['uid']
 if not manual_grant:run(r.sql.batch([schedule.put(schedule.STATE,{'preview_uid':uid,'task_uid':uid})]))
 else:
  context=run(schedule.context(r,run(load(r.sql,manual.PREFIX+uid)),policy_key=manual.PREFIX+uid))
  policy=api('schedule-status')
  api('schedule-save',{'revision':policy['revision'],'enabled':False,'interval':5})
 return uid,context

def test_cold_import_excludes_general_resources():
 subprocess.run([sys.executable,'-c',"import sys; from backend.app.native import site_sync_latest_runtime; assert not any(n in sys.modules for n in ('fastapi','jinja2','backend.app.native.web','backend.app.native.content','backend.app.native.media','backend.app.native.storage','backend.app.native.site_sync_schedule','backend.app.native.site_sync_apply'))"],check=True)

@pytest.mark.parametrize('manual_grant',[False,True])
def test_worker_latest_reads_match_existing_pages_and_fall_back_afterwards(platform_pair,entry,monkeypatch,manual_grant):
 from worker_runtime.sync_schedule import run as cron
 api,_,r,*_=platform_pair;baseline,ctx=seed(api,r,manual_grant)
 for _ in range(100):
  result=run(tasks.advance(ctx,baseline))
  if result['status']=='ready':break
 else:pytest.fail('legacy preview did not finish')
 expected=run(r.sql.query("SELECT payload FROM sync_task_items WHERE task_uid=? AND module LIKE '@candidate:%' ORDER BY module,record_uid",(baseline,)))
 if manual_grant:api('manual-pause',{'uid':baseline})
 uid,ctx=seed(api,r,manual_grant)
 module=ModuleType('worker_runtime.sync_resources');module.resource_factory=Mock(side_effect=AssertionError('general factory must not run'))
 monkeypatch.setitem(sys.modules,'worker_runtime.sync_resources',module)
 before=run(r.sql.query('SELECT uid,updated_at FROM students ORDER BY uid'))
 for _ in range(100):
  result=run(cron(r.sql,object()))
  assert result.get('status')=='ok',result
  if run(work.position(r.sql,uid))['status']=='ready':break
 else:pytest.fail('lean preview did not finish')
 actual=run(r.sql.query("SELECT payload FROM sync_task_items WHERE task_uid=? AND module LIKE '@candidate:%' ORDER BY module,record_uid",(uid,)))
 assert actual==expected and actual
 assert run(r.sql.query('SELECT uid,updated_at FROM students ORDER BY uid'))==before
 module.resource_factory.assert_not_called()
 receipt=run(load(r.sql,'site-sync:scheduler-attempt:'+uid))
 names=[x['phase'] for x in receipt['initialization']['stages']]
 assert 'latest_resources' in names and 'resource_modules' not in names
 assert run(gate.select(r.sql,uid)) is None
 # The ready phase must go back to the shared scheduler with narrow resources on the next invocation.
 module.resource_factory.side_effect=None;module.resource_factory.return_value=r
 tick=Mock()
 async def normal(*args,**kw):tick();return {'status':'ok'}
 monkeypatch.setattr(schedule,'tick',normal)
 run(cron(r.sql,object()));module.resource_factory.assert_called_once();tick.assert_called_once()

@pytest.mark.parametrize('manual_grant',[False,True])
@pytest.mark.parametrize('change',['role','permission','peer','pause','binding'])
def test_revocation_during_page_read_cannot_commit_candidate_or_cursor(pair,monkeypatch,change,manual_grant):
 api,_,r,*_=pair;uid,_=seed(api,r,manual_grant);choice=run(gate.select(r.sql,uid))
 from backend.app.native import site_sync_latest as pages
 original=pages.page;before=run(tasks.get(r.sql,uid))['state'];owner=choice['policy']['owner'];called=[]
 async def mutate(sql,*args,**kwargs):
  result=await original(sql,*args,**kwargs)
  if not called:
   called.append(True)
   statement,values={
    'role':('UPDATE auth_roles SET is_active=0 WHERE uid=?',(owner['role_uid'],)),
    'permission':("UPDATE auth_permissions SET can_export=0 WHERE role_uid=? AND module='students'",(owner['role_uid'],)),
    'peer':("UPDATE sync_peers SET revision='changed'",()),
    'pause':("UPDATE service_meta SET value=json_set(value,'$.enabled',0) WHERE key=?",(choice['key'],)),
    'binding':("UPDATE sync_tasks SET state=json_set(state,'$.scopes',json('[]')) WHERE uid=?",(uid,)),
   }[change]
   await r.sql.batch([(statement,values)])
  return result
 monkeypatch.setattr(pages,'page',mutate)
 result=run(latest.run(r.sql,choice,kind=r.kind))
 assert called and result['status']=='paused'
 after=run(tasks.get(r.sql,uid))['state']
 assert after['streams']==before['streams'] and after['count']==before['count']
 assert not run(r.sql.query('SELECT payload FROM sync_task_items WHERE task_uid=?',(uid,)))
 if change=='pause':assert not run(load(r.sql,choice['key']))['enabled']

@pytest.mark.parametrize('code',['1101','1102'])
def test_progress_after_error_keeps_grant_and_existing_cursor(pair,monkeypatch,code):
 api,_,r,*_=pair;uid,_=seed(api,r);original=tasks.persist
 async def persist_then_fail(*args,**kw):
  await original(*args,**kw);raise Error('resource error',503,code)
 monkeypatch.setattr(tasks,'persist',persist_then_fail)
 result=run(latest.run(r.sql,run(gate.select(r.sql,uid)),kind='r2'))
 assert result['status']=='paused'
 row=run(work.position(r.sql,uid));w=row['work']
 assert w['retryable'] and w['retry_count']==0 and w['failures_with_progress']==1
 assert run(load(r.sql,manual.PREFIX+uid))['enabled']
 monkeypatch.setattr(tasks,'persist',original)
 run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work.retry_after','2000','$.work.pace_after','2000') WHERE uid=?",(uid,))]))
 result=run(latest.run(r.sql,run(gate.select(r.sql,uid)),kind='r2'))
 assert result['status']=='ok' and run(work.position(r.sql,uid))['work']['progress_events']>w['progress_events']

def test_changed_phase_cannot_enter_light_business_path(pair):
 api,_,r,*_=pair;uid,_=seed(api,r);choice=run(gate.select(r.sql,uid))
 run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.incremental',1,'$.phase','selected-load') WHERE uid=?",(uid,))]))
 before=run(work.position(r.sql,uid))
 assert run(latest.run(r.sql,choice,kind=r.kind))['skipped']=='phase-changed'
 assert run(work.position(r.sql,uid))==before

def test_forced_termination_recovers_then_resumes_same_task_without_full_factory(pair,entry,monkeypatch):
 from worker_runtime.sync_schedule import run as cron
 class Terminated(BaseException):pass
 api,_,r,*_=pair;uid,_=seed(api,r);original=tasks.persist
 async def kill(*args,**kw):await original(*args,**kw);raise Terminated()
 monkeypatch.setattr(tasks,'persist',kill)
 module=ModuleType('worker_runtime.sync_resources');module.resource_factory=Mock(side_effect=AssertionError('no full factory'))
 monkeypatch.setitem(sys.modules,'worker_runtime.sync_resources',module)
 with pytest.raises(Terminated):run(cron(r.sql,object()))
 row=run(work.position(r.sql,uid));assert row['work']['status']=='running' and row['count']==1
 run(r.sql.batch([
  ("UPDATE sync_tasks SET state=json_set(state,'$.work.recover_after','2000') WHERE uid=?",(uid,)),
  ("UPDATE service_meta SET value=json_set(value,'$.retry_after','2000') WHERE key=?",('site-sync:scheduler-attempt:'+uid,)),
 ]))
 result=run(cron(r.sql,object()));assert result['status']=='reconciled'
 w=run(work.position(r.sql,uid))['work'];assert w['uncertain_attempts']==1 and w['retry_count']==0
 run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work.retry_after','2000') WHERE uid=?",(uid,))]))
 monkeypatch.setattr(tasks,'persist',original)
 assert run(cron(r.sql,object()))['status']=='ok'
 assert run(work.position(r.sql,uid))['count']==2
 module.resource_factory.assert_not_called()


def test_minimal_context_has_no_storage_rendering_or_metadata_objects(pair,monkeypatch):
 api,_,r,*_=pair;uid,_=seed(api,r);seen=[];original=tasks.advance_latest
 async def inspect(context,selected):
  seen.append(set(vars(context)))
  assert set(vars(context))=={'sql','kind','passwords','p','auth'}
  assert context.passwords is None
  return await original(context,selected)
 monkeypatch.setattr(tasks,'advance_latest',inspect)
 assert run(latest.run(r.sql,run(gate.select(r.sql,uid)),kind='r2'))['status']=='ok'
 assert seen

@pytest.mark.parametrize('key',['site-sync:run','site-sync:schedule-run','task'])
def test_latest_route_respects_live_execution_leases(pair,key):
 api,_,r,*_=pair;uid,_=seed(api,r);choice=run(gate.select(r.sql,uid));at=now()
 key='site-sync:task:'+uid if key=='task' else key
 run(r.sql.batch([('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES(?,?,?,?,?)',(key,'media_assets','owner',at,at))]))
 before=run(work.position(r.sql,uid))
 assert run(latest.run(r.sql,choice,kind=r.kind))['skipped']=='busy'
 assert run(work.position(r.sql,uid))==before
