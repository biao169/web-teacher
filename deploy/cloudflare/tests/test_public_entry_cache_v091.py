import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from runtime.public_page import eligible,forward
from runtime.cache_policy import edge_cache,entrypoint_cache
from test_startup_lazy import entry

def request(path='/en',method='GET',headers=None):
    return SimpleNamespace(url='https://site.test'+path,method=method,headers=headers or {})

@pytest.mark.parametrize('path',['/en','/zh','/en/profiles','/en/projects','/en/publications','/zh/students?q=a'])
@pytest.mark.parametrize('method',['GET','HEAD'])
def test_allow(path,method):assert eligible(request(path,method),SimpleNamespace())

@pytest.mark.parametrize('path',['/admin','/auth/login','/api/public/session-summary','/sync/v1/read','/en/contact','/en/news/one','/en/projects?nav=x','/en?__recover=1','/en?n%76=x','/en/unknown','/en/profiles/uid'])
def test_exclude(path):assert not eligible(request(path),SimpleNamespace())

@pytest.mark.parametrize('headers',[{'x-public-fragment':'1'},{'accept':'application/json'},{'range':'bytes=0-8'}])
def test_headers(headers):assert not eligible(request(headers=headers),SimpleNamespace())

def test_mode_and_method():
    assert not eligible(request(method='POST'),SimpleNamespace())
    assert not eligible(request(),SimpleNamespace(TEACHER_WORKER_CACHE_MODE='off'))
    for mode in ('simple','full','off'):
        env={'TEACHER_WORKER_CACHE_MODE':mode}
        assert edge_cache(env)['enabled'] is False
        assert entrypoint_cache(env)['default']['cache']['enabled'] is False
        assert entrypoint_cache(env)['PublicPage']['cache']['enabled']==(mode!='off')

def test_forward_anonymous_without_mutating_original(monkeypatch):
    import sys
    class Headers(dict):
        def delete(self,key):self.pop(key,None)
    def clone(req):return SimpleNamespace(url=req.url,method=req.method,headers=Headers(req.headers))
    monkeypatch.setitem(sys.modules,'js',SimpleNamespace(Request=SimpleNamespace(new=clone)))
    req=request(headers={'host':'site.test','cookie':'secret','authorization':'secret','if-none-match':'etag'})
    call=AsyncMock(return_value='cached')
    ctx=SimpleNamespace(exports=SimpleNamespace(PublicPage=SimpleNamespace(fetch=call)))
    assert asyncio.run(forward(req,SimpleNamespace(TEACHER_ORIGIN='https://site.test'),ctx))=='cached'
    forwarded=call.await_args.args[0]
    assert 'cookie' not in forwarded.headers and 'authorization' not in forwarded.headers
    assert forwarded.headers['if-none-match']=='etag' and req.headers['cookie']=='secret'
    req.headers['host']='evil.test'
    monkeypatch.setitem(sys.modules,'workers',SimpleNamespace(Response=lambda body,**kw:SimpleNamespace(body=body,**kw)))
    assert asyncio.run(forward(req,SimpleNamespace(TEACHER_ORIGIN='https://site.test'),ctx)).status==400
    assert call.await_count==1

def test_router_uses_loopback_not_public_application(entry,monkeypatch):
    import worker_runtime.public_page as route
    response=SimpleNamespace(status=200,headers={})
    forwarder=AsyncMock(return_value=response);monkeypatch.setattr(route,'forward',forwarder)
    monkeypatch.setattr(entry,'dispatch',AsyncMock(side_effect=AssertionError('render on router')))
    obj=entry.Default();obj.env=SimpleNamespace();obj.ctx=SimpleNamespace()
    assert asyncio.run(entry.Default.fetch.__wrapped__(obj,request())) is response
    forwarder.assert_awaited_once()
    assert entry.application.application is None

def test_named_entry_miss_dispatches_once(entry,monkeypatch):
    response=SimpleNamespace(status=200,headers={})
    dispatch=AsyncMock(return_value=response);monkeypatch.setattr(entry,'dispatch',dispatch)
    obj=entry.PublicPage();obj.env=SimpleNamespace();obj.ctx=SimpleNamespace()
    assert asyncio.run(obj.fetch(request())) is response
    dispatch.assert_awaited_once()
