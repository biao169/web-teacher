"""First HTTP request, login and repeat public probes through the lazy application."""
import re
from unittest.mock import Mock
from fastapi.testclient import TestClient
from test_lazy_transfer_state import builder, entry, fixture
from test_acceptance_step5 import fixture as public_fixture, transfer_fixture
from smoke import inspect


def test_first_http_then_real_login_and_subsequent_requests(builder, monkeypatch):
    entry,r,_=builder
    factory=Mock(wraps=entry.build_application)
    monkeypatch.setattr(entry,'build_application',factory)
    # No TestClient context: don't let a lifespan event initialize the application first.
    import worker_runtime.admin_entrypoint as admin
    admin.application=admin.LazyAdmin()
    public=TestClient(entry.application,base_url=r.config.origin)
    client=TestClient(admin.application,base_url=r.config.origin)
    try:
        assert entry.application.application is None
        assert public.get('/en').status_code==200
        page=client.get('/auth/login')
        match=re.search(r'name="challenge"[^>]*value="([^"]+)"',page.text)
        assert match,page.text
        response=client.post('/auth/login',data={'challenge':match[1], 'username':'test-admin',
                            'password':'Password-only-for-test'},headers={'Origin':r.config.origin},follow_redirects=False)
        assert response.status_code==303,response.text
        assert client.get('/admin/profiles').status_code==200
        public.cookies.update(client.cookies)
        for path in ('/en','/zh'):
            assert public.get(path).status_code==200,path
        assert client.get('/auth/login').status_code==200
        assert factory.call_count==1
        assert not hasattr(entry.application.application.app.state, "worker_transfer")
    finally:
        client.close();public.close()


def test_repeated_probe_uses_existing_public_routes(public_fixture):
    client,r=public_fixture;client.cookies.clear()
    class Reply:
        def __init__(self,r):self.code=r.status_code;self.headers=r.headers;self.body=r.content
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,n):return self.body[:n]
    def opener(request,timeout):return Reply(client.get(request.full_url,headers=dict(request.header_items())))
    result=inspect(r.config.origin,opener,repeat_startup=True)
    assert result['ok'],result
    assert len(result['checks'])==15


def test_default_worker_response_cannot_pass_acceptance():
    class Reply:
        code=200
        headers={'Content-Type':'text/plain'}
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,n):return b'Hello world'
    result=inspect('https://teacher.test',lambda *a,**k:Reply(),repeat_startup=True)
    assert not result['ok']
    assert all(not row['ok'] and 'Hello world' in row['hint'] for row in result['checks'])
