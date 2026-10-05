"""Persisted progress evidence and forced-termination reconciliation."""
import asyncio,json
from contextlib import asynccontextmanager
from types import SimpleNamespace
import pytest
from backend.app.native import site_sync_work as work
from backend.app.native.site_sync_checkpoint import observe,recovery_state
from backend.app.native.catalog import Error
from tests.test_sync_latest_v149 import MemorySQL

@pytest.fixture
def task(monkeypatch):
 sql=MemorySQL();r=SimpleNamespace(sql=sql,kind='r2')
 sql.db.execute('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',('task','reading',json.dumps({'preview_format':work.TASK_FORMAT,'phase':'content'}),'2026-01-01T00:00:00Z'))
 @asynccontextmanager
 async def lease(*args):yield 'test-owner'
 async def mark(sql,uid,owner,value):
  await sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?)) WHERE uid=?",(json.dumps(value),uid))])
 monkeypatch.setattr(work,'task_lease',lease);monkeypatch.setattr(work,'mark',mark)
 yield r
 sql.db.close()

def patch(r,path,value):
 r.sql.db.execute('UPDATE sync_tasks SET state=json_set(state,?,json(?)) WHERE uid=?',('$.'+path,json.dumps(value),'task'))

def pos(r):return asyncio.run(work.position(r.sql,'task'))

def test_projection_excludes_payload_errors_and_selection(task):
 before=pos(task)['checkpoint']
 for key,value in [('items',[{'body':'PRIVATE'*100000}]),('selected',['a']),('work',{'error':'bad','started_at':'now'}),('execution.error','bad')]:patch(task,key,value)
 assert pos(task)['checkpoint']==before
 assert len(before)==64
 assert all('SELECT *' not in q for q,_ in task.sql.queries)

@pytest.mark.parametrize('path,value',[
 ('execution.media',[{'verify':{'offset':512}}]),('execution.media',[{'merge_pending':{'checked':1024}}]),
 ('execution.offset',1024),('execution.phase','cleanup'),('execution.prepared.check_after',['x','y']),
 ('execution.media',[{'assembled_version':'v1'}]),('execution.write_after','row'),
 ('execution.cleanup_index',1),('current.ref_index',1),('begin_plan.media_index',1),
 ('streams',[{'side':'local','table':'news','done':True}]),('commit_check.version_count',1),
])
def test_persisted_cursors_are_progress(task,path,value):
 before=pos(task)['checkpoint'];patch(task,path,value)
 assert pos(task)['checkpoint']!=before

def test_successful_noop_is_not_progress(task):
 @work.step('execute')
 async def noop(r,uid):return {}
 first=asyncio.run(noop(task,'task'))['work']
 second=asyncio.run(noop(task,'task'))['work']
 assert first['progress_events']==second['progress_events']==0
 assert second['stalled_attempts']==2 and second['completed_steps']==2


def test_commit_before_failure_keeps_progress_and_failure(task):
 @work.step('execute')
 async def fail(r,uid):
  patch(r,'execution.offset',64)
  raise Error('temporary',503,'sync_http_503')
 with pytest.raises(Error):asyncio.run(fail(task,'task'))
 saved=pos(task)['work']
 assert saved['progress_events']==1 and saved['total_failures']==1
 assert saved['stalled_attempts']==0 and saved['retry_count']==0 and saved['retryable']


def test_forced_termination_reconciles_once(task):
 class Terminated(BaseException):pass
 @work.step('execute')
 async def killed(r,uid):
  patch(r,'execution.offset',128)
  raise Terminated()
 with pytest.raises(Terminated):asyncio.run(killed(task,'task'))
 assert pos(task)['work']['status']=='running'
 patch(task,'work.recover_after','2000-01-01T00:00:00Z')
 @work.step('execute')
 async def noop(r,uid):return {}
 saved=asyncio.run(noop(task,'task'))['work']
 assert saved['uncertain_attempts']==1 and saved['total_failures']==1 and saved['progress_events']==1
 again=asyncio.run(noop(task,'task'))['work']
 assert again['uncertain_attempts']==again['total_failures']==1


def test_legacy_baseline_and_real_progress_reset_only_stalls():
 base=observe({},'a','t1')
 assert base['progress_events']==0 and base['last_progress_at'] is None
 failed=observe(base,'a','t2',failed=True)
 saved=observe(failed,'b','t3',finished=True)
 assert saved['total_failures']==1 and saved['stalled_attempts']==0 and saved['last_progress_at']=='t3'
 assert recovery_state({'status':'running','recover_after':'t4'},at='t3')=='uncertain_wait'
 assert recovery_state({'status':'running','recover_after':'t2'},at='t3')=='needs_reconciliation'
 assert recovery_state({'status':'paused','retryable':True,'retry_after':None},at='t3')=='retry_due'


def test_rolled_back_write_is_not_progress(task):
 @work.step('execute')
 async def rolled_back(r,uid):
  r.sql.db.execute('SAVEPOINT step')
  patch(r,'execution.offset',256)
  r.sql.db.execute('ROLLBACK TO step');r.sql.db.execute('RELEASE step')
  raise Error('temporary',503,'sync_http_503')
 with pytest.raises(Error):asyncio.run(rolled_back(task,'task'))
 saved=pos(task)['work']
 assert saved['progress_events']==0 and saved['total_failures']==saved['stalled_attempts']==1


def test_monitor_exposes_counters_but_not_checkpoint_payload(task):
 from backend.app.native.site_sync_status import read
 @work.step('execute')
 async def noop(r,uid):return {}
 asyncio.run(noop(task,'task'))
 patch(task,'phase','done') # Completed preview is still waiting for execution confirmation.
 job=asyncio.run(read(task))['jobs'][0]
 assert job['uid']=='task' and job['stalled_attempts']==1 and job['recovery_state']=='no_progress'
 assert job['total_failures']==0 and job['checkpoint_version']==5 and 'checkpoint' not in job
