"""Narrow snapshots, atomic CAS and payload preservation on SQLite/D1 SQL."""
import asyncio,copy,json,sqlite3
import pytest
from backend.app.native import site_sync_patch as patch,site_sync_tasks as tasks
from backend.app.native.site_sync_work import TASK_FORMAT
from backend.app.native.catalog import Error
from tests.test_sync_latest_v149 import MemorySQL
run=asyncio.run

class AtomicSQL(MemorySQL):
 async def batch(self,rows):
  self.queries.extend(rows)
  with self.db:return [[dict(v) for v in self.db.execute(sql,args)] for sql,args in rows]

@pytest.fixture
def sql():
 db=AtomicSQL()
 state={'preview_format':TASK_FORMAT,'direction':'pull','remote_id':'remote','peer_revision':'peer','incremental':True,
        'items':[{'body':'PRIVATE_BODY'*100000}],'selection':{'selected':['keep']},
        'execution':{'phase':'download','file_index':1,'offset':0,'bytes':0,'cleanup_index':0,'cleanup_offset':0,'committed':False,'cancelled':False,
                     'selected':['keep'],'prepared':{'large':'PRIVATE_PLAN'*10000},'media':[{'uid':'first','version':None},{'uid':'second','version':None}]}}
 db.db.execute('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',('task','ready',json.dumps(state),'2026-01-01T00:00:00Z'));db.db.commit()
 yield db
 db.db.close()

def state(sql):return json.loads(sql.db.execute("SELECT state FROM sync_tasks WHERE uid='task'").fetchone()[0])

def test_hot_snapshot_and_patch_do_not_roundtrip_payload(sql):
 before=state(sql);task=run(patch.load(sql,'task'));raw=json.dumps(task)
 assert len(raw)<2500 and 'PRIVATE' not in raw
 assert task['state']['execution']['media'][0] is None
 e=task['state']['execution'];e['offset']=16384;e['bytes']=16384;e['media'][1]['version']='etag'
 run(tasks.persist(sql,task,status='ready'))
 after=state(sql)
 assert after['items']==before['items'] and after['selection']==before['selection']
 assert after['execution']['prepared']==before['execution']['prepared']
 assert after['execution']['selected']==['keep'] and after['execution']['media'][0]==before['execution']['media'][0]
 assert after['execution']['offset']==16384 and after['execution']['media'][1]['version']=='etag'
 assert all('PRIVATE' not in str(args) for _,args in sql.queries)
 assert max(len(str(args)) for _,args in sql.queries)<2500
 # The same snapshot can save again after its own successful write.
 e['offset']=32768;run(tasks.persist(sql,task,status='ready'));assert state(sql)['execution']['offset']==32768


def test_competing_patch_rolls_back_side_effect(sql):
 first=run(patch.load(sql,'task'));second=run(patch.load(sql,'task'))
 first['state']['execution']['offset']=1;run(tasks.persist(sql,first,status='ready'))
 second['state']['execution']['offset']=2
 with pytest.raises(Error):
  run(tasks.persist(sql,second,[("INSERT INTO service_meta(key,value) VALUES('must-rollback','x')",())],status='ready'))
 assert state(sql)['execution']['offset']==1
 assert not sql.db.execute("SELECT 1 FROM service_meta WHERE key='must-rollback'").fetchall()


def test_full_and_partial_writes_invalidate_each_other(sql):
 partial=run(patch.load(sql,'task'));full=run(tasks.get(sql,'task'))
 full['state']['selection']={'selected':['new']};run(tasks.persist(sql,full,status='ready'))
 with pytest.raises(Error):run(tasks.persist(sql,partial,status='ready'))
 partial=run(patch.load(sql,'task'));full=run(tasks.get(sql,'task'))
 partial['state']['execution']['bytes']=12;run(tasks.persist(sql,partial,status='ready'))
 with pytest.raises(Error):run(tasks.persist(sql,full,status='ready'))


def test_error_removal_and_explicit_null_are_distinct(sql):
 task=run(patch.load(sql,'task'));e=task['state']['execution'];e['error']='retry';e['media'][1]['version']=None
 run(tasks.persist(sql,task,status='ready'));e.pop('error');e['media'][1]['version']='etag';run(tasks.persist(sql,task,status='ready'))
 e['media'][1]['version']=None;run(tasks.persist(sql,task,status='ready'))
 assert 'error' not in state(sql)['execution'] and state(sql)['execution']['media'][1]['version'] is None


