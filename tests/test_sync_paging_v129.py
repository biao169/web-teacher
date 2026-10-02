"""Bounded version pages, no full scans during content paging, and snapshot consistency."""
import asyncio,json
import pytest
from backend.app.native import site_sync as core,site_sync_tasks as tasks
from backend.app.native.catalog import Error
from tests.test_site_sync_v121 import pair
run=asyncio.run

class CountSQL:
 def __init__(self,sql):self.sql=sql;self.calls=[]
 async def query(self,sql,args=()):self.calls.append(sql);return await self.sql.query(sql,args)

def advance_until(api,r,uid,phase):
 for _ in range(350):
  state=run(tasks.get(r.sql,uid))['state']
  if state['phase']==phase:return state
  api('advance',{'uid':uid})
 pytest.fail('Phase not reached: '+phase)

def test_version_pages_match_final_guard_and_content_uses_two_queries(pair):
 api,_,ra,rb,*_=pair
 for i in range(121):run(ra.sql.batch([('INSERT INTO students(uid,name) VALUES(?,?)',(f's{i:04}','student'))]))
 sql=CountSQL(ra.sql);stamp='';total=0
 for table in sorted(core.SCOPES):
  after=''
  while True:
   part=run(core.revision_page(sql,table,after));total+=part['count']
   assert part['count']<=100
   stamp=core.revision_fold(stamp,table,part['hash'])
   if part['next'] is None:break
   after=part['next']
 assert stamp==run(core.revision(ra.sql))
 assert all('LIMIT 101' in q and 'UNION' not in q and 'count(' not in q.lower() for q in sql.calls)
 sql.calls.clear();page=run(core.page(sql,'students',''))
 assert len(page['rows'])==20 and page['next']
 assert len(sql.calls)==2 and all('UNION' not in q and 'count(' not in q.lower() for q in sql.calls)

def test_edit_with_same_count_after_reading_blocks_ready(pair):
 api,_,ra,rb,*_=pair
 run(rb.sql.batch([("INSERT INTO students(uid,name) VALUES('s','old')",())]))
 job=api('start',{'direction':'pull','scopes':['students']});uid=job['uid']
 advance_until(api,ra,uid,'verify')
 run(rb.sql.batch([("UPDATE students SET name='new',updated_at='2030-01-01T00:00:00.000Z' WHERE uid='s'",())]))
 for _ in range(100):
  result=api('advance',{'uid':uid},ok=False)
  if result.status_code!=200:break
 assert result.status_code==409 and '变化' in result.json()['error']
 assert run(tasks.get(ra.sql,uid))['status']=='reading'
 assert run(ra.sql.query("SELECT * FROM students WHERE uid='s'"))==[]

def test_pause_and_resume_does_not_repeat_completed_baseline(pair):
 api,_,ra,rb,*_=pair
 job=api('start',{'direction':'push','scopes':['students']});uid=job['uid']
 first=api('advance',{'uid':uid});saved=run(tasks.get(ra.sql,uid))['state']
 assert first['phase']=='baseline' and saved['table_index']==1
 second=api('advance',{'uid':uid})
 assert run(tasks.get(ra.sql,uid))['state']['table_index']==2
 assert second['phase']=='baseline'

def test_stale_progress_rolls_back_snapshot_writes(pair):
 api,_,ra,rb,*_=pair
 uid=api('start',{'direction':'pull','scopes':['students']})['uid']
 stale=run(tasks.get(ra.sql,uid));api('advance',{'uid':uid})
 before=run(tasks.get(ra.sql,uid))['_raw_state']
 with pytest.raises(Exception):run(tasks.persist(ra.sql,stale,[('INSERT INTO sync_task_items(task_uid,side,module,record_uid,payload) VALUES(?,?,?,?,?)',(uid,'local','students','stale','{}'))]))
 assert run(tasks.get(ra.sql,uid))['_raw_state']==before
 assert run(ra.sql.query("SELECT * FROM sync_task_items WHERE record_uid='stale'"))==[]

def test_old_preview_is_rejected_without_touching_business_data(pair):
 api,_,ra,rb,*_=pair
 uid=api('start',{'direction':'pull','scopes':['students']})['uid']
 task=run(tasks.get(ra.sql,uid));task['state'].pop('preview_format')
 run(ra.sql.batch([('UPDATE sync_tasks SET state=? WHERE uid=?',(json.dumps(task['state']),uid))]))
 response=api('advance',{'uid':uid},ok=False)
 assert response.status_code==409 and '旧版' in response.json()['error']
