import asyncio
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from test_accounts_regression import fixture
from test_public_page_cache_v058 import worker_cache
from backend.app.native.web_public import create_public_app
from backend.app.native.catalog import Error
from backend.app.native.public_page_cache import STALE_SECONDS

@pytest.fixture
def full(fixture,worker_cache,monkeypatch):
 _,r=fixture;r.kind='worker';r.worker_cache_mode='full';r.public_request_cache=False
 clock=[100000.0];monkeypatch.setattr('backend.app.native.public_page_cache.time.time',lambda:clock[0])
 with TestClient(create_public_app(lambda request:r),base_url=r.config.origin,raise_server_exceptions=False) as client:
  yield client,r,worker_cache[0],clock


def test_expired_render_failure_serves_old_success_without_renewing(full,caplog):
 c,r,cache,clock=full
 first=c.get('/en/projects');assert first.status_code==200
 puts=cache.puts;clock[0]+=1801
 with patch.object(r.renderer,'render',side_effect=RuntimeError('synthetic renderer outage')):
  old=c.get('/en/projects');head=c.head('/en/projects')
 assert old.status_code==head.status_code==200 and old.content==first.content
 assert old.headers['x-public-page-cache']=='STALE' and old.headers['age']=='1801'
 assert old.headers['cloudflare-cdn-cache-control']=='no-store'
 assert head.content==b'' and int(head.headers['content-length'])==len(first.content)
 assert cache.puts==puts and 'synthetic renderer outage' in caplog.text
 assert old.headers['x-request-id'] in caplog.text
 clock[0]+=STALE_SECONDS
 with patch.object(r.renderer,'render',side_effect=RuntimeError('still unavailable')):
  assert c.get('/en/projects').status_code==503
 assert cache.puts==puts


def test_recovery_and_new_revision_never_use_stale(full):
 c,r,cache,clock=full;c.get('/en/projects');clock[0]+=1801
 with patch.object(r.renderer,'render',side_effect=RuntimeError('broken')):
  a=c.get('/en/projects?__recover=1');assert a.status_code==503 and a.headers['cache-control']=='no-store'
  asyncio.run(r.sql.batch([("UPDATE site_settings SET site_name='Changed'",())]))
  assert c.get('/en/projects').status_code==503

@pytest.mark.parametrize('status',[403,404,429,500,502,503,504])
def test_only_recoverable_errors_use_stale(full,status):
 c,r,_,clock=full;c.get('/en/projects');clock[0]+=1801
 with patch('backend.app.native.public_data.public_listing',side_effect=Error('temporary error',status)):
  a=c.get('/en/projects')
 if status>=500:assert a.status_code==200 and a.headers['x-public-page-cache']=='STALE'
 else:assert a.status_code==status and a.headers['cache-control']=='no-store'


def test_successful_refresh_replaces_old_entry(full):
 c,r,cache,clock=full;first=c.get('/en/projects');clock[0]+=1801;puts=cache.puts
 refreshed=c.get('/en/projects');assert refreshed.status_code==200 and cache.puts==puts+1
 assert refreshed.headers['x-public-page-cache']=='MISS'
 assert c.get('/en/projects').headers['x-public-page-cache']=='HIT'


def test_simple_off_never_enter_internal_cache(fixture):
 from backend.app.public_performance import PublicPerformance
 c,r=fixture;r.kind='worker';r.public_request_cache=False
 for mode in ('simple','off'):
  r.worker_cache_mode=mode
  r.public_performance=PublicPerformance() if mode=='simple' else PublicPerformance(public_cache_ttl_seconds=0,public_page_cache_ttl_seconds=0)
  with patch('backend.app.native.public_page_cache.PageCache',side_effect=AssertionError('internal cache')):
   assert c.get('/en').status_code==200
   with patch.object(r.renderer,'render',side_effect=RuntimeError('failed')):
    with TestClient(c.app,base_url=r.config.origin,raise_server_exceptions=False) as client:
     assert client.get('/en').status_code==503
