"""Release configuration gates and bundled-template main-site regression."""
import asyncio
import json
from pathlib import Path
import shutil
import sys
import pytest
from fastapi.testclient import TestClient
from fastapi.staticfiles import StaticFiles
HERE=Path(__file__).resolve().parents[1];ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(HERE));sys.path.insert(0,str(ROOT/'tests'))
from backend.app.native.web import create_app
from backend.app.web.rendering import Renderer
from test_transfer_step4 import fixture as transfer_fixture
from test_public_seo_v114 import (test_index_and_all_public_routes,
    test_visibility_independent_of_admin_cookie_and_fresh,test_robots_origin_and_no_source_exposure)
from test_public_projects_v60 import test_project_home_list_fragment_order_amount_and_public_policy
from test_media_regression import (test_actual_passive_image_type_and_head,
    test_claimed_jpeg_does_not_enable_active_or_unknown_content)
from test_media_regression import register,PNG
import pipeline
from integration_package import extend
from deploy.shared.worker_package import prepare
from smoke import inspect,origin_value,SameOrigin
from urllib.request import Request


@pytest.fixture
def fixture(transfer_fixture):
    c,r=transfer_fixture
    templates={area+'/'+p.relative_to(ROOT/'frontend'/area/'templates').as_posix():p.read_text()
        for area in ('shared','admin','public') for p in (ROOT/'frontend'/area/'templates').rglob('*.html')}
    r.renderer=Renderer.bundled(templates)
    before=len(c.app.router.routes)
    for area in ('shared','admin','public'):
        c.app.mount('/assets/'+area,StaticFiles(directory=ROOT/'frontend'/area/'static'))
    c.app.mount('/transfer-static',StaticFiles(directory=ROOT/'transfer/frontend/native'))
    c.app.router.routes[:]=c.app.router.routes[before:]+c.app.router.routes[:before]
    yield c,r


@pytest.fixture
def runtime(fixture):return fixture


def test_private_media_denied_without_session(runtime):
    c,r=runtime;uid,key=register(runtime,PNG,'png','image/png')
    assert c.get('/api/admin/media/'+uid+'/content').status_code==200
    c.cookies.clear()
    assert c.get('/api/admin/media/'+uid+'/content').status_code in (401,403)
    assert c.get('/media/'+uid).status_code==404


def test_readonly_probe_against_actual_routes_and_assets(fixture):
    c,r=fixture;c.cookies.clear()
    class Reply:
        def __init__(self,response):self.code=response.status_code;self.headers=response.headers;self.body=response.content
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,limit):return self.body[:limit]
    def opener(request,timeout):return Reply(c.get(request.full_url,headers=dict(request.header_items())))
    report=inspect(r.config.origin,opener)
    assert report['ok'],[row for row in report['checks'] if not row['ok']]
    assert len(report['checks'])==12


@pytest.mark.parametrize('url',['http://site.test','https://user:secret@site.test','https://site.test/a','https://site.test?token=x'])
def test_probe_rejects_non_origin(url):
    with pytest.raises(ValueError):origin_value(url)


def test_probe_blocks_external_redirect():
    with pytest.raises(ValueError,match='Cross-origin'):
        SameOrigin('https://site.test').redirect_request(Request('https://site.test/en'),None,302,'',{},'https://other.test/login')


@pytest.fixture
def stage(tmp_path):
    out=tmp_path/'worker'
    prepare(False,['--output',str(out),'--worker-name','test-site','--database-id','12345678-1234-1234-1234-123456789abc','--origin','https://test-site.workers.dev','--bucket','teacher-media'])
    (out/'src').mkdir()
    for name in ('main.py','backend','generated_resources.py'):shutil.move(str(out/name),str(out/'src'/name))
    cfg=json.loads((out/'wrangler.json').read_text());cfg['main']='src/main.py'
    extend(ROOT,out,cfg)
    (out/'src/main.py').write_text('from worker_runtime.entrypoint import Default, TransferCoordinator\n')
    (out/'wrangler.jsonc').write_text(json.dumps(cfg))
    return out,cfg


@pytest.mark.parametrize('key',['durable_objects','migrations','triggers'])
def test_missing_cloud_binding_or_cron_blocks_release(stage,key):
    out,cfg=stage
    assert pipeline.verify_stage(out)['name']=='test-site'
    cfg.pop(key);(out/'wrangler.jsonc').write_text(json.dumps(cfg))
    with pytest.raises(ValueError):pipeline.verify_stage(out)


def test_accidental_source_exposure_and_missing_static_block_release(stage):
    out,_=stage
    exposed=out/'assets/schema.sql';exposed.write_text('private')
    with pytest.raises(ValueError,match='Private source'):pipeline.verify_stage(out)
    exposed.unlink();(out/'assets/transfer-static/portal.js').unlink()
    with pytest.raises(ValueError,match='asset mismatch'):pipeline.verify_stage(out)
