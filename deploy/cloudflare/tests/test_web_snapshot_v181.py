"""Snapshot-built routes serve real requests without reconstructing the application."""
import re
from unittest.mock import Mock,AsyncMock
from fastapi.testclient import TestClient
from test_lazy_transfer_state import builder,entry,fixture


def test_snapshot_routes_login_and_anonymous_isolation_without_rebuild(builder,monkeypatch):
    from worker_runtime.web_application import application,site
    from backend.app.native import site_sync_dispatch
    module,r,_=builder
    build=Mock(side_effect=AssertionError('request rebuilt website'))
    advance=AsyncMock(side_effect=AssertionError('request advanced sync'))
    monkeypatch.setattr(module,'build_application',build)
    monkeypatch.setattr(site_sync_dispatch,'run',advance)
    module.application.application=application
    client=TestClient(module.application,base_url=r.config.origin)
    anonymous=TestClient(module.application,base_url=r.config.origin)
    routes=tuple(site.routes)
    try:
        for path in ('/','/en','/zh'):assert client.get(path).status_code==200
        page=client.get('/auth/login')
        challenge=re.search(r'name="challenge"[^>]*value="([^"]+)"',page.text)
        assert challenge
        response=client.post('/auth/login',data={'challenge':challenge[1],'username':'test-admin','password':'Password-only-for-test'},headers={'Origin':r.config.origin},follow_redirects=False)
        assert response.status_code==303
        assert client.get('/admin/profiles').status_code==200
        assert anonymous.get('/admin/profiles',follow_redirects=False).status_code in (302,303,401,403)
        assert anonymous.get('/en').status_code==200
        assert tuple(site.routes)==routes
        assert not hasattr(site.state,'worker_transfer')
        build.assert_not_called();advance.assert_not_awaited()
    finally:client.close();anonymous.close()
