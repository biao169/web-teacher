"""Interrupted ticks reconcile once, cool down, then resume without replay."""
import asyncio,json
import pytest
from backend.app.native import site_sync_work as work,site_sync_schedule as schedule,site_sync_gate as gate
from backend.app.native.catalog import Error,now
from tests.test_sync_checkpoint_v161 import task,patch,pos
from tests.test_sync_recovery_v163 import due
from tests.test_site_sync_v121 import pair
REAL_MARK=work.mark
run=asyncio.run
class Terminated(BaseException):pass

def interrupt(r,*,progress=True,terminal=None):
 @work.step('execute')
 async def kill(r,uid):
  if progress:
   state=json.loads(r.sql.db.execute("SELECT state FROM sync_tasks WHERE uid='task'").fetchone()[0])
   patch(r,'execution.offset',state.get('execution',{}).get('offset',0)+64)
  if terminal:patch(r,'execution.phase',terminal)
  raise Terminated()
 with pytest.raises(Terminated):run(kill(r,'task'))

@pytest.mark.parametrize('action',['execute','begin','advance','select','proposal-send'])
def test_other_operations_cannot_bypass_running_wait(task,action):
 interrupt(task)
 with pytest.raises(Error) as raised:work.retry_gate(pos(task),action)
 assert raised.value.code=='sync_retry_wait'

@pytest.mark.parametrize('progress',[False,True])
def test_reconcile_is_durable_idempotent_and_defers_work(task,progress):
 interrupt(task,progress=progress)
 with pytest.raises(Error):run(work.reconcile(task,'task'))
 due(task)
 result=run(work.reconcile(task,'task'))
 assert result['status']=='paused' and result['retryable']
 assert result['retry_after']>now() and result['retry_count']==(0 if progress else 1)
 assert result['uncertain_attempts']==1 and result['failures_with_progress']==int(progress)
 assert result['reconciled_at'] and 'recover_after' not in result
 assert run(work.reconcile(task,'task'))==result
 assert pos(task)['work']==result

@pytest.mark.parametrize('terminal',['done','cancelled'])
def test_terminal_lost_reply_is_finalized_without_execution(task,terminal,monkeypatch):
 patch(task,'execution.phase','download')
 interrupt(task,terminal=terminal);due(task)
 state={'task_uid':'task','preview_uid':'task'}
 async def forbidden(*args,**kw):raise AssertionError('must not replay business operation')
 monkeypatch.setattr(schedule.apply,'tick',forbidden)
 monkeypatch.setattr(schedule.tasks,'start',forbidden)
 run(schedule.step(task,{'auto_pull':True,'interval':5},state))
 assert pos(task)['work']['status']=='saved' and pos(task)['work']['uncertain_attempts']==1
 assert 'last_task_uid' not in state
 run(schedule.step(task,{'auto_pull':True,'interval':5},state))
 assert state['last_task_uid']=='task'
 assert pos(task)['work']['uncertain_attempts']==1

def test_scheduler_reconciles_then_waits_then_advances(task,monkeypatch):
 patch(task,'execution.phase','download');interrupt(task);due(task)
 state={'task_uid':'task'};calls=[]
 async def tick(r,uid):calls.append(uid);return {'uid':uid,'execution':{'phase':'download'}}
 monkeypatch.setattr(schedule.apply,'tick',tick)
 run(schedule.step(task,{'auto_pull':False,'interval':5},state));assert not calls
 run(schedule.step(task,{'auto_pull':False,'interval':5},state));assert not calls
 due(task)
 run(schedule.step(task,{'auto_pull':False,'interval':5},state));assert calls==['task']

def test_active_global_lock_blocks_reconciliation(task):
 interrupt(task);due(task);at=now()
 run(task.sql.batch([('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES(?,?,?,?,?)',('site-sync:run','media_assets','owner',at,at))]))
 with pytest.raises(Error) as raised:run(work.reconcile(task,'task'))
 assert raised.value.code=='sync_busy' and pos(task)['work']['status']=='running'
 run(task.sql.batch([("UPDATE admin_mutation_guards SET created_at='2000-01-01T00:00:00.000Z'",())]))
 assert run(work.reconcile(task,'task'))['status']=='paused'

def test_terminal_and_child_links_wait_for_running_receipt():
 for extra in ({'execution_phase':'done'},{'prepared_uid':'child'}):
  row={'work_status':'running','recover_after':'9999-01-01T00:00:00Z',**extra}
  assert gate.waiting(row,now())[0]=='receipt_wait'

