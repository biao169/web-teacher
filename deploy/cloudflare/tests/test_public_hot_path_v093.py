import asyncio
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock,Mock
import pytest
from test_startup_lazy import entry
from test_public_entry_cache_v091 import request
from runtime.public_page import eligible,forward

@pytest.mark.parametrize('query',['q=test','q=','page=2','year=2026','organization=x','degree=x','status=x','sort=x','nav=x','nv=x','__recover=1'])
def test_queries_dynamic(query):
    assert not eligible(request('/en/projects?'+query),SimpleNamespace())

@pytest.mark.parametrize('headers',[{}, {'if-none-match':'"x"'}])
def test_anonymous_no_clone(monkeypatch,headers):
    clone=Mock(side_effect=AssertionError('anonymous clone'))
    monkeypatch.setitem(sys.modules,'js',SimpleNamespace(Request=SimpleNamespace(new=clone)))
    req=request(headers={'host':'site.test',**headers});req.js_object=object()
    call=AsyncMock(return_value='hit')
    ctx=SimpleNamespace(exports=SimpleNamespace(PublicPage=SimpleNamespace(fetch=call)))
    assert asyncio.run(forward(req,SimpleNamespace(TEACHER_ORIGIN='https://site.test'),ctx))=='hit'
    assert call.await_args.args[0] is req.js_object
    clone.assert_not_called()

@pytest.mark.parametrize('path',['/en','/zh','/en/profiles','/en/projects'])
def test_hot_path_no_diagnostics(entry,monkeypatch,path):
    import worker_runtime.public_page as route
    import worker_runtime.request_diagnostics as diagnostics
    for name in ('invocation','request_context','scope','record'):
        monkeypatch.setattr(diagnostics,name,Mock(side_effect=AssertionError(name)))
    forwarder=AsyncMock(return_value=object())
    monkeypatch.setattr(route,'forward',forwarder)
    obj=entry.Default();obj.env=SimpleNamespace();obj.ctx=SimpleNamespace()
    assert not hasattr(entry.Default.fetch,'__wrapped__')
    assert hasattr(entry.Default._dynamic_fetch,'__wrapped__')
    assert asyncio.run(obj.fetch(request(path))) is forwarder.return_value

@pytest.mark.parametrize('path',['/admin','/auth/login','/api/public/session-summary','/sync/v1/read','/en/projects?page=2'])
def test_dynamic_dispatch(entry,monkeypatch,path):
    obj=entry.Default();obj.env=SimpleNamespace();obj.ctx=SimpleNamespace()
    dynamic=AsyncMock(return_value='dynamic');monkeypatch.setattr(obj,'_dynamic_fetch',dynamic)
    assert asyncio.run(obj.fetch(request(path)))=='dynamic'
    dynamic.assert_awaited_once()

def test_forward_error_logged_without_retry(entry,monkeypatch):
    import worker_runtime.public_page as route
    forwarder=AsyncMock(side_effect=RuntimeError('loopback failure'))
    monkeypatch.setattr(route,'forward',forwarder)
    log=Mock();monkeypatch.setattr(entry,'emit',log)
    obj=entry.Default();obj.env=SimpleNamespace();obj.ctx=SimpleNamespace()
    with pytest.raises(RuntimeError):asyncio.run(obj.fetch(request()))
    forwarder.assert_awaited_once()
    assert log.call_args.args==('PUBLIC-FORWARD','ERROR')
