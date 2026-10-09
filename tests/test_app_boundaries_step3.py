"""Route ownership, actual HTTP dispatch and cold import boundaries."""
import json,os,subprocess,sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from test_accounts_regression import fixture
ROOT=Path(__file__).resolve().parents[1]

@pytest.mark.parametrize('role',['public','admin','full'])
def test_cold_factory(role):
    result=subprocess.run([sys.executable,'-B',str(ROOT/'tests/check_app_boundaries_step3.py'),'--source',str(ROOT),'--role',role],capture_output=True,text=True,env=os.environ.copy())
    assert result.returncode==0,result.stdout+result.stderr


def test_full_route_inventory_matches_parent():
    from backend.app.native.web import create_app
    for lazy in (False,True):
        app=create_app(lambda request:None,lazy_sync=lazy)
        actual=sorted((getattr(r,'path',type(r).__name__),sorted(getattr(r,'methods',[]) or [])) for r in app.routes)
        expected=json.loads((ROOT/'tests/fixtures/app-routes-v051.json').read_text())[str(lazy)]
        expected=sorted(expected+[['/api/public/cache-revision',['GET']]])
        assert json.loads(json.dumps(actual))==expected


def test_public_admin_share_http_and_identity(fixture):
    c,r=fixture
    from backend.app.native.web_public import create_public_app
    from backend.app.native.web_admin import create_admin_app
    public=TestClient(create_public_app(lambda request:r,ROOT),base_url=str(c.base_url))
    admin=TestClient(create_admin_app(lambda request:r,ROOT,lazy_sync=True),base_url=str(c.base_url))
    for client in (public,admin):client.cookies.update(c.cookies)
    for path in ('/zh','/en','/robots.txt','/api/public/people/students/facets/research_area'):
        before=c.get(path);after=public.get(path)
        assert after.status_code==before.status_code,(path,after.text)
        assert after.content==before.content,path
    for path in ('/admin','/admin/profiles','/auth/login','/admin/site-sync'):
        before=c.get(path);after=admin.get(path)
        assert after.status_code==before.status_code,(path,after.text)
        # Dynamic auth challenges differ; authenticated dashboard/menus remain identical.
        if path.startswith('/admin'):assert after.content==before.content,path
    assert admin.get('/zh').status_code==404
    assert public.get('/admin').status_code==404
    assert admin.post('/auth/logout',data={'_csrf':'wrong'}).status_code==403
