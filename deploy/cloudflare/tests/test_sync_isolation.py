import asyncio,importlib.util,sys
from types import SimpleNamespace,ModuleType
from unittest.mock import AsyncMock,Mock
from test_startup_lazy import entry

def test_separate_main_tick_never_enters_runner(entry,monkeypatch):
    tick=AsyncMock(side_effect=AssertionError('main must not tick'))
    monkeypatch.setattr('site_sync.integration.worker_schedule.run',tick)
    obj=entry.Default();obj.env=SimpleNamespace(TEACHER_SYNC_EXECUTOR_MODE='separate')
    assert 'separate-executor-only' in asyncio.run(obj.sync_tick())
    tick.assert_not_awaited()

def test_separate_peer_forwards_without_website(entry,monkeypatch):
    remote=AsyncMock(return_value=SimpleNamespace(status=200))
    website=AsyncMock(side_effect=AssertionError('website application initialized'))
    monkeypatch.setattr(entry,'dispatch',website)
    obj=entry.Default();obj.env=SimpleNamespace(TEACHER_SYNC_EXECUTOR_MODE='separate',SYNC_EXECUTOR=SimpleNamespace(fetch=remote));obj.ctx=None
    req=SimpleNamespace(url='https://site.test/sync/v1/read',headers={})
    assert asyncio.run(obj.fetch(req)).status==200
    remote.assert_awaited_once_with(req);website.assert_not_awaited()
    assert entry.application.application is None

def test_failed_executor_does_not_fallback_and_next_page_works(entry,monkeypatch):
    response=SimpleNamespace(new=lambda _,config:SimpleNamespace(status=config['status']))
    monkeypatch.setitem(sys.modules,'js',SimpleNamespace(Response=response,Object=SimpleNamespace(fromEntries=None)))
    monkeypatch.setitem(sys.modules,'pyodide.ffi',SimpleNamespace(to_js=lambda value,**kw:value))
    website=AsyncMock(return_value=SimpleNamespace(status=200));monkeypatch.setattr(entry,'dispatch',website)
    obj=entry.Default();obj.env=SimpleNamespace(TEACHER_SYNC_EXECUTOR_MODE='separate',SYNC_EXECUTOR=SimpleNamespace(fetch=AsyncMock(side_effect=RuntimeError('executor failed'))));obj.ctx=None
    assert asyncio.run(obj.fetch(SimpleNamespace(url='https://site.test/sync/v1/read',headers={}))).status==503
    website.assert_not_awaited()
    assert asyncio.run(obj.fetch(SimpleNamespace(url='https://site.test/',headers={}))).status==200
    website.assert_awaited_once()

def test_peer_asgi_uses_only_minimal_resources(monkeypatch):
    from runtime import sync_resources
    from site_sync.tests_website.test_integration import IntegrationTests
    from site_sync.transport.protocol import encode,request_headers
    from fastapi.testclient import TestClient
    f=IntegrationTests();f.setUp()
    try:
        from site_sync.integration.database import adapter
        db=adapter(f.source)
        class SQL:
            binding=None
            async def query(self,*args):return await db.query(*args)
        sql=SQL()
        monkeypatch.setattr(sync_resources,'Environment',lambda env:SimpleNamespace(DB=object(),TEACHER_DATABASE_BINDING='DB',TEACHER_SYNC_KEY='6a'*32))
        monkeypatch.setattr(sync_resources,'D1SQL',lambda binding:sql)
        monkeypatch.setattr('site_sync.integration.peer_api.adapter',lambda r:db)
        monkeypatch.setattr('site_sync.integration.control.adapter',lambda r:db)
        monkeypatch.setattr('site_sync.integration.credentials.adapter',lambda r:db)
        monkeypatch.setattr('site_sync.integration.host.adapter',lambda r:db)
        monkeypatch.setattr('backend.app.native.web.create_app',Mock(side_effect=AssertionError('website factory called')))
        async def app(scope,receive,send):await sync_resources.application(dict(scope,env=object()),receive,send)
        with TestClient(app) as client:
            body=encode({'kind':'probe','version':'probe-v1','scope':['news']})
            result=client.post('/sync/v1/read',content=body,headers=request_headers(bytes.fromhex('6a'*32),body))
            assert result.status_code==200,result.text
            assert client.get('/').status_code==404
    finally:f.tearDown()
