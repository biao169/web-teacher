import asyncio,sys,json
from types import ModuleType,SimpleNamespace
from unittest.mock import AsyncMock,Mock
import pytest
from test_startup_lazy import entry

@pytest.mark.parametrize('policy,state,active,skip',[
 ({},{},False,'disabled'),
 ({'enabled':True,'auto_pull':True},{'next_due':'9999'},False,'interval'),
 ({'enabled':True,'auto_pull':True},{'retry_after':'9999'},True,'interval'),
 ({'enabled':True,'auto_pull':False},{},False,'waiting'),
 ({'enabled':True,'auto_pull':False},{'next_due':'9999'},True,None),
 ({'enabled':True,'auto_pull':True},{'preview_uid':'p','next_due':'9999'},False,None),
 ({'enabled':True,'auto_pull':True},{},False,None),
])
def test_gate(entry,monkeypatch,policy,state,active,skip):
 from worker_runtime.sync_schedule import run
 from backend.app.native import site_sync_schedule as schedule
 async def query(sql,args=()):
  if 'sync_tasks' in sql:return [{'uid':'task'}] if active else []
  return [{'value':json.dumps(state if args[0].endswith('-state') else policy)}]
 sql=SimpleNamespace(query=query);base=SimpleNamespace(sql=None)
 module=ModuleType('worker_runtime.resources');module.resource_factory=Mock(return_value=base)
 monkeypatch.setitem(sys.modules,'worker_runtime.resources',module)
 tick=AsyncMock(return_value={'status':'ok'});monkeypatch.setattr(schedule,'tick',tick)
 result=asyncio.run(run(sql,object()))
 if skip:
  assert result=={'skipped':skip};module.resource_factory.assert_not_called();tick.assert_not_awaited()
 else:
  tick.assert_awaited_once_with(base,prune_history=False);assert base.sql is sql
 assert entry.application.application is None

@pytest.mark.parametrize('minute,expected',[(0,'transfer'),(1,'history'),(2,'sync'),(9,'sync'),(10,'transfer')])
def test_single_job(entry,monkeypatch,minute,expected):
 from worker_runtime import maintenance,cleanup,sync_schedule,storage
 from backend.app.native import site_sync_history as history
 runners={k:AsyncMock(return_value={}) for k in ('transfer','history','sync')}
 monkeypatch.setattr(cleanup,'run',runners['transfer']);monkeypatch.setattr(history,'prune',runners['history']);monkeypatch.setattr(sync_schedule,'run',runners['sync'])
 monkeypatch.setattr(storage,'TransferStore',Mock(return_value=object()))
 sql=object();env=SimpleNamespace(TEACHER_MEDIA_BINDING='MEDIA',MEDIA=object())
 assert asyncio.run(maintenance.run(sql,env,SimpleNamespace(scheduledTime=minute*60000)))[0]==expected
 assert sum(x.await_count for x in runners.values())==1
 assert runners[expected].await_count==1
 if expected=='history':runners['history'].assert_awaited_once_with(sql,batch=1)
 if expected!='transfer':storage.TransferStore.assert_not_called()

def test_failure_does_not_chain(entry,monkeypatch):
 from worker_runtime import maintenance,cleanup,sync_schedule,storage
 monkeypatch.setattr(storage,'TransferStore',lambda *a:object())
 monkeypatch.setattr(cleanup,'run',AsyncMock(side_effect=RuntimeError('failed')))
 runner=AsyncMock();monkeypatch.setattr(sync_schedule,'run',runner)
 env=SimpleNamespace(TEACHER_MEDIA_BINDING='MEDIA',MEDIA=object())
 with pytest.raises(RuntimeError):asyncio.run(maintenance.run(object(),env,SimpleNamespace(scheduledTime=0)))
 runner.assert_not_awaited()
 assert maintenance.job_for(SimpleNamespace(scheduledTime=120000))=='sync'
