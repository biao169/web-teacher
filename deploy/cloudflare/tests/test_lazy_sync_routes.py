import asyncio
from functools import partial
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from backend.app.native.web import create_app
from site_sync.integration.lazy_routes import LazySyncRoutes,is_sync
from site_sync.tests_website import test_credentials_api as credential_tests
from site_sync.tests_website.test_web_isolation import WebIsolationTests

# Run existing credential and active-task isolation contracts through the new
# Worker route boundary, including malformed requests and no-store failures.
class LazyIsolationTests(WebIsolationTests):
    def setUp(self):
        with patch.object(credential_tests,'create_app',partial(create_app,lazy_sync=True)):
            super().setUp()

@pytest.mark.parametrize('path,matched',[('/admin/site-sync',True),('/admin/site-sync/api/tasks',True),('/api/admin/site-sync/credentials',True),('/sync/v1/read',True),('/admin/site-sync-extra',False),('/en',False),('/admin/profiles',False)])
def test_exact_route_boundary(path,matched):assert is_sync(path)==matched

def test_application_construction_never_resolves_resources():
    def forbidden(*args):raise AssertionError('factory used at construction')
    with patch('site_sync.integration.web.install',side_effect=AssertionError('sync routes built')):
        app=create_app(forbidden,lazy_sync=True)
    deferred=[r for r in app.routes if isinstance(r,LazySyncRoutes)]
    assert len(deferred)==1 and deferred[0].router is None
    assert not any(getattr(r,'path',None)=='/admin/site-sync' for r in app.routes)

def test_failed_sync_install_does_not_poison_public_application():
    f=credential_tests.fixture.IntegrationTests();f.setUp()
    try:
        app=create_app(lambda req:f.target,lazy_sync=True)
        route=next(r for r in app.routes if isinstance(r,LazySyncRoutes))
        with TestClient(app,base_url=f.target.config.origin) as client:
            client.cookies.set(f.target.config.name('session'),'test-token')
            with patch('site_sync.integration.web.install',side_effect=RuntimeError('injected route failure')):
                assert client.get('/en').status_code==200
                with pytest.raises(RuntimeError,match='injected route failure'):client.get('/admin/site-sync')
                assert route.router is None
                assert client.get('/en').status_code==200
            assert client.get('/admin/site-sync').status_code==200
            router=route.router
            assert client.get('/admin/site-sync/api/options').status_code==200
            assert route.router is router
    finally:f.tearDown()

def test_clone_write_guard_is_active_before_sync_routes_exist():
    from fastapi import FastAPI
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from site_sync.integration.lazy_routes import install
    app=FastAPI();query=AsyncMock(return_value=[{'locked':1}])
    async def resources(request):return SimpleNamespace(sql=SimpleNamespace(query=query))
    install(app,resources,None,None)
    @app.get('/ordinary')
    async def view():return {'ok':True}
    @app.post('/ordinary')
    async def edit():raise AssertionError('write bypassed clone guard')
    route=next(r for r in app.routes if isinstance(r,LazySyncRoutes))
    with TestClient(app) as client:
        assert client.get('/ordinary').status_code==200
        query.assert_not_awaited()
        assert client.post('/ordinary').status_code==409
    query.assert_awaited_once()
    assert route.router is None
