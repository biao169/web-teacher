"""Fixed-entry HIT bypasses Python; restricted fallback is bounded and private."""
import asyncio,sys
from types import SimpleNamespace as NS,ModuleType
from unittest.mock import AsyncMock,Mock
import pytest
from test_startup_lazy import entry
from test_public_page_router_v102 import Headers,JSRequest

@pytest.mark.parametrize('status',[200,304,500,503])
def test_fixed_entry_no_dynamic_retry_on_success_or_failure(entry,monkeypatch,status):
    js=ModuleType('js');js.Request=JSRequest;monkeypatch.setitem(sys.modules,'js',js)
    result=NS(status=status,headers={'cf-cache-status':'HIT' if status==200 else 'STALE'})
    cached=AsyncMock(return_value=result);obj=entry.Default();obj.env=NS(TEACHER_ORIGIN='https://site.test');obj.ctx=NS(exports=NS(PublicPage=NS(fetch=cached)))
    obj._dynamic_fetch=AsyncMock(side_effect=AssertionError('Unexpected retry'))
    monkeypatch.setattr(entry,'build_application',Mock(side_effect=AssertionError('Application built on HIT')))
    request=NS(url='https://site.test/en/n/ai-projects',method='GET',headers=Headers({'host':'site.test','cookie':'__Host-ts_session=SESSION','authorization':'Bearer private'}))
    assert asyncio.run(obj.fetch(request)) is result
    forwarded=cached.call_args.args[0];assert not forwarded.headers.get('cookie') and not forwarded.headers.get('authorization')
    obj._dynamic_fetch.assert_not_awaited();assert entry.application.application is None

@pytest.mark.parametrize('cookie,expected',[('__Host-ts_session=SESSION',True),('public_language=en',False),('__Host-ts_session=',False),('',False)])
def test_anonymous_404_falls_back_once_only_for_real_session_cookie(entry,monkeypatch,cookie,expected):
    js=ModuleType('js');js.Request=JSRequest;monkeypatch.setitem(sys.modules,'js',js)
    missing=NS(status=404,headers={'cache-control':'no-store'})
    obj=entry.Default();obj.env=NS(TEACHER_ORIGIN='https://site.test');obj.ctx=NS(exports=NS(PublicPage=NS(fetch=AsyncMock(return_value=missing))))
    private=NS(status=200,headers={'cache-control':'no-store'});obj._dynamic_fetch=AsyncMock(return_value=private)
    request=NS(url='https://site.test/en/n/private-entry',method='GET',headers=Headers({'host':'site.test','cookie':cookie}))
    result=asyncio.run(obj.fetch(request));assert result is (private if expected else missing)
    if expected:obj._dynamic_fetch.assert_awaited_once_with(request)
    else:obj._dynamic_fetch.assert_not_awaited()
