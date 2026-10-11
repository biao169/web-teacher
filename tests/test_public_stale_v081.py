"""v090 supersedes application stale storage with HTTP-only stale policy."""
from unittest.mock import patch
from fastapi.testclient import TestClient
from test_accounts_regression import fixture
from test_public_page_cache_v058 import worker_cache
from backend.app.native.web_public import create_public_app

def test_full_expiry_failure_is_not_cached(fixture,worker_cache):
 _,r=fixture;r.kind='worker';r.worker_cache_mode='full';r.public_request_cache=False
 cache,_=worker_cache
 with TestClient(create_public_app(lambda request:r),base_url=r.config.origin,raise_server_exceptions=False) as c:
  first=c.get('/en/projects');assert first.status_code==200
  assert 'stale-if-error=86400' in first.headers['cache-control']
  assert not cache.entries and cache.puts==0
  cache.entries.clear() # Simulate actual Cache API TTL eviction.
  puts=cache.puts
  with patch.object(r.renderer,'render',side_effect=RuntimeError('synthetic outage')):
   failed=c.get('/en/projects')
  assert failed.status_code==503
  assert failed.headers['cache-control']==failed.headers['cloudflare-cdn-cache-control']=='no-store'
  assert cache.puts==puts and not cache.entries

def test_simple_off_never_enter_internal_cache(fixture):
 from backend.app.public_performance import PublicPerformance
 c,r=fixture;r.kind='worker';r.public_request_cache=False
 for mode in ('simple','full','off'):
  r.worker_cache_mode=mode
  r.public_performance=PublicPerformance() if mode!='off' else PublicPerformance(public_cache_ttl_seconds=0,public_page_cache_ttl_seconds=0)
  with patch('backend.app.native.public_page_cache.PageCache',side_effect=AssertionError('internal cache')):
   assert c.get('/en').status_code==200
   with patch.object(r.renderer,'render',side_effect=RuntimeError('failed')):
    with TestClient(c.app,base_url=r.config.origin,raise_server_exceptions=False) as client:
     assert client.get('/en').status_code==503
