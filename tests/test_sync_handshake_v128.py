"""Lightweight authenticated hello, paired-version gate, unchanged business checks."""
import asyncio
import pytest
from backend.app.native import site_sync as core,site_sync_tasks as tasks,site_sync_transport as transport
from backend.app.native.catalog import Error
from tests.test_site_sync_v121 import pair

def test_both_sites_hello_never_reads_business_revision_or_writes_tasks(pair,monkeypatch):
 api,_,ra,rb,a,b,network=pair
 calls=[]
 async def forbidden(*args):calls.append('revision');raise RuntimeError('D1_ERROR: database failed')
 monkeypatch.setattr(core,'revision',forbidden)
 monkeypatch.setattr(core,'revision_page',forbidden)
 result=api('test')
 assert result['protocol']==core.PROTOCOL and result['data_check']==1 and 'revision' not in result
 p=asyncio.run(tasks.peer(rb.sql))
 reverse=asyncio.run(tasks.hello(rb,p))
 assert reverse['site_id']!=result['site_id'] and 'revision' not in reverse
 assert calls==[]
 for r in (ra,rb):assert asyncio.run(r.sql.query('SELECT count(*) AS n FROM sync_tasks'))[0]['n']==0
 job=api('start',{'direction':'pull','scopes':['students']})
 failed=api('advance',{'uid':job['uid']},ok=False)
 assert failed.status_code==500
 assert calls==['revision']
 assert asyncio.run(ra.sql.query("SELECT count(*) AS n FROM sync_tasks WHERE status='ready'"))[0]['n']==0

def test_peer_rejects_old_protocol_and_invalid_signatures(pair):
 api,_,ra,rb,a,b,network=pair
 value=transport.envelope('s'*64,{'op':'hello','schema':core.schema(),'protocol':1})
 result=b.post('/api/site-sync/peer',json=value,headers={'Accept':'application/json'})
 assert result.status_code==409 and 'v0.15.130' in result.json()['error']
 value=transport.envelope('wrong'*10,{'op':'hello','schema':core.schema(),'protocol':core.PROTOCOL})
 assert b.post('/api/site-sync/peer',json=value,headers={'Accept':'application/json'}).status_code==403

@pytest.mark.parametrize('patch',[
 {'protocol':1},{'data_check':None},{'site_id':None},{'revision':None},{'revision':'z'*64}
])
def test_incompatible_or_incomplete_data_check_stops_before_task_write(pair,monkeypatch,patch):
 api,_,ra,rb,a,b,network=pair
 async def invalid(r,p,data):
  return {'schema':core.schema(),'protocol':core.PROTOCOL,'data_check':1,'site_id':'peer','revision':'a'*64,**patch}
 monkeypatch.setattr(tasks,'call',invalid)
 with pytest.raises(Error) as caught:asyncio.run(tasks.hello(ra,asyncio.run(tasks.peer(ra.sql)),with_revision=True))
 assert caught.value.status==409
 assert asyncio.run(ra.sql.query('SELECT count(*) AS n FROM sync_tasks'))[0]['n']==0
