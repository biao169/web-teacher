"""Cron advances shared sync without constructing the HTTP/transfer apps."""
import asyncio,sys
from types import ModuleType,SimpleNamespace
from unittest.mock import AsyncMock,Mock
from test_startup_lazy import entry


def test_disabled_schedule_does_not_load_resources(entry,monkeypatch):
 from worker_runtime.sync_schedule import run
 sql=SimpleNamespace(query=AsyncMock(return_value=[]))
 module=ModuleType('worker_runtime.resources');module.resource_factory=Mock(side_effect=AssertionError('disabled schedule constructed resources'))
 monkeypatch.setitem(sys.modules,'worker_runtime.resources',module)
 asyncio.run(run(sql,object()))
 module.resource_factory.assert_not_called()


def test_enabled_schedule_uses_normalized_resources_without_http(entry,monkeypatch):
 from worker_runtime.sync_schedule import run
 from backend.app.native import site_sync_schedule as schedule
 sql=SimpleNamespace(query=AsyncMock(return_value=[{'value':'{"enabled":true}'}]))
 env=object();base=SimpleNamespace(sql=None)
 module=ModuleType('worker_runtime.resources');module.resource_factory=Mock(return_value=base)
 monkeypatch.setitem(sys.modules,'worker_runtime.resources',module)
 tick=AsyncMock(return_value={'status':'ok'});monkeypatch.setattr(schedule,'tick',tick)
 monkeypatch.setattr(entry,'build_application',Mock(side_effect=AssertionError('HTTP built from Cron')))
 asyncio.run(run(sql,env))
 assert module.resource_factory.call_args.args[0].scope['env'] is env
 assert base.sql is sql
 tick.assert_awaited_once_with(base)
 assert entry.application.application is None


def test_cleanup_failure_still_runs_sync(entry,monkeypatch):
 import worker_runtime.bridge as bridge
 import worker_runtime.storage as storage
 import worker_runtime.cleanup as cleanup
 import worker_runtime.sync_schedule as sync
 import backend.app.adapters.d1.sql as d1
 monkeypatch.setattr(bridge,'Environment',lambda env:env)
 sql=object();monkeypatch.setattr(d1,'D1SQL',lambda binding:sql)
 monkeypatch.setattr(storage,'TransferStore',lambda *args:object())
 monkeypatch.setattr(cleanup,'run',AsyncMock(side_effect=RuntimeError('cleanup failure')))
 runner=AsyncMock();monkeypatch.setattr(sync,'run',runner)
 w=entry.Default();w.env=SimpleNamespace(TEACHER_DATABASE_BINDING='DB',TEACHER_MEDIA_BINDING='MEDIA',DB=object(),MEDIA=object())
 import pytest
 with pytest.raises(RuntimeError):asyncio.run(w.scheduled(None))
 runner.assert_awaited_once_with(sql,w.env)
