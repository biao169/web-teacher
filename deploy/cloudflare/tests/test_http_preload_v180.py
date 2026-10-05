"""Web priority: preloaded definitions, request-scoped login, no sync execution."""
import re
from unittest.mock import Mock,AsyncMock
from fastapi.testclient import TestClient
from test_lazy_transfer_state import builder,entry,fixture


def test_public_login_admin_use_one_app_without_advancing_sync(builder,monkeypatch):
    from backend.app.native import site_sync_dispatch
    module,r,_=builder
    advance=AsyncMock(side_effect=AssertionError('web request advanced sync'))
    monkeypatch.setattr(site_sync_dispatch,'run',advance)
    build=Mock(wraps=module.build_application);monkeypatch.setattr(module,'build_application',build)
    client=TestClient(module.application,base_url=r.config.origin)
    try:
        assert module.application.application is None
        for path in ('/en','/zh'):assert client.get(path).status_code==200
        page=client.get('/auth/login')
        challenge=re.search(r'name="challenge"[^>]*value="([^"]+)"',page.text)
        assert challenge
        reply=client.post('/auth/login',data={'challenge':challenge[1],'username':'test-admin','password':'Password-only-for-test'},headers={'Origin':r.config.origin},follow_redirects=False)
        assert reply.status_code==303
        assert client.get('/admin/profiles').status_code==200
        assert build.call_count==1
        advance.assert_not_awaited()
        assert not hasattr(module.application.application.app.app.state,'worker_transfer')
    finally:client.close()
