"""Latest-500, bounded metadata, deletion safety and signed endpoints."""
import asyncio,json,sqlite3
from pathlib import Path
from types import SimpleNamespace
import pytest
from backend.app.native import site_sync_latest as latest,site_sync_preview as preview,site_sync_tasks as tasks,site_sync_incremental as inc
from backend.app.native.catalog import Error
from tests.test_site_sync_v121 import pair

class MemorySQL:
 def __init__(self):
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row
  self.db.executescript(Path('database/schema.sql').read_text());self.queries=[]
 async def query(self,sql,args=()):
  self.queries.append((sql,args));return [dict(v) for v in self.db.execute(sql,args)]
 async def batch(self,rows):
  return [[dict(v) for v in self.db.execute(sql,args)] for sql,args in rows]
 def seed(self,table,uid,stamp):
  title=latest.TITLE[table]
  self.db.execute(f'INSERT INTO {table}(uid,{title},updated_at) VALUES(?,?,?)',(uid,uid,stamp))

@pytest.fixture
def memory(monkeypatch):
 a,b=MemorySQL(),MemorySQL()
 async def persist(sql,task,statements=(),status='reading',**kwargs):
  await sql.batch(statements);task['status']=status
 async def call(r,p,data):
  return {**await latest.page(b,data['table'],data.get('after')),'site_id':'remote'}
 async def remote(r,task,data):
  assert data['op']=='record-head'
  return await inc.record(b,data['table'],data['key'],head=True)
 monkeypatch.setattr(tasks,'persist',persist);monkeypatch.setattr(latest,'call',call);monkeypatch.setattr(inc,'remote',remote)
 yield a,b
 a.db.close();b.db.close()

def build(scopes):
 s={'scopes':scopes,'direction':'pull','remote_id':'remote'};preview.initialize(s);latest.initialize(s)
 return {'uid':'test','state':s,'status':'reading'}

async def finish(a,task,checkpoint=False):
 r=SimpleNamespace(sql=a)
 for step in range(7000):
  await latest.advance(r,task,{})
  if checkpoint:
   saved=json.loads(json.dumps(task));task.clear();task.update(saved)
  if task['status']=='ready':break
 else:pytest.fail('Preview failed to finish')
 rows=await a.query("SELECT payload FROM sync_task_items WHERE task_uid='test' ORDER BY record_uid")
 return [json.loads(v['payload']) for v in rows]

def test_latest_500_global_and_bounded(memory):
 a,b=memory
 for n in range(550):b.seed('students',f's{n:04}',f'2026-01-01T00:{n//60:02}:{n%60:02}.000Z')
 for n in range(10):b.seed('projects',f'p{n:02}',f'2026-02-01T00:00:{n:02}.000Z')
 task=build(['students','projects']);items=asyncio.run(finish(a,task,True))
 assert len(items)==500
 assert {i['uid'] for i in items}=={f'p{n:02}' for n in range(10)}|{f's{n:04}' for n in range(60,550)}
 assert task['state']['latest_limit_reached']
 assert all('OFFSET' not in q.upper() and 'LIMIT 1' in q for q,_ in b.queries if 'ORDER BY updated_at' in q)
 assert not any('SELECT *' in q for q,_ in b.queries)
 assert task['state']['count']<=504

def test_truncation_is_not_deletion_and_old_local_preserved(memory):
 a,b=memory
 for n in range(505):
  stamp=f'2026-01-01T00:{n//60:02}:{n%60:02}.000Z';b.seed('students',f's{n:03}',stamp)
 a.seed('students','s000','2026-02-01T00:00:00.000Z')
 a.seed('students','local-old','2025-01-01T00:00:00.000Z')
 a.seed('students','deleted','2026-03-01T00:00:00.000Z')
 items=asyncio.run(finish(a,build(['students'])))
 found={x['uid']:x for x in items}
 assert found['s000']['action']=='update'
 assert found['deleted']['action']=='delete'
 assert 'local-old' not in found and len(found)==500
 assert a.db.execute("SELECT 1 FROM students WHERE uid='local-old'").fetchone()

def test_duplicate_ids_same_stamp_and_resume(memory):
 a,b=memory
 for db in (a,b):
  for n in range(7):db.seed('students',str(n),'2026-01-01T00:00:00.000Z')
 items=asyncio.run(finish(a,build(['students']),True))
 assert len(items)==7 and {v['action'] for v in items}=={'update'}

def test_latest_media_has_no_local_only_stream():
 assert [x['side'] for x in build(['media_assets'])['state']['streams']]==['remote']

@pytest.mark.parametrize('cursor',[['x'],['x',True],['x',-1],{},'uid'])
def test_bad_cursor(memory,cursor):
 with pytest.raises(Error):asyncio.run(latest.page(memory[0],'students',cursor))

def test_existing_content_index_used(memory):
 a,_=memory
 plan=a.db.execute('EXPLAIN QUERY PLAN SELECT uid FROM students WHERE (updated_at,id)<(?,?) ORDER BY updated_at DESC,id DESC LIMIT 1',('2026',1)).fetchall()
 assert any('idx_students_admin_updated' in str(tuple(v)) for v in plan)
 assert not any('TEMP B-TREE' in str(tuple(v)) for v in plan)

def test_automatic_dependency_allowance_is_separate():
 s={'auto_latest':True,'selection':{'selected':['students:'+str(n) for n in range(500)],'automatic':[]},'candidate_count':500}
 inc.queue(s,'media_assets:needed');assert len(s['selection']['selected'])==501
 s['auto_latest']=False
 with pytest.raises(Error):inc.queue(s,'media_assets:another')

def test_real_signed_endpoint_and_restart(pair):
 api,_,a,b,*_=pair
 job=asyncio.run(tasks.start(a,'pull',['students'],lightweight=True,latest_only=True))
 for _ in range(100):
  result=api('advance',{'uid':job['uid']})
  if result['status']=='ready':break
 else:pytest.fail('Signed preview did not finish')
 task=asyncio.run(tasks.get(a.sql,job['uid']));assert task['state']['latest_only']
 rows=asyncio.run(preview.listing(a.sql,task));assert len(rows['items'])==6
 restarted=api('restart',{'uid':job['uid']})
 assert asyncio.run(tasks.get(a.sql,restarted['uid']))['state']['latest_only']


def test_old_peer_stops_before_creating_task(pair,monkeypatch):
 _,_,a,*_=pair
 original=tasks.hello
 async def old(*args,**kwargs):
  value=await original(*args,**kwargs);value.pop('latest_preview',None);return value
 monkeypatch.setattr(tasks,'hello',old)
 before=asyncio.run(a.sql.query('SELECT uid FROM sync_tasks'))
 with pytest.raises(Error,match='v0.15.149'):
  asyncio.run(tasks.start(a,'pull',['students'],lightweight=True,latest_only=True))
 assert asyncio.run(a.sql.query('SELECT uid FROM sync_tasks'))==before


def test_failed_metadata_read_resumes_same_cursor(memory,monkeypatch):
 a,b=memory;b.seed('students','one','2026-01-01T00:00:00.000Z')
 task=build(['students']);r=SimpleNamespace(sql=a)
 asyncio.run(latest.advance(r,task,{})) # empty local head saved
 saved=json.loads(json.dumps(task));normal=latest.call
 async def fail(*args):raise Error('temporary network failure',502)
 monkeypatch.setattr(latest,'call',fail)
 with pytest.raises(Error):asyncio.run(latest.advance(r,task,{}))
 assert task==saved
 monkeypatch.setattr(latest,'call',normal)
 assert [v['uid'] for v in asyncio.run(finish(a,task))]==['one']
