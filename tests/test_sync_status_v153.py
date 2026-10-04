import asyncio,json
from types import SimpleNamespace
from tests.test_sync_latest_v149 import MemorySQL
from backend.app.native.site_sync_status import read


def test_status_metadata_is_read_only_bounded_and_preserves_terminal_filter():
 sql=MemorySQL()
 try:
  for uid,status,phase in [('a','reading',None),('b','ready','done'),('c','ready','cancelled'),('d','expired',None)]:
   state={'work':{'status':'paused','operation':'advance','phase':'selected-load','retryable':True,'retry_count':2,'elapsed_ms':12,'failed_at':'2026-01-01T00:00:00Z','error_code':'sync_timeout','error':'x'*900},'parent_uid':'parent','prepared_uid':'child','restart_uid':'new','load_index':7,'execution':{'phase':phase},'secret':'PRIVATE','items':[{'body':'PRIVATE'}]}
   sql.db.execute('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',(uid,status,json.dumps(state),'2026-01-01T00:00:00Z'))
  before=sql.db.total_changes
  value=asyncio.run(read(SimpleNamespace(sql=sql,kind='r2')))
  assert sql.db.total_changes==before
  assert [j['uid'] for j in value['jobs']]==['a']
  job=value['jobs'][0]
  assert job['retryable']==1 and job['operation']=='advance' and job['work_phase']=='selected-load'
  assert job['parent_uid']=='parent' and job['prepared_uid']=='child' and job['restart_uid']=='new'
  assert job['load_index']==7 and job['elapsed_ms']==12 and job['error_code']=='sync_timeout'
  assert len(job['error'])==500 and 'PRIVATE' not in json.dumps(value)
  history=asyncio.run(read(SimpleNamespace(sql=sql,kind='r2'),{'active':False}))
  assert len(history['jobs'])==4
  assert all(q.lstrip().upper().startswith('SELECT') for q,args in sql.queries)
 finally:sql.db.close()
