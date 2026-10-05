import asyncio,json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from test_startup_lazy import entry
from tests.test_site_sync_v121 import pair


def test_environment_does_not_resolve_unused_bindings(entry):
 from worker_runtime.bridge import Environment,Database
 env=Environment(SimpleNamespace(DB=object(),TEACHER_DATABASE_BINDING='DB',TEACHER_MEDIA_BINDING='FILES',TEACHER_CACHE_BINDING='CACHE'))
 assert env.bindings=={}
 assert isinstance(env.DB,Database) and env.DB is env.DB
 assert set(env.bindings)=={'DB'}
 with pytest.raises(AttributeError):_=env.FILES
 assert set(env.bindings)=={'DB'}


def test_heartbeat_before_business_failure_and_original_exception_preserved(pair,entry,monkeypatch,capsys):
 from backend.app.adapters.d1 import sql as d1
 from worker_runtime import maintenance
 from backend.app.native.site_sync_gate import load
 r=pair[2];monkeypatch.setattr(d1,'D1SQL',lambda binding:r.sql)
 fail=RuntimeError('PRIVATE secret')
 monkeypatch.setattr(maintenance,'run',AsyncMock(side_effect=fail))
 w=entry.Default();w.env=SimpleNamespace(DB=object(),TEACHER_DATABASE_BINDING='DB')
 with pytest.raises(RuntimeError) as caught:asyncio.run(w.scheduled(SimpleNamespace(scheduledTime=120000)))
 assert caught.value is fail
 saved=asyncio.run(load(r.sql,'site-sync:cron-health'))
 assert saved['status']=='failed' and saved['job']=='dispatch' and saved['version']=='0.15.178'
 logs=capsys.readouterr().out
 assert 'CRON-ENTRY' in logs and 'PRIVATE' not in logs and 'PRIVATE' not in str(saved)


def test_entry_logs_before_missing_database(entry,capsys):
 w=entry.Default();w.env=SimpleNamespace(TEACHER_DATABASE_BINDING='DB')
 with pytest.raises(AttributeError):asyncio.run(w.scheduled(SimpleNamespace(scheduledTime=120000)))
 rows=[json.loads(x) for x in capsys.readouterr().out.splitlines()]
 assert rows[0]['stage']=='CRON-ENTRY'
 assert any(x['stage']=='CRON-DATABASE' and x['status']=='ERROR' for x in rows)


def test_late_heartbeat_cannot_overwrite_new_invocation(pair,entry):
 from worker_runtime import cron_health as health
 from backend.app.native.site_sync_gate import load
 async def scenario():
  sql=pair[2].sql
  a=await health.start(sql,'sync');b=await health.start(sql,'history')
  await health.finish(sql,a,error=RuntimeError())
  assert (await load(sql,health.KEY))['job']=='history'
  await health.finish(sql,b,result={'skipped':'interval'})
  assert (await load(sql,health.KEY))['status']=='finished'
 asyncio.run(scenario())


def test_failed_heartbeat_does_not_stop_business(entry):
 from worker_runtime import cron_health as health
 sql=SimpleNamespace(batch=AsyncMock(side_effect=RuntimeError('storage')))
 assert asyncio.run(health.start(sql,'sync')) is None
 asyncio.run(health.finish(sql,None))


def test_boundary_sanitizes_exception_before_response_and_preserves_kill(entry):
 from worker_runtime.http_boundary import Boundary
 events=[]
 async def send(event):events.append(event)
 async def bad(*args):raise RuntimeError('PRIVATE')
 asyncio.run(Boundary(bad)({'type':'http'},None,send))
 assert events[0]['status']==503 and b'PRIVATE' not in events[1]['body']
 class Killed(BaseException):pass
 async def kill(*args):raise Killed()
 with pytest.raises(Killed):asyncio.run(Boundary(kill)({'type':'http'},None,send))
