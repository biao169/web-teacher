"""Progress-based budgets survive failures, response loss and no-op successes."""
import asyncio
from types import SimpleNamespace
import pytest
from backend.app.native import site_sync_work as work,site_sync_schedule as schedule
from backend.app.native.catalog import Error
from tests.test_sync_checkpoint_v161 import task,patch,pos
run=asyncio.run

def due(r):
 patch(r,'work.retry_after','2000-01-01T00:00:00Z')
 patch(r,'work.recover_after','2000-01-01T00:00:00Z')

@pytest.mark.parametrize('kind,limit,last_delay',[('r2',30,600),('local',8,60)])
def test_checkpoint_budgets_and_capped_delay(kind,limit,last_delay,monkeypatch):
 monkeypatch.setattr(work,'now',lambda **kw:kw.get('seconds',0))
 r=SimpleNamespace(kind=kind);error=Error('temporary',503,'sync_http_503')
 for n in range(limit):
  value=work.retry_state(error,{'retry_count':n},r,checkpointed=True)
  assert value['retryable'] and value['retry_after']<=last_delay
 assert value['retry_after']==last_delay
 assert not work.retry_state(error,{'retry_count':limit},r,checkpointed=True)['retryable']
 assert work.retry_state(error,{'retry_count':limit+10},r,checkpointed=True,progressed=True)['retry_count']==0
 assert not work.retry_state(Error('conflict',409,'sync_conflict'),{},r,checkpointed=True,progressed=True)['retryable']


def test_many_failures_with_persisted_progress_keep_recovering(task):
 count=0
 @work.step('execute')
 async def advance_then_fail(r,uid):
  nonlocal count
  count+=1;patch(r,'execution.offset',count*1024)
  raise Error('temporary',503,'sync_http_503')
 for _ in range(40):
  with pytest.raises(Error):run(advance_then_fail(task,'task'))
  saved=pos(task)['work'];assert saved['retryable'] and saved['retry_count']==0
  due(task)
 assert saved['total_failures']==40 and saved['progress_events']==40


def test_noop_success_does_not_replenish_budget(task):
 @work.step('execute')
 async def fail(*args):raise Error('temporary',503,'sync_http_503')
 @work.step('execute')
 async def noop(*args):return {}
 for _ in range(5):
  with pytest.raises(Error):run(fail(task,'task'))
  due(task);run(noop(task,'task'))
 assert pos(task)['work']['retry_count']==5


def test_repeated_termination_with_progress_and_stale_error(task):
 class Terminated(BaseException):pass
 count=0
 @work.step('execute')
 async def kill(r,uid):
  nonlocal count
  count+=1;patch(r,'execution.offset',count);patch(r,'execution.error','previous error')
  raise Terminated()
 for _ in range(12):
  with pytest.raises(Terminated):run(kill(task,'task'))
  due(task)
 @work.step('execute')
 async def noop(*args):return {}
 result=run(noop(task,'task'))['work']
 assert result['total_failures']==result['uncertain_attempts']==12
 assert result['progress_events']==12 and result['retry_count']==0


def test_repeated_termination_without_progress_stops(task):
 class Terminated(BaseException):pass
 @work.step('execute')
 async def kill(*args):raise Terminated()
 for _ in range(31):
  with pytest.raises(Terminated):run(kill(task,'task'))
  due(task)
 with pytest.raises(Error,match='连续无进展'):run(kill(task,'task'))
 saved=pos(task)['work']
 assert saved['status']=='paused' and not saved['retryable'] and saved['retry_count']==31


def test_permanent_failure_not_retried_even_with_progress(task):
 @work.step('execute')
 async def bad(r,uid):
  patch(r,'execution.offset',123)
  raise Error('signature invalid',403,'sync_signature')
 with pytest.raises(Error):run(bad(task,'task'))
 assert not pos(task)['work']['retryable']
 with pytest.raises(Error) as error:run(bad(task,'task'))
 assert error.value.code=='sync_retry_exhausted'


def test_scheduler_reconciles_running_task_despite_previous_execution_error(monkeypatch):
 calls=[]
 async def active(sql):return [{'uid':'same-task'}]
 async def header(*args):return {'uid':'same-task','work_status':'running','execution_phase':'download','error':'previous failure'}
 async def tick(r,uid):raise AssertionError('reconciliation must not execute business work')
 async def reconcile(r,uid):calls.append(uid);return {'status':'paused','retryable':True,'retry_after':'2099-01-01T00:00:00Z'}
 async def receipt(*args):pass
 async def no_grant(*args):return {}
 monkeypatch.setattr(schedule,'load',no_grant)
 from backend.app.native import site_sync_proposals
 monkeypatch.setattr(schedule.apply,'active',active);monkeypatch.setattr(schedule,'checkpoint',header)
 monkeypatch.setattr(schedule.apply,'tick',tick);monkeypatch.setattr(site_sync_proposals,'update_progress',receipt)
 monkeypatch.setattr(work,'reconcile',reconcile)
 run(schedule.step(SimpleNamespace(sql=None),{'interval':5},{'task_uid':'same-task'}))
 assert calls==['same-task']


def test_cleanup_obeys_cooldown_and_cancel_does_not_bypass_running_wait():
 row={'execution_phase':'cleanup','work':{'operation':'execute','status':'paused','retryable':False}}
 with pytest.raises(Error):work.retry_gate(row,'execute')
 work.retry_gate(row,'execute',cancel=True)
 row['work'].update(status='running',recover_after='9999-01-01T00:00:00Z')
 with pytest.raises(Error):work.retry_gate(row,'execute',cancel=True)


def test_scheduler_uses_task_deadline_and_counter_after_failure(monkeypatch):
 from contextlib import asynccontextmanager
 import json
 from backend.app.native import site_sync_gate
 from tests.test_sync_patch_v162 import AtomicSQL
 sql=AtomicSQL();r=SimpleNamespace(sql=sql,kind='r2')
 policy={'enabled':True,'auto_pull':False,'revision':'policy','peer_revision':'peer','interval':5}
 run(sql.batch([schedule.put(site_sync_gate.KEY,policy),schedule.put(site_sync_gate.STATE,{})]))
 @asynccontextmanager
 async def lease(*args):yield 'owner'
 async def context(*args):return r
 async def peer(*args):return {'revision':'peer'}
 async def active(*args):return [{'uid':'task'}]
 async def failing(r,policy,s):s['task_uid']='task';raise Error('temporary',503,'sync_http_503')
 deadline='2099-01-01T00:00:00Z'
 async def header(*args):return {'state':{'work':{'status':'paused','error_code':'sync_http_503','retry_count':20,'retryable':True,'retry_after':deadline}}}
 monkeypatch.setattr(schedule,'lease',lease);monkeypatch.setattr(schedule,'context',context)
 monkeypatch.setattr(schedule.tasks,'peer',peer);monkeypatch.setattr(schedule.apply,'active',active)
 monkeypatch.setattr(schedule,'step',failing);monkeypatch.setattr(schedule.tasks,'header',header)
 try:
  result=run(schedule.tick(r,prune_history=False))
  assert result['status']=='paused'
  saved=run(schedule.load(sql,site_sync_gate.STATE))
  assert saved['retry_count']==20 and saved['retryable'] and saved['retry_after']==deadline
 finally:sql.db.close()
