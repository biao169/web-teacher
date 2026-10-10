import asyncio,importlib.util
from pathlib import Path
import pytest
from test_accounts_regression import fixture
from backend.app.public_performance import PublicPerformance
spec=importlib.util.spec_from_file_location('policy075','deploy/cloudflare/runtime/cache_policy.py');policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
@pytest.mark.parametrize('mode,edge,sql',[('simple',True,False),('full',False,True),('off',False,False)])
def test_modes(mode,edge,sql):
 env={'TEACHER_WORKER_CACHE_MODE':mode};m,p,q=policy.policy(env)
 assert policy.edge_cache(env)=={'enabled':edge,'cross_version_cache':False}
 assert q==sql
 assert p.public_page_cache_ttl_seconds==(0 if mode=='off' else 1800)
 if mode!='full':assert p.public_stream_concurrency==1 and p.public_nav_prefetch_concurrency==0
 assert policy.policy(env,admin=True)[0]=='off'
def test_override_and_local_defaults():
 assert PublicPerformance().public_page_cache_ttl_seconds==1800
 assert PublicPerformance().public_stream_concurrency==2
 assert PublicPerformance().public_nav_prefetch_concurrency==1
 assert not policy.edge_cache({'TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS':'0'})['enabled']
 assert policy.policy({'TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS':'600'})[1].public_page_cache_ttl_seconds==600

def test_response_boundary(fixture):
 c,r=fixture;r.kind='r2';r.worker_cache_mode='simple';r.public_request_cache=False
 a=c.get('/en');assert a.headers['cache-control']=='public, max-age=1800'
 assert a.headers['cloudflare-cdn-cache-control']=='public, max-age=1800'
 assert c.get('/en',headers={'If-None-Match':a.headers['etag']}).headers['cloudflare-cdn-cache-control']=='public, max-age=1800'
 for path in ('/admin','/auth/login','/en/contact','/api/public/session-summary','/api/public/cache-revision','/en/n/missing','/en/profiles/missing'):
  b=c.get(path);assert b.headers['cloudflare-cdn-cache-control']=='no-store',path
 r.kind='local';assert 'cloudflare-cdn-cache-control' not in c.get('/en').headers
