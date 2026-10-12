"""Default router forwarding bypasses app construction on a simulated cache HIT."""
import asyncio
from types import SimpleNamespace, ModuleType
from unittest.mock import AsyncMock, Mock
import sys
import pytest
from test_startup_lazy import entry
from runtime.public_page import forward

class Headers(dict):
    def delete(self,key):self.pop(key,None)

class JSRequest:
    @staticmethod
    def new(request):
        return SimpleNamespace(url=request.url, method=request.method, headers=Headers(request.headers))


@pytest.mark.parametrize('cache_status',['HIT','STALE'])
def test_public_router_forwards_anonymously_without_app(entry,monkeypatch,cache_status):
    js=ModuleType('js');js.Request=JSRequest;monkeypatch.setitem(sys.modules,'js',js)
    response=SimpleNamespace(status=200,headers={'cf-cache-status':cache_status})
    cached=AsyncMock(return_value=response)
    obj=entry.Default();obj.env=SimpleNamespace(TEACHER_ORIGIN='https://site.test');obj.ctx=SimpleNamespace(exports=SimpleNamespace(PublicPage=SimpleNamespace(fetch=cached)))
    monkeypatch.setattr(entry,'build_application',Mock(side_effect=AssertionError('app on HIT')))
    req=SimpleNamespace(url='https://site.test/en',method='GET',headers=Headers({'host':'site.test','cookie':'secret','authorization':'Bearer secret'}))
    assert asyncio.run(obj.fetch(req)) is response
    passed=cached.call_args.args[0]
    assert 'cookie' not in passed.headers and 'authorization' not in passed.headers
    assert req.headers['cookie']=='secret' # Original request stays untouched.
    assert entry.application.application is None


def test_invalid_host_cannot_receive_platform_hit(entry,monkeypatch):
    monkeypatch.setattr(sys.modules['workers'],'Response',lambda body,**kw:SimpleNamespace(body=body,**kw),raising=False)
    hit=AsyncMock();ctx=SimpleNamespace(exports=SimpleNamespace(PublicPage=SimpleNamespace(fetch=hit)))
    req=SimpleNamespace(url='https://evil.test/en',method='GET',headers={'host':'evil.test'})
    result=asyncio.run(forward(req,SimpleNamespace(TEACHER_ORIGIN='https://site.test'),ctx))
    assert result.status==400 and result.headers['cache-control']=='no-store'
    hit.assert_not_awaited()


@pytest.mark.parametrize('path',['/admin','/auth/login','/api/public/session-summary','/sync/v1/read','/en/projects?sort=name','/en/news/id'])
def test_nonshared_routes_use_dynamic_dispatch(entry,path):
    obj=entry.Default();obj.env=SimpleNamespace();obj.ctx=SimpleNamespace()
    obj._dynamic_fetch=AsyncMock(return_value='dynamic')
    req=SimpleNamespace(url='https://site.test'+path,method='GET',headers={})
    assert asyncio.run(obj.fetch(req))=='dynamic'
    obj._dynamic_fetch.assert_awaited_once_with(req)
