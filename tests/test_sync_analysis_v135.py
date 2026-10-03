"""Compare incremental graphs with the existing oracle, including failure boundaries."""
import asyncio,json
from types import SimpleNamespace
import pytest
from backend.app.native import site_sync as core,site_sync_tasks as tasks,site_sync_analysis as analysis
from backend.app.native.site_sync_work import TASK_FORMAT,DEPENDENCY_ROWS
from backend.app.native.database import Database
from backend.app.native.data_tools import encoded
from backend.app.native.catalog import Error,now
run=asyncio.run

@pytest.fixture
def job(tmp_path):
 db=Database(tmp_path/'sync.db');db.initialize()
 run(tasks.save(db,{'origin':'https://example.org','secret':'x'*64,'enabled':True}))
 def create(direction='pull'):
  uid='task-'+direction;p=run(tasks.peer(db))
  state={'preview_format':TASK_FORMAT,'direction':direction,'scopes':['media_assets'],
         'phase':'done','peer_revision':p['revision'],'count':30}
  run(db.batch([('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',(uid,'reading',encoded(state).decode(),now()))]))
  inventories={s:{t:{} for t in core.SCOPES} for s in ('local','remote')}
  def row(side,table,key,value):inventories[side][table][key]=value
  old,new='a'*32,'b'*32
  row('local','media_assets',old,{'uid':old,'object_key':'old.jpg','storage_kind':'local'})
  row('remote','media_assets',new,{'uid':new,'object_key':'new.jpg','storage_kind':'r2'})
  for i in range(13):
   for side,key in [('local','old.jpg'),('remote','new.jpg')]:row(side,'profiles',f'p{i:02}',{'uid':f'p{i:02}','name':'Teacher','avatar_key':key})
  for side,media in [('local',old),('remote',new)]:
   row(side,'news','n',{'uid':'n','title':'News','content':'<img src="/media/'+media+'">','content_format':'html'})
   row(side,'site_settings','@settings',{'uid':'settings-'+side,'homepage_profile_uid':'p00'})
  statements=[]
  for side,modules in inventories.items():
   for table,rows in modules.items():
    for key,value in rows.items():
     statements.append(analysis.put(uid,side,table,key,value))
     statements.extend(analysis.index_statements(uid,side,table,key,value))
  for offset in range(0,len(statements),20):run(db.batch(statements[offset:offset+20]))
  return SimpleNamespace(sql=db),uid,inventories
 return create


def tick(r,uid):return run(analysis.advance(r,run(tasks.get(r.sql,uid))))
def drain(r,uid):
 for _ in range(300):
  result=tick(r,uid)
  if result['status']=='ready':return run(tasks.get(r.sql,uid))['state']['items']
 pytest.fail('analysis did not finish')

def comparable(items):
 return sorted([{**v,'dependencies':sorted(v['dependencies']),'blocked':sorted(v['blocked'])} for v in items],key=lambda v:v['id'])

def expected(inventories,direction):
 source,target=('remote','local') if direction=='pull' else ('local','remote')
 return core.compare(inventories[source],inventories[target],['media_assets'])

@pytest.mark.parametrize('direction',['pull','push'])
def test_incremental_matches_oracle_without_full_snapshot_read(job,monkeypatch,direction):
 r,uid,inv=job(direction);oracle=expected(inv,direction);calls=[];normalizations=[];original=r.sql.query;normalize=core.canonical
 async def tracked(sql,args=()):
  result=await original(sql,args);calls.append((sql,len(result)))
  return result
 def canonical(t,row):normalizations.append(t);return normalize(t,row)
 monkeypatch.setattr(r.sql,'query',tracked);monkeypatch.setattr(core,'canonical',canonical)
 result=drain(r,uid)
 assert comparable(result)==comparable(oracle)
 assert len(normalizations)==2*(sum(len(inv['local'][t].keys()|inv['remote'][t].keys()) for t in core.SCOPES)-1)
 for sql,count in calls:
  if 'SELECT module,record_uid,payload' in sql:assert 'LIMIT 1' in sql and count<=1
  if 'SELECT record_uid,payload' in sql:assert count<=DEPENDENCY_ROWS+1
 assert all('SELECT * FROM sync_task_items' not in sql for sql,_ in calls)
 assert not any(x['table']=='media_assets' and x['action']=='delete' for x in result)
 selected=core.select(result,[x['id'] for x in result if x['table'] in ('profiles','news')])
 assert len(selected['selected'])==15 and not selected['blocked']
 # Auxiliary graph rows follow the existing task's foreign-key cleanup.
 run(r.sql.batch([('DELETE FROM sync_tasks WHERE uid=?',(uid,))]))
 assert not run(r.sql.query('SELECT 1 FROM sync_task_items WHERE task_uid=?',(uid,)))


