from unittest.mock import patch
import pytest
from test_media_management_step2 import fixture,register
from backend.app.native.media_references import MediaReferences
from site_sync.admin.monitor import source_schedule_id

def test_summary_bounded_single_call_no_locations(fixture):
 c,r=fixture;row=register(r,status='active');calls=[]
 async def summaries(self,p,rows,**kwargs):
  calls.append(rows);return {x['uid']:{'used':False,'groups':[]} for x in rows}
 with patch.object(MediaReferences,'summaries',summaries),patch.object(MediaReferences,'locations',side_effect=AssertionError('full locations')):
  response=c.get('/api/admin/media/usage-summaries',params=[('uid',row['uid']),('uid','missing')])
  assert response.status_code==200 and response.headers['cache-control']=='no-store'
  assert list(response.json()['items'])==[row['uid']] and len(calls)==1
  for params in ([],[('uid','x')]*21,[('uid','')]):assert c.get('/api/admin/media/usage-summaries',params=params).status_code==400
  assert len(calls)==1
  c.cookies.clear();assert c.get('/api/admin/media/usage-summaries?uid=x',follow_redirects=False).status_code in (302,303,401,403)

@pytest.mark.parametrize('op',[None,42,'','manual:x','auto:x:r','auto::r:1','auto:x::1','auto:x:r:no','auto:x:r:1:extra','auto:x:r:١','auto:x :r:1'])
def test_bad_schedule_source(op):assert source_schedule_id({'mode':'scheduled','operation_id':op}) is None

def test_schedule_source():
 assert source_schedule_id({'mode':'scheduled','operation_id':'auto:hourly-pull:rev-123:1791465423'})=='hourly-pull'
 for mode in ('manual','proposal',None):assert source_schedule_id({'mode':mode,'operation_id':'auto:x:r:1'}) is None
 assert source_schedule_id(None) is None

def test_monitor_projects_source_without_extra_queries():
 import asyncio
 from site_sync.tests.test_admin import AdminTests
 f=AdminTests();f.setUp()
 try:
  uid=f.create()
  f.raw.connection.execute("UPDATE sync_tasks SET mode='scheduled',operation_id='auto:hourly-pull:rev:123' WHERE task_id=?",(uid,))
  calls=[];original=f.db.query
  async def query(sql,args=()):calls.append(sql);return await original(sql,args)
  with patch.object(f.db,'query',query):result=asyncio.run(f.admin.summary(f.actor))
  row=next(x for x in result['items'] if x['task_id']==uid)
  assert row['source_schedule_id']=='hourly-pull' and 'operation_id' not in row
  assert len(calls)==2 and not any('sync_schedules' in s for s in calls)
 finally:f.tearDown()
