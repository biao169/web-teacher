"""Recovery transport is request-local; no cache purge, identity or sync mutations."""
import asyncio
from types import SimpleNamespace
from unittest.mock import patch
import pytest
from fastapi import Request
from fastapi.responses import Response
from fastapi.testclient import TestClient
from test_accounts_regression import fixture
from backend.app.native.public_http_cache import representation_key,finish,not_modified
from backend.app.native.web_common import create_base

POLICY='public, max-age=1800, stale-while-revalidate=120, stale-if-error=86400'

def worker(r,mode='simple'):
 r.kind='r2';r.worker_cache_mode=mode;r.public_request_cache=mode=='full'

@pytest.mark.parametrize('platform',['local','simple','full'])
def test_recovery_bypasses_all_cache_and_conditional(fixture,platform):
 c,r=fixture;c.cookies.clear()
 if platform!='local':worker(r,platform)
 with patch('backend.app.native.public_page_cache.PageCache.get',side_effect=AssertionError('page read')),patch('backend.app.native.public_page_cache.PageCache.put',side_effect=AssertionError('page write')),patch('backend.app.native.public_cache.WorkerPublicSQL',side_effect=AssertionError('worker SQL cache')),patch('backend.app.native.public_cache.PublicSQL',side_effect=AssertionError('local SQL cache')):
  for method in ('get','head'):
   a=getattr(c,method)('/en/profiles?__recover=1',headers={'If-None-Match':'*'})
   assert a.status_code==200 and not a.history
   assert a.headers['cache-control']==a.headers['cloudflare-cdn-cache-control']=='no-store'
   assert 'etag' not in a.headers and a.headers['x-public-page-cache']=='BYPASS'
   if method=='head':assert not a.content
   else:assert 'rel="canonical" href="http://testserver/en/profiles"' in a.text or '__recover' not in a.text

@pytest.mark.parametrize('platform',['local','simple'])
def test_success_headers_and_local_cache_preserved(fixture,platform):
 c,r=fixture;c.cookies.clear()
 if platform=='simple':worker(r)
 a=c.get('/en');assert a.status_code==200 and a.headers['cache-control']==POLICY
 if platform=='simple':assert a.headers['cloudflare-cdn-cache-control']==POLICY
 b=c.get('/en',headers={'If-None-Match':a.headers['etag']});assert b.status_code==304 and b.headers['cache-control']==POLICY
 c.get('/en?__recover=1')
 assert c.get('/en').headers['etag']==a.headers['etag']
 if platform=='local':assert c.get('/en').headers['x-public-page-cache']=='HIT'


def test_canonical_redirect_keeps_recovery_not_filter(fixture):
 c,r=fixture;worker(r)
 a=c.get('/en/projects?q=hello&__recover=1',follow_redirects=False)
 assert a.status_code==303 and '__recover=1' in a.headers['location']
 b=c.get(a.headers['location']);assert b.status_code==200 and not b.history
 assert b.headers['cache-control']=='no-store'
 assert '__recover' not in b.text


def test_recovery_not_in_representation(fixture):
 _,r=fixture
 q=Request({'type':'http','method':'GET','path':'/en','headers':[], 'query_string':b''})
 assert representation_key(q,r,'1',{})==representation_key(q,r,'1',{'__recover':'1'})
 q.state.public_recovery=True
 assert not_modified(q,'W/"a"',{}) is None
 a=finish(q,Response('x',headers={'ETag':'old'}),'new')
 assert a.headers['cache-control']==a.headers['cloudflare-cdn-cache-control']=='no-store' and 'etag' not in a.headers


def test_forms_private_and_fragment_unchanged(fixture):
 c,r=fixture;worker(r)
 asyncio.run(r.sql.batch([("INSERT INTO news(uid,title,slug,visibility,allow_comments,published_at) VALUES('form','News','form','public',1,'2020-01-01T00:00:00.000Z')",())]))
 for path in ('/en/contact','/en/news/form','/auth/login','/admin'):
  a=c.get(path);b=c.get(path+'?__recover=1')
  assert a.status_code==b.status_code and a.headers['cache-control']==b.headers['cache-control']=='no-store'
 frag=c.get('/en/profiles',headers={'X-Public-Fragment':'1'})
 b=c.get('/en/profiles?__recover=1',headers={'X-Public-Fragment':'1'})
 assert b.status_code==frag.status_code and b.headers['cache-control']==frag.headers['cache-control']
 assert b.headers['etag']==frag.headers['etag']
 r.kind='local'
 assert c.get('/en?__recover=1').headers['cache-control']=='private, no-cache'


def test_off_and_custom_ttl(fixture):
 from backend.app.public_performance import PublicPerformance
 c,r=fixture;worker(r,'off');r.public_performance=PublicPerformance(public_cache_ttl_seconds=0,public_page_cache_ttl_seconds=0)
 assert 'max-age=1800' not in c.get('/en').headers['cache-control']
 r.worker_cache_mode='simple';r.public_performance=PublicPerformance(public_page_cache_ttl_seconds=600)
 assert c.get('/en').headers['cache-control']==POLICY.replace('1800','600')

@pytest.mark.parametrize('platform',['local','r2'])
@pytest.mark.parametrize('status',[400,403,404,500,502,503,504])
def test_error_responses_always_no_store(fixture,platform,status):
 _,r=fixture;r.kind=platform
 app,*_=create_base(lambda request:r)
 @app.get('/failure')
 async def failure():return Response('error',status_code=status,headers={'Cache-Control':'public, max-age=1800','ETag':'old'})
 with TestClient(app,base_url=r.config.origin) as c:
  a=c.get('/failure')
  assert a.status_code==status
  assert a.headers['cache-control']==a.headers['cloudflare-cdn-cache-control']=='no-store'
  assert 'etag' not in a.headers


def test_unhandled_error_and_invalid_host_no_store(fixture,caplog):
 _,r=fixture
 app,*_=create_base(lambda request:r)
 @app.get('/failure')
 async def failure():raise RuntimeError('synthetic render failure')
 with TestClient(app,base_url=r.config.origin,raise_server_exceptions=False) as c:
  a=c.get('/failure');assert a.status_code==500
  assert a.headers['cache-control']==a.headers['cloudflare-cdn-cache-control']=='no-store'
  assert 'synthetic render failure' in caplog.text
  b=c.get('/failure',headers={'Host':'invalid.example'})
  assert b.status_code>=400 and b.headers['cloudflare-cdn-cache-control']=='no-store'
