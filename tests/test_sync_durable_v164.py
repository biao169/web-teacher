"""Scheduler boundaries survive lost responses without browser assistance."""
import asyncio,copy,json
from types import SimpleNamespace
import pytest
from backend.app.native import site_sync_schedule as schedule,site_sync_gate as gate,site_sync_tasks as tasks
from backend.app.native.site_sync_work import TASK_FORMAT
from tests.test_sync_patch_v162 import AtomicSQL
from tests.test_site_sync_v121 import pair
from tests.test_site_sync_v123 import enable
run=asyncio.run

@pytest.fixture
def db():
 sql=AtomicSQL();yield sql;sql.db.close()

def seed(sql,uid,**fields):
 state={'preview_format':TASK_FORMAT,**fields}
 run(sql.batch([('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',(uid,'ready',json.dumps(state),'2026-01-01T00:00:00Z'))]))

def configured(sql,state,auto=True):
 run(sql.batch([schedule.put(gate.KEY,{'enabled':True,'auto_pull':auto,'interval':5}),schedule.put(gate.STATE,state)]))


def test_worker_gate_prefers_task_deadline_over_stale_schedule(db):
 seed(db,'task',execution={'phase':'download'},work={'status':'saved'})
 configured(db,{'task_uid':'task','retry_after':'9999-01-01T00:00:00Z'})
 assert run(gate.probe(db))=={}
 run(db.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?))",(json.dumps({'status':'paused','retryable':True,'retry_after':'9999-01-01T00:00:00Z'}),))]))
 assert run(gate.probe(db))=={'skipped':'interval'}
 value=run(schedule.status(db));assert value['wait_reason']=='retry_wait' and value['next_attempt_at'].startswith('9999')

@pytest.mark.parametrize('auto',[False,True])
def test_terminal_checkpoint_is_acknowledged_without_reexecution(db,auto,monkeypatch):
 seed(db,'task',execution={'phase':'done','committed':True},work={'status':'saved'})
 s={'task_uid':'task','preview_uid':'task'};configured(db,s,auto)
 async def forbidden(*a,**k):raise AssertionError('must not execute or create')
 monkeypatch.setattr(schedule.apply,'begin',forbidden);monkeypatch.setattr(tasks,'start',forbidden)
 run(schedule.step(SimpleNamespace(sql=db),{'auto_pull':auto,'interval':5},s))
 assert s['last_task_uid']=='task' and s['last_finished'] and 'preview_uid' not in s
 assert s['next_due']>s['last_finished']


def test_saved_child_link_wins_over_parent_old_error(db,monkeypatch):
 seed(db,'parent',prepared_uid='child',work={'status':'paused','retryable':False})
 seed(db,'child',phase='selected-load')
 s={'task_uid':'parent','preview_uid':'parent'}
 async def forbidden(*a,**k):raise AssertionError('must not load full task or create child')
 monkeypatch.setattr(tasks,'get',forbidden)
 run(schedule.step(SimpleNamespace(sql=db),{'auto_pull':True,'interval':5},s))
 assert s['preview_uid']==s['task_uid']=='child'


def test_cooldown_is_not_described_as_manual_pause(db):
 seed(db,'task',execution={'phase':'download'},work={'status':'paused','retryable':True,'retry_after':'9999-01-01T00:00:00Z'})
 s={'task_uid':'task'}
 run(schedule.step(SimpleNamespace(sql=db),{'auto_pull':False,'interval':5},s))
 assert s['wait_reason']=='retry_wait' and '后台重试' in s['message']


def test_creation_and_scheduler_pointer_survive_process_loss(pair,monkeypatch):
 api,_,r,*_=pair;enable(api,True)
 class Terminated(BaseException):pass
 original=r.sql.batch;lost=False
 async def interrupted(statements):
  nonlocal lost
  result=await original(statements)
  if not lost and any('INSERT INTO sync_tasks(' in sql for sql,args in statements):
   lost=True;raise Terminated()
  return result
 monkeypatch.setattr(r.sql,'batch',interrupted)
 with pytest.raises(Terminated):run(schedule.tick(r,prune_history=False))
 saved=run(schedule.load(r.sql,gate.STATE));uid=saved['preview_uid']
 assert saved['task_uid']==uid
 assert len(run(r.sql.query('SELECT uid FROM sync_tasks')))==1
 # A fresh scheduler context has no request/session state to recover from.
 fresh=copy.copy(r)
 value=run(schedule.tick(fresh,prune_history=False))
 assert value['status']=='ok' and value['preview_uid']==uid
 assert len(run(r.sql.query('SELECT uid FROM sync_tasks')))==1


def test_creation_link_guard_failure_leaves_no_orphan(pair):
 api,_,r,*_=pair;enable(api,True)
 policy=run(schedule.load(r.sql));authorized=run(schedule.context(r,policy))
 s=run(schedule.load(r.sql,gate.STATE))
 bad=schedule.creation_link(authorized,s,'not-the-current-state')
 with pytest.raises(Exception):run(tasks.start(authorized,'pull',['students'],lightweight=True,latest_only=True,on_create=bad))
 assert not run(r.sql.query('SELECT uid FROM sync_tasks'))
 assert not run(schedule.load(r.sql,gate.STATE)).get('preview_uid')


def test_read_only_monitor_explains_background_and_manual_tasks(db):
 from backend.app.native.site_sync_status import read
 seed(db,'active',execution={'phase':'download'},work={'status':'paused','retryable':True,'retry_after':'9999-01-01T00:00:00Z'})
 seed(db,'manual',phase='complete',approval={'request_id':'proposal'})
 configured(db,{'task_uid':'active'},False)
 before=db.db.total_changes
 rows={x['uid']:x for x in run(read(SimpleNamespace(sql=db,kind='r2')))['jobs']}
 assert rows['active']['advance_mode']=='background' and rows['active']['wait_reason']=='retry_wait'
 assert rows['active']['next_attempt_at'].startswith('9999')
 assert rows['manual']['advance_mode']=='manual' and rows['manual']['next_attempt_at'] is None
 assert db.db.total_changes==before


def test_status_explains_live_and_expired_leases(db):
 from backend.app.native.catalog import now
 seed(db,'task',execution={'phase':'download'},work={'status':'saved'})
 configured(db,{'task_uid':'task'},False)
 stamp=now()
 run(db.batch([('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES(?,?,?,?,?)',('site-sync:run','media_assets','owner',stamp,stamp))]))
 value=run(schedule.status(db))
 assert value['wait_reason']=='lease_wait' and value['next_attempt_at']>stamp
 run(db.batch([("UPDATE admin_mutation_guards SET created_at='2000-01-01T00:00:00.000Z'",())]))
 assert run(schedule.status(db))['wait_reason']=='ready'