def test_worker_gate_respects_live_task_lease(task):
 patch(task,'execution.phase','download');interrupt(task);due(task)
 run(task.sql.batch([schedule.put(gate.KEY,{'enabled':True,'auto_pull':False}),schedule.put(gate.STATE,{'task_uid':'task'})]))
 at=now()
 run(task.sql.batch([('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES(?,?,?,?,?)',('site-sync:task:task','media_assets','owner',at,at))]))
 assert run(gate.probe(task.sql))=={'skipped':'busy'}

def test_reconcile_storage_failure_leaves_running_evidence(task,monkeypatch):
 interrupt(task);due(task);prior=pos(task)['work']
 async def failed(*args):raise RuntimeError('database unavailable')
 monkeypatch.setattr(work,'mark',failed)
 with pytest.raises(RuntimeError):run(work.reconcile(task,'task'))
 assert pos(task)['work']==prior

def test_old_unconfirmed_terminal_is_not_pruned(task):
 from backend.app.native.site_sync_history import prune
 interrupt(task,terminal='done');due(task)
 assert not run(prune(task.sql))['deleted']
 assert pos(task)['work']['status']=='running'


def test_reconcile_save_reply_loss_does_not_count_twice(task,monkeypatch):
 interrupt(task);due(task);original=work.mark
 async def save_then_lose(*args):
  await original(*args);raise Terminated()
 monkeypatch.setattr(work,'mark',save_then_lose)
 with pytest.raises(Terminated):run(work.reconcile(task,'task'))
 monkeypatch.setattr(work,'mark',original)
 saved=run(work.reconcile(task,'task'))
 assert saved['uncertain_attempts']==1 and saved['failures_with_progress']==1


def test_lost_lease_cannot_claim_state_was_saved(task):
 with pytest.raises(Error) as raised:run(REAL_MARK(task.sql,'task','expired-owner',{'status':'saved'}))
 assert raised.value.code=='sync_busy'
 assert pos(task)['work']=={}


def test_terminal_unconfirmed_stays_visible_in_active_monitor(task):
 from backend.app.native.site_sync_status import read
 interrupt(task,terminal='done')
 rows=run(read(task))['jobs']
 assert len(rows)==1 and rows[0]['recovery_state']=='uncertain_wait'


def test_no_progress_reconciliations_enter_slow_retry(task):
 for i in range(31):
  due(task);interrupt(task,progress=False);due(task)
  saved=run(work.reconcile(task,'task'))
  assert saved['retry_count']==i+1
 assert saved['retryable'] and saved['slow_retry'] and saved['no_progress_failures']==31


def test_manual_resume_keeps_uncertain_evidence(pair):
 from tests.test_site_sync_v123 import enable
 from backend.app.native import site_sync_tasks as tasks
 api,_,base,*_=pair
 uid=api('start',{'direction':'pull','scopes':['students'],'preview_mode':'brief'})['uid']
 enable(api);r=run(schedule.context(base,run(schedule.load(base.sql))))
 @work.step('advance')
 async def killed(r,uid):raise Terminated()
 with pytest.raises(Terminated):run(killed(r,uid))
 run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work.recover_after','2000-01-01T00:00:00Z') WHERE uid=?",(uid,))]))
 result=run(tasks.resume(r,uid))
 assert result['work']['uncertain_attempts']==1 and result['work']['status']=='paused'
 assert result['work']['retry_after']>now()


def test_repeated_background_recovery_with_progress_is_not_failure(task):
 for _ in range(35):
  due(task);interrupt(task);due(task)
  saved=run(work.reconcile(task,'task'))
  assert saved['retryable'] and saved['retry_count']==0
 assert saved['failures_with_progress']==saved['uncertain_attempts']==35
 assert saved['no_progress_failures']==0


def test_prepared_child_does_not_bypass_reconciliation_cooldown(task):
 patch(task,'prepared_uid','child')
 patch(task,'work',{'status':'paused','retryable':True,'retry_after':'9999-01-01T00:00:00Z'})
 state={'task_uid':'task','preview_uid':'task'}
 run(schedule.step(task,{'auto_pull':True,'interval':5},state))
 assert state['task_uid']=='task' and state['wait_reason']=='retry_wait'


def test_expired_task_is_not_eligible_for_reconciliation():
 assert gate.waiting({'status':'expired','work_status':'running'},now())==('needs_attention',None)
