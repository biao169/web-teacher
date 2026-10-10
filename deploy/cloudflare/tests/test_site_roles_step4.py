"""Routing is driven by actual registered routes, not just sample URL prefixes."""
import asyncio,importlib.util,json,sys
from pathlib import Path
from types import SimpleNamespace,ModuleType
from unittest.mock import AsyncMock
import pytest
from test_startup_lazy import entry
ROOT=Path(__file__).resolve().parents[3]

@pytest.mark.parametrize('path,expected',[
 ('/admin','admin'),('/admin/site-sync/api/status-summary','admin'),('/api/backup/business','admin'),
 ('/api/admin/media/upload','admin'),('/auth/login','admin'),('/setup','admin'),
 ('/admin/transfer','transfer'),('/transfer/login','transfer'),('/transfer/api/relay/chunk','transfer'),
 ('/media/test','public'),('/zh','public'),('/api/public/publications/citations','public'),
 ('/sync/v1/read','sync'),('/administrator','public'),('/%61dmin/site-sync','admin')])
def test_paths(entry,path,expected):
    from worker_runtime.site_routes import owner
    assert owner('https://teacher.invalid'+path)==expected

def test_all_admin_routes_have_owner(entry):
    from worker_runtime.site_routes import owner
    from backend.app.native.web_admin import create_admin_app
    for route in create_admin_app(lambda _:None,lazy_sync=False).routes:
        p=getattr(route,'path','')
        if p.startswith('/health'):continue
        assert owner(p) in ('admin','sync','transfer'),p

@pytest.mark.parametrize('path',['/api/admin/media/upload','/api/public/session-summary','/api/public/admin-project-fields?uid=x'])
def test_admin_forward_does_not_parse_or_build_public(entry,monkeypatch,path):
    binding=SimpleNamespace(fetch=AsyncMock(return_value=SimpleNamespace(status=204)))
    worker=entry.Default();worker.env=SimpleNamespace(SITE_ADMIN=binding)
    request=SimpleNamespace(url='https://teacher.invalid'+path,body=object())
    monkeypatch.setattr(entry,'build_application',lambda **k:pytest.fail('public app built for admin'))
    response=asyncio.run(entry.Default.fetch.__wrapped__(worker,request))
    assert response.status==204
    binding.fetch.assert_awaited_once_with(request)
    assert entry.application.application is None

def test_public_resources_do_not_create_password_or_tool_clients(entry):
    from worker_runtime.site_resources import resource
    env=SimpleNamespace(DB=object(),MEDIA=object(),TEACHER_ORIGIN='https://teacher.invalid')
    r=resource(SimpleNamespace(scope={'env':env}),object())
    assert r.passwords is None
    assert not hasattr(r,'scholarly') and not hasattr(r,'translation_transport')
    assert r.media_store.bucket is env.MEDIA

def test_admin_module_has_no_scheduler(entry,monkeypatch):
    import worker_runtime.admin_entrypoint as admin
    assert not hasattr(admin.Default,'scheduled') and not hasattr(admin.Default,'sync_tick')

def test_admin_name_is_bounded_and_deterministic():
    from site_workers import admin_name
    assert admin_name('teacher')=='teacher-admin'
    assert len(admin_name('a'*63))<=63
    assert admin_name('a'*63)!=admin_name('a'*62+'b')

def test_admin_failure_is_bounded_and_public_application_remains_unbuilt(entry,monkeypatch,capsys):
    import workers
    class Response:
        def __init__(self,body,**kw):self.body=body;self.__dict__.update(kw)
    monkeypatch.setattr(workers,'Response',Response,raising=False)
    worker=entry.Default();worker.env=SimpleNamespace(SITE_ADMIN=SimpleNamespace(fetch=AsyncMock(side_effect=RuntimeError('private-internal-detail'))))
    response=asyncio.run(entry.Default.fetch.__wrapped__(worker,SimpleNamespace(url='https://teacher.invalid/admin')))
    assert response.status==503 and json.loads(response.body)['code']=='ADMIN_UNAVAILABLE'
    assert 'private-internal-detail' not in response.body
    assert entry.application.application is None
    assert 'ADMIN-FORWARD' in capsys.readouterr().out

def test_bundled_templates_render_public_admin_and_transfer(entry,tmp_path):
    import copy
    from backend.app.web.rendering import Renderer
    from site_workers import subset
    from fastapi.testclient import TestClient
    from test_accounts_regression import client_at
    from backend.app.native.web_public import create_public_app
    from backend.app.native.web_admin import create_admin_app
    client,r=client_at(tmp_path)
    templates={}
    for area in ('shared','public','admin'):
        templates.update({area+'/'+str(p.relative_to(ROOT/'frontend'/area/'templates')):p.read_text() for p in (ROOT/'frontend'/area/'templates').rglob('*.html')})
    templates.update({'sync/'+p.name:p.read_text() for p in (ROOT/'site_sync/frontend/templates').glob('*.html')})
    public={n:v for n,v in templates.items() if n.startswith(('public/','shared/'))}
    admin=subset(templates,[n for n in templates if n.startswith(('admin/','shared/','sync/'))]+['public/auth-page.html','public/native-footer-links.html'])
    for names,builder,paths in [(public,create_public_app,['/en','/zh/contact']), (admin,create_admin_app,['/auth/login','/admin','/admin/site-sync','/admin/profiles'])]:
        resource=copy.copy(r);resource.renderer=Renderer.bundled(names)
        if builder is create_public_app:resource.passwords=None
        c=TestClient(builder(lambda request:resource),base_url=r.config.origin);c.cookies.update(client.cookies)
        for path in paths:assert c.get(path).status_code==200,path
