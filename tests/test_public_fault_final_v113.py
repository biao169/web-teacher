"""Regeneration faults remain faults after operator purge; no live platform cache."""
import asyncio,json,re
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock,patch
import pytest
from fastapi.testclient import TestClient
from test_accounts_regression import fixture
from backend.app.native.web_public import create_public_app
from backend.app.native.public_cache_tags import RESET_HEADER
from test_startup_lazy import entry

@pytest.mark.parametrize('module',['profiles','projects'])
def test_operator_purge_does_not_hide_regeneration_500_or_repeat(entry,fixture,monkeypatch,module,caplog):
    import workers,worker_runtime.public_invalidation as invalidation
    c,r=fixture;r.kind='r2'
    pending=c.post('/api/admin/public-cache/reset',json={'module':module,'_csrf':r.p['csrf']},headers={'Origin':r.config.origin})
    assert pending.status_code==202 and pending.headers[RESET_HEADER]==module
    from test_public_invalidation_v107 import Response,Headers
    monkeypatch.setattr(workers,'Response',lambda body,**kw:NS(text=body,status=kw['status'],headers=Headers(kw['headers'])),raising=False)
    page,data=AsyncMock(return_value=True),AsyncMock(return_value=True)
    context=NS(exports=NS(PublicPage=NS(update_public_cache=page),PublicData=NS(update_public_cache=data)))
    result=asyncio.run(invalidation.relay_reset(Response(202,{RESET_HEADER:pending.headers[RESET_HEADER]}),context))
    assert result.status==200 and json.loads(result.text)['page_cache']=='accepted'
    with TestClient(create_public_app(lambda request:r),base_url=r.config.origin,raise_server_exceptions=False) as public:
        with patch.object(r.renderer,'render',side_effect=RuntimeError('Injected rendering fault')):
            response=public.get('/en/'+module)
        assert response.status_code==500 and response.headers['cache-control']==response.headers['cloudflare-cdn-cache-control']=='no-store'
        trace=response.headers['x-request-id'];assert re.fullmatch('[a-f0-9]{32}',trace)
        assert 'request_id='+trace in caplog.text
        assert all(key not in response.headers for key in ('etag','cache-tag','x-teacher-render-ok'))
        assert public.get('/en/'+module).status_code==200
    page.assert_awaited_once();data.assert_awaited_once()