def test_failed_analysis_batch_rolls_back_edges_and_cursor(job,monkeypatch):
 r,uid,inv=job();original=r.sql.batch
 async def failed(statements):
  if any(len(args)>2 and str(args[2]).startswith('@refs:') for sql,args in statements):
   # Fail inside the real SQL transaction, after its earlier writes.
   statements=[*statements,('INSERT INTO table_that_does_not_exist VALUES(1)',())]
  return await original(statements)
 monkeypatch.setattr(r.sql,'batch',failed)
 before=run(tasks.get(r.sql,uid))['_raw_state']
 with pytest.raises(Exception):tick(r,uid)
 assert run(tasks.get(r.sql,uid))['_raw_state']==before
 assert not run(r.sql.query("SELECT 1 FROM sync_task_items WHERE task_uid=? AND module LIKE '@refs:%'",(uid,)))
 monkeypatch.setattr(r.sql,'batch',original)
 assert comparable(drain(r,uid))==comparable(expected(inv,'pull'))


def test_reverse_edge_cursor_resume_after_lost_ack(job,monkeypatch):
 r,uid,inv=job();original=r.sql.batch
 # Non-media deletion still paginates incoming dependencies after media removal is excluded.
 extra={'uid':'deleted-profile','name':'Old'}
 inv['local']['profiles']['deleted-profile']=extra
 statements=[analysis.put(uid,'local','profiles','deleted-profile',extra),*analysis.index_statements(uid,'local','profiles','deleted-profile',extra)]
 for i in range(13):
  key='setting'+str(i)
  for side,value in [('local','deleted-profile'),('remote',None)]:
   row={'uid':key,'homepage_profile_uid':value};inv[side]['site_settings'][key]=row
   statements.append(analysis.put(uid,side,'site_settings',key,row))
 for offset in range(0,len(statements),20):run(r.sql.batch(statements[offset:offset+20]))
 for _ in range(200):
  tick(r,uid);s=run(tasks.get(r.sql,uid))['state']
  if s.get('analysis',{}).get('reverse_after'):break
 else:pytest.fail('reverse references did not split into pages')
 old=s['analysis']['reverse_after'];lost=False
 async def lost_ack(statements):
  nonlocal lost
  result=await original(statements)
  if not lost:lost=True;raise Error('response lost',502)
  return result
 monkeypatch.setattr(r.sql,'batch',lost_ack)
 with pytest.raises(Error):tick(r,uid)
 saved=run(tasks.get(r.sql,uid))['state']
 assert saved['analysis']['reverse_after']!=old
 monkeypatch.setattr(r.sql,'batch',original)
 result=drain(r,uid)
 assert comparable(result)==comparable(expected(inv,'pull'))
 for item in result:assert len(item['dependencies'])==len(set(item['dependencies']))


def test_unknown_target_reference_never_creates_media_deletion(job):
 r,uid,inv=job();missing='c'*32
 row={'uid':'missing','title':'bad','content':'<img src="/media/'+missing+'">','content_format':'html'}
 inv['local']['news']['missing']=row
 run(r.sql.batch([analysis.put(uid,'local','news','missing',row)]))
 result=drain(r,uid)
 assert comparable(result)==comparable(expected(inv,'pull'))
 assert not any(v['table']=='media_assets' and v['action']=='delete' for v in result)


def test_continuation_uses_record_range_in_primary_key(job,monkeypatch):
 r,uid,_=job();original=r.sql.query;plans=[]
 async def query(sql,args=()):
  if sql.startswith('SELECT module,record_uid,payload'):
   plans.extend(await original('EXPLAIN QUERY PLAN '+sql,args))
  return await original(sql,args)
 monkeypatch.setattr(r.sql,'query',query)
 rows=run(analysis.scan(r.sql,uid,'local',core.SCOPES,['profiles','p03']))
 assert rows[0]['record_uid']=='p04'
 assert any('record_uid>?' in plan['detail'] and 'USING INDEX' in plan['detail'] for plan in plans)
 assert all('SCAN ' not in plan['detail'] for plan in plans)