def test_cleanup_reads_cleanup_index_and_complex_phases_fall_back(sql):
 sql.db.execute("UPDATE sync_tasks SET state=json_set(state,'$.execution.phase','cleanup')");sql.db.commit()
 task=run(patch.load(sql,'task'));assert task['state']['execution']['media'][0]['uid']=='first' and task['state']['execution']['media'][1] is None
 sql.db.execute("UPDATE sync_tasks SET state=json_set(state,'$.execution.phase','write-record')");sql.db.commit()
 assert run(patch.load(sql,'task')) is None


def test_status_change_invalidates_patch(sql):
 task=run(patch.load(sql,'task'));sql.db.execute("UPDATE sync_tasks SET status='expired'");sql.db.commit()
 with pytest.raises(Error):run(tasks.persist(sql,task,status='ready'))
 assert sql.db.execute('SELECT status FROM sync_tasks').fetchone()[0]=='expired'

@pytest.fixture
def resource(sql,monkeypatch):
 from contextlib import asynccontextmanager
 from types import SimpleNamespace
 from backend.app.native import site_sync_apply as apply
 @asynccontextmanager
 async def lease(*args):yield 'owner'
 monkeypatch.setattr(apply,'lease',lease);monkeypatch.setattr(apply,'authorize',lambda *a:None)
 async def forbidden(*args):raise AssertionError('Unexpected full task read')
 monkeypatch.setattr(tasks,'get',forbidden)
 return SimpleNamespace(sql=sql,kind='r2',p={},content=SimpleNamespace(audit=lambda *args:('SELECT 1',())))


def test_cancel_reloads_correct_cleanup_item(resource,monkeypatch):
 from backend.app.native import site_sync_apply as apply,site_sync_media as media
 seen=[]
 async def clean(r,task,index,item,budget):seen.append(item['uid']);return True
 monkeypatch.setattr(media,'cleanup_step',clean)
 result=run(apply.tick.__wrapped__(resource,'task',cancel=True))
 assert seen==['first'] and result['execution']['cleanup_index']==1
 result=run(apply.tick.__wrapped__(resource,'task'))
 assert seen==['first','second'] and result['execution']['cleanup_index']==2
 result=run(apply.tick.__wrapped__(resource,'task'))
 assert result['execution']['phase']=='cancelled'
 assert state(resource.sql)['execution']['selected']==['keep']


def test_download_response_lost_reloads_persisted_offset(resource,monkeypatch):
 from backend.app.native import site_sync_apply as apply
 resource.sql.db.execute("UPDATE sync_tasks SET state=json_set(state,'$.execution.media[1]',json(?))",(json.dumps({'uid':'second','version':'v','size':16384,'binary_ranges':True,'adaptive_ranges':True,'chunk_bytes':16384}),));resource.sql.db.commit()
 async def fetch(*args):return {'uid':'second','version':'v','offset':0,'raw':b'x'*16384}
 class Cache:
  async def put(self,*args):pass
 resource.cache_store=Cache();monkeypatch.setattr(apply,'fetch',fetch)
 original=resource.sql.batch;lost=False
 async def batch(rows):
  nonlocal lost
  result=await original(rows)
  if not lost:lost=True;raise RuntimeError('response lost')
  return result
 monkeypatch.setattr(resource.sql,'batch',batch)
 with pytest.raises(Error):run(apply.tick.__wrapped__(resource,'task'))
 e=state(resource.sql)['execution']
 assert e['offset']==e['bytes']==16384 and 'error' in e
 assert e['prepared']['large'].startswith('PRIVATE_PLAN')


def test_phase_transition_keeps_omitted_plan_for_next_tick(resource):
 from backend.app.native import site_sync_apply as apply
 resource.sql.db.execute("UPDATE sync_tasks SET state=json_set(state,'$.execution.file_index',2)");resource.sql.db.commit()
 result=run(apply.tick.__wrapped__(resource,'task'))
 assert result['execution']['phase']=='write-record'
 assert state(resource.sql)['execution']['prepared']['large'].startswith('PRIVATE_PLAN')


def test_latest_500_dependencies_can_exceed_500_media(sql):
 media=[{'uid':str(i),'version':None} for i in range(600)]
 sql.db.execute("UPDATE sync_tasks SET state=json_set(state,'$.execution.media',json(?),'$.execution.file_index',599)",(json.dumps(media),));sql.db.commit()
 task=run(patch.load(sql,'task'))
 assert len(task['state']['execution']['media'])==600
 assert task['state']['execution']['media'][599]['uid']=='599'
 assert sum(v is not None for v in task['state']['execution']['media'])==1
