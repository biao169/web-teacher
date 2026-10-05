import asyncio,json
from types import SimpleNamespace
import pytest
from tests.test_sync_latest_v149 import MemorySQL
from backend.app.native.site_sync_status import read
from backend.app.native.catalog import Error

def test_bounded_projection_paging_and_filters():
 sql=MemorySQL();r=SimpleNamespace(sql=sql,kind='r2')
 try:
  for n in range(25):
   state={'work':{'status':'running','completed_steps':n},'phase':'latest','direction':'pull','secret':'DO-NOT-RETURN','items':[{'body':'x'*20000}]}
   if n==0:state['execution']={'phase':'done'};state['work']['status']='saved'
   sql.db.execute('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',(str(n).zfill(3),'reading',json.dumps(state),f'2026-01-01T00:00:{n:02}.000Z'))
  first=asyncio.run(read(r));assert len(first['jobs'])==20 and first['next']
  second=asyncio.run(read(r,{'after':first['next']}));assert len(second['jobs'])==4 and second['next'] is None
  assert len({x['uid'] for x in first['jobs']+second['jobs']})==24
  assert 'DO-NOT-RETURN' not in json.dumps(first) and len(json.dumps(first))<30000
  assert all('SELECT *' not in q for q,args in sql.queries)
  allfirst=asyncio.run(read(r,{'active':False}));last=asyncio.run(read(r,{'active':False,'after':allfirst['next']}));assert len(last['jobs'])==5
  assert sql.db.execute('SELECT count(*) FROM sync_tasks').fetchone()[0]==25
 finally:sql.db.close()

@pytest.mark.parametrize('options',[{'active':'yes'},{'after':['bad']},{'after':[1,2]}])
def test_invalid_filters(options):
 sql=MemorySQL()
 try:
  with pytest.raises(Error):asyncio.run(read(SimpleNamespace(sql=sql,kind='local'),options))
 finally:sql.db.close()
