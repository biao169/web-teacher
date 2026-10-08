import asyncio
import importlib.util
from pathlib import Path
import secrets
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock
import pytest

HERE = Path(__file__).resolve().parents[1]

@pytest.fixture
def entry(monkeypatch):
    workers=ModuleType('workers')
    workers.WorkerEntrypoint=type('WorkerEntrypoint', (), {})
    workers.DurableObject=type('DurableObject', (), {})
    async def fetch(app, request, env, ctx):
        return await app({}, None, None)
    workers.asgi=SimpleNamespace(fetch=fetch)
    monkeypatch.setitem(sys.modules,'workers',workers)
    runtime=ModuleType('worker_runtime');runtime.__path__=[str(HERE/'runtime')]
    monkeypatch.setitem(sys.modules,'worker_runtime',runtime)
    spec=importlib.util.spec_from_file_location('startup_test_entry',HERE/'runtime/entrypoint.py')
    module=importlib.util.module_from_spec(spec)
    with monkeypatch.context() as patch:
        patch.setattr(secrets,'token_hex',Mock(side_effect=OSError('startup entropy forbidden')))
        spec.loader.exec_module(module)
    return module


def test_module_load_does_not_build_application(entry):
    assert entry.application.application is None


def test_first_request_builds_once_and_preserves_state(entry, monkeypatch):
    calls=[]
    async def app(scope, receive, send):calls.append(scope)
    factory=Mock(return_value=app);monkeypatch.setattr(entry,'build_application',factory)
    async def run():
        await entry.application({'first':1},None,None)
        await entry.application({'second':2},None,None)
    asyncio.run(run())
    assert factory.call_count==1 and len(calls)==2


def test_failed_build_can_retry_without_publishing_partial_app(entry, monkeypatch):
    async def app(*args):pass
    factory=Mock(side_effect=[ValueError('install failed'),app])
    monkeypatch.setattr(entry,'build_application',factory)
    with pytest.raises(ValueError):asyncio.run(entry.application({},None,None))
    assert entry.application.application is None
    asyncio.run(entry.application({},None,None))
    assert entry.application.application is app


def test_coordinator_app_is_stable_and_instance_scoped(entry, monkeypatch):
    apps=[]
    def build(**kwargs):
        assert kwargs == {"include_transfer": True}
        async def app(*args):pass
        apps.append(app);return app
    monkeypatch.setattr(entry,'build_application',build)
    a,b=entry.TransferCoordinator(),entry.TransferCoordinator()
    for obj in (a,b):obj.env=None;obj.ctx=None
    async def run():
        await a.fetch(None);await a.fetch(None);await b.fetch(None)
    asyncio.run(run())
    assert len(apps)==2
    assert a._application.application is not b._application.application

def test_request_failure_does_not_replace_application_or_retain_task(entry):
    calls=[]
    async def app(scope,receive,send):
        calls.append(scope['path'])
        if scope['path']=='/fail':raise RuntimeError('one request failure')
    entry.application.application=app
    with pytest.raises(RuntimeError):asyncio.run(entry.application({'path':'/fail'},None,None))
    asyncio.run(entry.application({'path':'/'},None,None))
    assert entry.application.application is app
    assert calls==['/fail','/']
    assert set(vars(entry.application))=={'application','include_transfer'}
