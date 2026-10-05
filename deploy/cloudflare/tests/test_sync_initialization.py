"""Worker imports and object construction have persisted, separate boundaries."""
import asyncio,builtins,sys
from types import ModuleType
from unittest.mock import Mock
import pytest
from test_startup_lazy import entry
from tests.test_site_sync_v121 import pair
from tests.test_sync_grant_errors_v169 import seed
from tests.test_sync_dispatch_v170 import saved
run=asyncio.run

def test_worker_records_factory_before_construction_and_business_after(pair,entry,monkeypatch):
 from worker_runtime.sync_schedule import run as cron
 from backend.app.native import site_sync_dispatch as dispatch,site_sync_initialization as init
 api,_,r,*_=pair;uid=seed(api,r);observed=[]
 original=init.advance
 async def advance(name,**kw):
  await original(name,**kw)
  rows=await r.sql.query('SELECT value FROM service_meta WHERE key=?',(dispatch.PREFIX+uid,))
  import json
  observed.append(json.loads(rows[0]['value'])['initialization']['stages'][-1]['phase'])
 monkeypatch.setattr(init,'advance',advance)
 module=ModuleType('worker_runtime.sync_resources');module.resource_factory=Mock(return_value=r)
 monkeypatch.setitem(sys.modules,'worker_runtime.sync_resources',module)
 result=run(cron(r.sql,object()))
 assert result['status']=='ok' and module.resource_factory.call_count==1
 assert observed[:5]==['latest_gate','resource_modules','schedule_modules','resource_factory','dispatch']
 trace=saved(r,uid)['initialization']
 assert [x['phase'] for x in trace['stages']]==['receipt_reconcile','latest_gate','resource_modules','schedule_modules','resource_factory','dispatch','authorization','execution_lease','business_step','receipt_save']
 assert all(x['status']=='completed' for x in trace['stages'])
 assert trace['stages'][2]['module_cached'] is True
 assert entry.application.application is None

@pytest.mark.parametrize('forced',[False,True])
def test_import_termination_is_located_without_creating_resources(pair,entry,monkeypatch,forced):
 from worker_runtime.sync_schedule import run as cron
 class Terminated(BaseException):pass
 api,_,r,*_=pair;uid=seed(api,r);original=builtins.__import__
 def load(name,*args,**kw):
  if name=='worker_runtime.sync_resources':
   if forced:raise Terminated()
   raise RuntimeError('PRIVATE token or URL')
  return original(name,*args,**kw)
 monkeypatch.delitem(sys.modules,'worker_runtime.sync_resources',raising=False)
 monkeypatch.setattr(builtins,'__import__',load)
 if forced:
  with pytest.raises(Terminated):run(cron(r.sql,object()))
 else:assert run(cron(r.sql,object()))['status']=='paused'
 receipt=saved(r,uid);last=receipt['initialization']['stages'][-1]
 assert last['phase']=='resource_modules' and last['module_cached'] is False
 assert last['status']==('running' if forced else 'failed')
 assert ('elapsed_ms' in last)==(not forced)
 assert 'PRIVATE' not in str(receipt)
