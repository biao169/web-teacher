"""Chunk-independent revisions, byte budgets and resumable bounded content reads."""
import asyncio
import pytest
from backend.app.native import site_sync as core,site_sync_tasks as tasks
from backend.app.native.catalog import Error
from tests.test_site_sync_v121 import pair
run=asyncio.run

@pytest.fixture(autouse=True)
def empty_students(pair):
 for r in pair[2:4]:run(r.sql.batch([("DELETE FROM students",())]))


def seed(sql,uid,text):
 run(sql.batch([('INSERT INTO students(uid,name,bio) VALUES(?,?,?)',(uid,'Student',text))]))


def test_revision_digest_survives_changing_page_size(pair):
 _,_,ra,*_=pair
 for i in range(43):seed(ra.sql,f's{i:03}','')
 stamp='';seen=[]
 for table in sorted(core.SCOPES):
  after='';n=0
  while True:
   limit=(1,7,20,3)[n%4];n+=1
   part=run(core.revision_page(ra.sql,table,after,limit))
   assert len(part['rows'])<=limit
   stamp=core.revision_fold(stamp,table,part['rows'],first=not after)
   if table=='students':seen.extend(r['uid'] for r in part['rows'])
   if part['next'] is None:break
   after=part['next']
 assert len(seen)==len(set(seen))==43
 assert stamp==run(core.revision(ra.sql))
 assert core.revision_fold('', 'students', [], first=True)!=core.revision_fold('', 'news', [], first=True)


def test_large_record_alone_and_no_skipped_lookahead(pair):
 _,_,ra,*_=pair
 for uid,text in [('a','small'),('b','中'*24000),('c','\\"\n'*1000),('d','small')]:seed(ra.sql,uid,text)
 after='';seen=[];pages=[]
 while True:
  part=run(core.page(ra.sql,'students',after));pages.append(part)
  assert part['bytes']==len(core.encoded(part['rows']))
  assert part['bytes']<=core.PAGE_BYTES or len(part['rows'])==1
  seen.extend(r['uid'] for r in part['rows'])
  if part['next'] is None:break
  after=part['next']
 assert seen==['a','b','c','d']
 assert any([r['uid'] for r in p['rows']]==['b'] for p in pages)


def test_oversized_lookahead_preserves_earlier_records(pair):
 _,_,ra,*_=pair
 for i in range(5):seed(ra.sql,str(i),'')
 seed(ra.sql,'5','x'*(core.RECORD_BYTES+1))
 part=run(core.page(ra.sql,'students'))
 assert len(part['rows'])==5 and part['next']=='4'
 with pytest.raises(Error,match='200KB'):run(core.page(ra.sql,'students',part['next']))
 # Editing the offending row permits continuation with the exact same cursor.
 run(ra.sql.batch([("UPDATE students SET bio='fixed' WHERE uid='5'",())]))
 resumed=run(core.page(ra.sql,'students',part['next']))
 assert [r['uid'] for r in resumed['rows']]==['5'] and resumed['next'] is None


@pytest.mark.parametrize('limit',[0,-1,6,True,'2'])
def test_invalid_content_limit_rejected(pair,limit):
 _,_,ra,*_=pair
 with pytest.raises(Error):run(core.page(ra.sql,'students',limit=limit))


def test_saved_content_cursor_survives_smaller_batch(pair):
 api,_,ra,rb,*_=pair
 for i in range(8):seed(rb.sql,f's{i}','small')
 uid=api('start',{'direction':'pull','scopes':['students']})['uid']
 for _ in range(150):
  s=run(tasks.get(ra.sql,uid))['state']
  if s['phase']=='content' and s['side']=='remote' and core.SCOPES[s['table_index']]=='students':break
  api('advance',{'uid':uid})
 else:pytest.fail('content phase not reached')
 api('advance',{'uid':uid})
 task=run(tasks.get(ra.sql,uid));assert task['state']['after']=='s4'
 task['state']['policy']['content_rows']=1
 run(tasks.persist(ra.sql,task))
 api('advance',{'uid':uid})
 assert run(tasks.get(ra.sql,uid))['state']['after']=='s5'
 for _ in range(600):
  result=api('advance',{'uid':uid})
  if result['status']=='ready':break
 else:pytest.fail('preview incomplete')
 rows=run(ra.sql.query("SELECT record_uid FROM sync_task_items WHERE task_uid=? AND side='remote' AND module='students' ORDER BY record_uid",(uid,)))
 assert [r['record_uid'] for r in rows]==[f's{i}' for i in range(8)]


def test_incomplete_page_cannot_generate_deletions(pair,monkeypatch):
 api,_,ra,rb,*_=pair
 seed(rb.sql,'s','present')
 uid=api('start',{'direction':'pull','scopes':['students']})['uid']
 for _ in range(150):
  s=run(tasks.get(ra.sql,uid))['state']
  if s['phase']=='content' and s['side']=='remote' and core.SCOPES[s['table_index']]=='students':break
  api('advance',{'uid':uid})
 else:pytest.fail('content phase not reached')
 original=core.page
 async def truncated(sql,table,after='',limit=None):
  if table=='students':return {'rows':[],'next':None}
  return await original(sql,table,after,limit)
 monkeypatch.setattr(core,'page',truncated)
 response=api('advance',{'uid':uid},ok=False)
 assert response.status_code!=200 and '不完整' in response.json()['error']
 saved=run(tasks.get(ra.sql,uid))
 assert saved['status']=='reading' and saved['state']['after']==''
 assert saved['state']['work']['status']=='paused'
 assert not run(ra.sql.query('SELECT uid FROM students'))
