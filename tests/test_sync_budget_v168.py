"""Durable pressure budgets and fair scheduling, without bypassing consent."""
import asyncio,json
from types import SimpleNamespace
import pytest
from backend.app.native import site_sync_limits as limits,site_sync_work as work,site_sync_media as media
from backend.app.native import site_sync_schedule as schedule,site_sync_gate as gate,site_sync_manual as manual
from backend.app.native import site_sync_tasks as tasks
from backend.app.native.catalog import Error,now
from tests.test_sync_checkpoint_v161 import task,patch,pos
from tests.test_sync_recovery_v163 import due
from tests.test_site_sync_v121 import pair
run=asyncio.run

def test_pressure_survives_success_and_keeps_progress_retry_allowance(task):
 seen=[]
 @work.step('execute')
 async def fail(r,uid):
  seen.append(limits.for_resource(r)['version_rows'])
  patch(r,'execution.offset',len(seen)*16)
  raise Error('resource loss',503,'1102')
 for level in (1,2,2):
  with pytest.raises(Error):run(fail(task,'task'))
  saved=pos(task)['work'];assert saved['resource_level']==level
  assert saved['retry_count']==0 and saved['retryable']
  due(task)
 assert seen==[5,2,1]
 @work.step('execute')
 async def success(r,uid):
  assert limits.for_resource(r)['media_chunk_bytes']==4096
  patch(r,'execution.offset',100);return {}
 result=run(success(task,'task'))
 assert result['request_interval_ms']==15000 and result['work']['resource_level']==2
 assert result['work']['pace_after']>now()
 assert limits.for_resource(task)['media_chunk_bytes']==16384
 assert gate.waiting(run(gate.checkpoint(task.sql,'task')),now())[0]=='retry_wait'

def test_unconfirmed_reconciliation_lowers_budget_once(task):
 class Terminated(BaseException):pass
 @work.step('advance')
 async def kill(r,uid):raise Terminated()
 with pytest.raises(Terminated):run(kill(task,'task'))
 due(task);saved=run(work.reconcile(task,'task'))
 assert saved['resource_level']==1
 assert run(work.reconcile(task,'task'))['resource_level']==1
 assert limits.for_resource(task)['version_rows']==5

def test_budget_isolation_and_local_profile():
 a=SimpleNamespace(kind='r2');b=SimpleNamespace(kind='r2');local=SimpleNamespace(kind='local')
 async def read(r,n):
  with limits.budget(r,{'resource_level':n}):
   await asyncio.sleep(0)
   if r is a:assert limits.for_resource(b)['version_rows']==5
   return limits.for_resource(r)['version_rows']
 async def together():return await asyncio.gather(read(a,2),read(b,1),read(local,2))
 assert run(together())==[1,2,20]
 assert limits.pressured(local,{},'1102')==0

@pytest.mark.parametrize('level,width',[(1,8192),(2,4096)])
def test_new_width_requires_peer_capability(level,width):
 r=SimpleNamespace(kind='r2')
 with limits.budget(r,{'resource_level':level}):
  assert media.negotiate(r,{'adaptive_ranges':1,'preferred_chunk_bytes':16384,'supported_chunk_bytes':list(limits.MEDIA_WIDTHS)})==width
  assert media.negotiate(r,{'adaptive_ranges':1,'preferred_chunk_bytes':16384})==16384
  assert media.negotiate(r,{})==65536

def test_version_pages_shrink_without_changing_cursor_or_digest(monkeypatch):
 from backend.app.native import site_sync as core
 rows=[{'uid':str(i),'updated_at':'stamp'} for i in range(1,10)];seen=[]
 async def page(sql,table,after,limit):
  seen.append(limit);pending=[v for v in rows if v['uid']>after];part=pending[:limit]
  return {'rows':part,'count':len(part),'next':part[-1]['uid'] if len(pending)>limit else None}
 monkeypatch.setattr(core,'revision_page',page)
 r=SimpleNamespace(kind='r2',sql=None)
 state={'phase':'baseline','side':'local','table_index':0,'after':'','policy':{'version_rows':20},'version_count':0,'table_count':0,'version_hash':'','totals':{'local':{}}}
 for level in (0,1,2,2):
  with limits.budget(r,{'resource_level':level}):run(tasks.version_step(r,{},state))
 assert seen==[5,2,1,1] and state['version_count']==9 and state['table_index']==1
 table=sorted(core.SCOPES)[0]
 assert state['version_hash']==core.revision_fold('',table,rows,first=True)

def start(api):return api('start',{'background':True,'direction':'pull','preview_mode':'brief','scopes':['students']})['uid']

@pytest.mark.parametrize('blocked',['lock','cooldown','pace','unconfirmed'])
def test_blocked_first_task_yields_to_next_ready_task(pair,blocked):
 api,_,r,*_=pair;a=start(api);b=start(api)
 if blocked=='lock':
  run(r.sql.batch([('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES(?,?,?,?,?)',('site-sync:task:'+a,'media_assets','owner',now(),now()))]))
 else:
  value={'status':'saved','pace_after':now(seconds=300)} if blocked=='pace' else {'status':'running','recover_after':now(seconds=300)} if blocked=='unconfirmed' else {'status':'paused','retryable':True,'retry_after':now(seconds=300)}
  run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?)) WHERE uid=?",(json.dumps(value),a))]))
 assert run(gate.probe(r.sql))=={}
 result=run(schedule.tick(r,prune_history=False));assert result['task_uid']==b and result['status']=='ok'
 assert run(tasks.header(r.sql,b))['state']['work']['completed_steps']==1

def test_manual_and_scheduled_work_alternate_and_cooling_yields(pair):
 api,_,r,*_=pair
 api('schedule-save',{'enabled':True,'auto_pull':True,'interval':5,'scopes':['students'],'confirmation':schedule.CONFIRM})
 a=start(api)
 first=run(schedule.tick(r,prune_history=False));assert first['manual'] and first['task_uid']==a
 second=run(schedule.tick(r,prune_history=False));assert not second.get('manual')
 scheduled=second['task_uid'];assert scheduled!=a
 third=run(schedule.tick(r,prune_history=False));assert third['manual']
 fourth=run(schedule.tick(r,prune_history=False));assert fourth['task_uid']==scheduled and not fourth.get('manual')
 # An unavailable scheduled turn must not waste a tick or starve ready manual work.
 run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?)) WHERE uid=?",(json.dumps({'status':'paused','retryable':True,'retry_after':now(seconds=300)}),scheduled)),gate.dispatch('manual',now())]))
 assert run(schedule.tick(r,prune_history=False))['manual']

def test_manual_tasks_rotate_after_each_saved_step(pair):
 api,_,r,*_=pair;a=start(api);b=start(api)
 ids=[run(schedule.tick(r,prune_history=False))['task_uid'] for _ in range(4)]
 assert ids==[a,b,a,b]
