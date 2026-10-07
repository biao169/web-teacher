"""Exercise the actual lazy builder with real FastAPI/transfer routes and local stores."""
import asyncio
from types import ModuleType
from unittest.mock import Mock
import sys
import pytest
from fastapi.testclient import TestClient
from starlette.routing import Mount
from test_startup_lazy import entry
from test_transfer_step4 import fixture, ROOT
from test_transfer_codes_v95 import test_live_issue_resolve_cancel_and_sender_fences as live_flow
from test_transfer_relay_v69 import test_ready_reserves_both_directions_and_one_block_window as relay_flow
from runtime import transfer, setup, bridge


@pytest.fixture
def builder(entry, fixture, monkeypatch):
    _, r = fixture
    worker=ModuleType('worker_runtime.resources');worker.resource_factory=lambda request:r
    monkeypatch.setitem(sys.modules,'worker_runtime.resources',worker)
    source=ROOT/'transfer/frontend/native'
    resources=ModuleType('generated_resources')
    resources.TRANSFER_TEMPLATES={p.name:p.read_text() for p in source.glob('*.html')}
    resources.TRANSFER_CATALOG=(source/'transfer-i18n-catalog.js').read_text()
    monkeypatch.setitem(sys.modules,'generated_resources',resources)
    monkeypatch.setitem(sys.modules,'worker_runtime.bridge',bridge)
    monkeypatch.setitem(sys.modules,'worker_runtime.setup',setup)
    monkeypatch.setitem(sys.modules,'worker_runtime.transfer',transfer)
    install=transfer.install
    def local_install(app, factory, templates, catalog):
        return install(app,factory,templates,catalog,lambda main:(r.test_store,main.cache_store))
    monkeypatch.setattr(transfer,'install',local_install)
    return entry,r,local_install


@pytest.mark.parametrize('mode',['lan','relay'])
def test_real_short_code_flow_reuses_lazy_application(builder, monkeypatch, mode):
    entry,r,_=builder
    entry.application = entry.LazyApplication(include_transfer=True)
    factory=Mock(wraps=entry.build_application)
    monkeypatch.setattr(entry,'build_application',factory)
    with TestClient(entry.application,base_url=r.config.origin) as c:
        # Use an existing principal's newly issued session for the lazy application.
        token=asyncio.run(r.auth.login('test-admin','Password-only-for-test','lazy'))
        r.p=asyncio.run(r.auth.principal(token))
        c.cookies.set(r.config.name('session'),token)
        live_flow((c,r),mode)
    assert factory.call_count==1


def test_real_relay_chunk_ack_state_persists(builder, monkeypatch):
    entry,r,_=builder
    entry.application = entry.LazyApplication(include_transfer=True)
    factory=Mock(wraps=entry.build_application);monkeypatch.setattr(entry,'build_application',factory)
    with TestClient(entry.application,base_url=r.config.origin) as c:
        token=asyncio.run(r.auth.login('test-admin','Password-only-for-test','lazy'))
        r.p=asyncio.run(r.auth.principal(token));c.cookies.set(r.config.name('session'),token)
        relay_flow((c,r))
    assert factory.call_count==1


def test_partial_real_install_retry_uses_fresh_routes(builder, monkeypatch):
    entry,r,install=builder
    entry.application = entry.LazyApplication(include_transfer=True)
    attempts=[]
    def flaky(app,*args):
        install(app,*args);attempts.append(app)
        if len(attempts)==1:raise RuntimeError('failure after routes installed')
    monkeypatch.setattr(transfer,'install',flaky)
    with pytest.raises(RuntimeError,match='failure after routes'):
        with TestClient(entry.application):pass
    assert entry.application.application is None
    with TestClient(entry.application,base_url=r.config.origin):pass
    assert len(attempts)==2 and attempts[0] is not attempts[1]
    for app in attempts:
        assert sum(isinstance(route,Mount) and route.path=='/transfer' for route in app.routes)==1
    assert len(attempts[0].routes)==len(attempts[1].routes)
