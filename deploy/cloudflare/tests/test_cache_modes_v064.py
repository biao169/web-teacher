import asyncio
from types import SimpleNamespace
from unittest.mock import patch,AsyncMock
import pytest
from runtime.cache_policy import policy,variables
from test_startup_lazy import entry
from test_accounts_regression import fixture

@pytest.mark.parametrize('mode',['simple','full','off'])
def test_build_and_runtime_policy(mode):
 env={'TEACHER_WORKER_CACHE_MODE':mode,'TEACHER_PUBLIC_NAV_PREFETCH_CONCURRENCY':'2','TEACHER_PUBLIC_STREAM_CONCURRENCY':'4'}
 actual,p,enabled=policy(env);v=variables(env)
 assert actual==mode and enabled==(mode=='full')
 assert p.public_nav_prefetch_concurrency==(2 if mode=='full' else 0)
 assert p.public_stream_concurrency==(4 if mode=='full' else 1)
 assert p.public_cache_ttl_seconds==(0 if mode=='off' else 1800)
 assert p.public_page_cache_ttl_seconds==(0 if mode=='off' else 300)
 assert v['TEACHER_WORKER_REQUEST_CACHE']==('1' if mode=='full' else '0')
 assert policy(SimpleNamespace(**env))==policy(env)

def test_default_and_invalid():
 assert policy({})[0]=='simple'
 for v in ('','typo','FULL'):
  with pytest.raises(ValueError,match='TEACHER_WORKER_CACHE_MODE'):policy({'TEACHER_WORKER_CACHE_MODE':v})

@pytest.mark.parametrize('mode',['simple','off'])
def test_worker_http_never_constructs_cache_and_preserves_browser_policy(fixture,mode):
 from fastapi.testclient import TestClient
 from backend.app.native.web_public import create_public_app
 c,r=fixture;r.kind='worker';r.worker_cache_mode,r.public_performance,r.public_request_cache=policy({'TEACHER_WORKER_CACHE_MODE':mode})
 with patch('backend.app.native.public_cache.WorkerPublicSQL',side_effect=AssertionError('SQL cache')),patch('backend.app.native.public_page_cache.PageCache',side_effect=AssertionError('page cache')):
  with TestClient(create_public_app(lambda _:r),base_url=r.config.origin) as worker:
   a=worker.get('/en');assert a.status_code==200
   assert 'data-public-nav-prefetch-concurrency="0"' in a.text
   assert 'data-public-stream-concurrency="1"' in a.text
   if mode=='simple':
    assert a.headers['cache-control']=='public, max-age=300'
    assert worker.get('/en',headers={'If-None-Match':a.headers['etag']}).status_code==304
   else:assert a.headers['cache-control']=='no-store' and 'etag' not in a.headers

def test_resource_mode_enforced(entry):
 from worker_runtime.site_resources import resource
 for mode in ('simple','off','full'):
  r=resource(SimpleNamespace(scope={'env':SimpleNamespace(DB=object(),MEDIA=object(),TEACHER_ORIGIN='https://teacher.invalid',TEACHER_WORKER_CACHE_MODE=mode,TEACHER_WORKER_REQUEST_CACHE='1')}),object())
  assert r.public_request_cache==(mode=='full') and r.worker_cache_mode==mode
 mode,p,cache=policy({'TEACHER_WORKER_CACHE_MODE':'full'},admin=True)
 assert mode=='off' and not cache and p.public_page_cache_ttl_seconds==0

@pytest.mark.parametrize('path',['/admin','/api/admin/media/usage-summaries','/auth/login','/setup'])
def test_admin_forward_before_public_init(entry,path):
 worker=entry.Default();worker.env=SimpleNamespace(SITE_ADMIN=SimpleNamespace(fetch=AsyncMock(return_value='forwarded')))
 with patch.object(entry.application,'__call__',side_effect=AssertionError('public app')):
  assert asyncio.run(entry.Default.fetch.__wrapped__(worker,SimpleNamespace(url='https://teacher.invalid'+path)))=='forwarded'
 assert entry.application.application is None
