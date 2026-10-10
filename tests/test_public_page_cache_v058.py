import asyncio
from types import SimpleNamespace
from unittest.mock import patch
import pytest
from test_accounts_regression import fixture
from backend.app.native.public_cache import PublicReadCache
from backend.app.native.public_page_cache import PageCache,MAX_PAGE_BYTES
from backend.app.public_performance import PublicPerformance as P
run=asyncio.run

class Budget:
 def __init__(self,n=1024*1024):self.n=n
 def limits(self):return self.n,16

def test_shared_budget_expiry_eviction_revision_and_pressure():
 at=[0];budget=Budget();pool=PublicReadCache(budget,clock=lambda:at[0]);pages=pool.pages
 pages.get('a','1');assert pages.put('a','1',b'A'*50000,300)
 pages.put('b','1',b'B'*50000,300);pages.get('a','1')
 budget.n=220000;pool.get('missing','1')
 assert list(pages.entries)==['a'] # HTML LRU and quarter-budget cap.
 pool.put('rows','1',[{'text':'x'*50000}],1800)
 assert pool.used+pages.used<=budget.n
 budget.n=60000;pool.get('rows','1')
 assert not pages.entries and pool.entries and pool.used<=budget.n
 budget.n=1024*1024;pages.put('a','1',b'abc',300);at[0]=301
 assert pages.get('a','1') is None and pool.get('rows','1') is not None
 pages.put('a','1',b'abc',300);assert pages.get('a','2') is None and not pool.entries
 assert not pages.put('old','1',b'abc',300)
 pages.put('new','2',b'abc',300);budget.n=0
 assert pages.get('new','2') is None and pages.used+pool.used==0

@pytest.mark.parametrize('path',['/en','/en/profiles','/en/news','/en/projects'])
def test_hit_skips_queries_and_render_and_head_304(fixture,path):
 c,r=fixture;c.cookies.clear();first=c.get(path)
 assert first.status_code==200 and first.headers['x-public-page-cache']=='MISS'
 original=r.sql.query;calls=[]
 async def query(sql,args=()):calls.append(sql);return await original(sql,args)
 with patch.object(r.sql,'query',query),patch.object(r.renderer,'render',side_effect=AssertionError('render on HIT')),patch('backend.app.native.public_data.public_listing',side_effect=AssertionError('list on HIT')),patch('backend.app.native.public_data.public_media_map',side_effect=AssertionError('media on HIT')),patch('backend.app.native.public_data.people_facets',side_effect=AssertionError('facet on HIT')):
  second=c.get(path)
  assert second.status_code==200 and second.content==first.content and second.headers['x-public-page-cache']=='HIT'
  assert len(calls)==(2 if path.endswith('/news') else 1),calls
  head=c.head(path);assert head.content==b'' and head.headers['x-public-page-cache']=='HIT' and head.headers['content-length']==first.headers['content-length']
  conditional=c.get(path,headers={'If-None-Match':first.headers['etag']});assert conditional.status_code==304 and conditional.content==b''
 assert second.headers['cache-control']=='public, max-age=1800'


def test_identity_revision_query_and_navigation(fixture):
 from test_public_navigation_v88 import entry,update
 c,r=fixture;nav=entry(r,value='Alpha');token=c.cookies.get('ts_session');c.cookies.clear()
 a=c.get('/en/projects');assert c.get('/en/projects').headers['x-public-page-cache']=='HIT'
 c.cookies.set('ts_session',token);admin=c.get('/en/projects')
 assert admin.headers['x-public-page-cache']=='BYPASS' and admin.headers['cache-control']=='private, no-cache'
 c.cookies.clear()
 assert c.get('/zh/projects').headers['x-public-page-cache']=='MISS'
 assert c.get('/en/projects?page=2').headers['x-public-page-cache']=='MISS'
 run(r.sql.batch([('UPDATE projects SET name=name',())]))
 fresh=c.get('/en/projects');assert fresh.headers['x-public-page-cache']=='MISS' and fresh.headers['etag']!=a.headers['etag']
 assert c.get('/en/n/ai-projects').headers['x-public-page-cache']=='MISS'
 assert c.get('/en/n/ai-projects').headers['x-public-page-cache']=='HIT'
 update(r,nav,enabled=0);assert c.get('/en/n/ai-projects').status_code==404


def test_ttls_independent_and_bypass(fixture):
 c,r=fixture;c.cookies.clear();r.public_performance=P(public_cache_ttl_seconds=0)
 assert c.get('/en').headers['x-public-page-cache']=='MISS'
 assert c.get('/en').headers['x-public-page-cache']=='HIT'
 fragment=c.get('/en/projects',headers={'X-Public-Fragment':'1'})
 assert fragment.headers['cache-control']=='no-store' and 'etag' not in fragment.headers
 r.public_performance=P(public_page_cache_ttl_seconds=0)
 assert c.get('/en').headers['x-public-page-cache']=='BYPASS'
 assert c.get('/en/projects',headers={'X-Public-Fragment':'1'}).headers['x-public-page-cache']=='BYPASS'
 r.public_performance=P()
 assert c.get('/en',headers={'Authorization':'Bearer test'}).headers['x-public-page-cache']=='BYPASS'
 for path in ('/en/contact','/auth/login','/admin','/en/profiles/missing'):
  response=c.get(path);assert response.headers.get('x-public-page-cache')!='HIT'


def test_local_failure_is_optional(fixture):
 c,r=fixture;c.cookies.clear()
 with patch.object(r.sql.public_cache.pages,'get',side_effect=RuntimeError('cache offline')):
  response=c.get('/en');assert response.status_code==200 and response.headers['x-public-page-cache']=='BYPASS'
 with patch.object(r.sql.public_cache.pages,'put',side_effect=RuntimeError('cache offline')):
  response=c.get('/en');assert response.status_code==200 and response.headers['x-public-page-cache']=='BYPASS'

@pytest.fixture
def worker_cache(monkeypatch):
 import sys
 class Headers(dict):
  def set(self,k,v):self[k.lower()]=v
 class JSResponse:
  status=200;body=None
  def __init__(self,text):self.value=text;self.headers=Headers()
  @classmethod
  def new(cls,text):return cls(text)
  async def text(self):return self.value
 class Cache:
  def __init__(self):self.entries={};self.fail=None;self.puts=0
  async def match(self,key):
   if self.fail=='match':raise RuntimeError('offline')
   return self.entries.get(key)
  async def put(self,key,value):
   if self.fail=='put':raise RuntimeError('offline')
   self.puts+=1;self.entries[key]=value
 cache=Cache()
 async def opened(name):assert name=='teacher-public-pages-v1';return cache
 monkeypatch.setitem(sys.modules,'js',SimpleNamespace(caches=SimpleNamespace(open=opened),Response=JSResponse))
 return cache,JSResponse


def test_worker_adapter_hit_expiry_revision_bounds_and_failure(worker_cache):
 from fastapi.responses import HTMLResponse
 cache,JSResponse=worker_cache
 r=SimpleNamespace(kind='worker',config=SimpleNamespace(origin='https://example.test'))
 one=PageCache(r,'W/"key"','1',300)
 assert run(one.get()) is None
 run(one.put(HTMLResponse('small html')))
 stored=next(iter(cache.entries.values()));assert stored.headers['cache-control']=='public, max-age=300'
 two=PageCache(r,'W/"key"','1',300);assert run(two.get())==b'small html' and two.state=='HIT'
 assert run(PageCache(r,'W/"new-key"','2',300).get()) is None
 cache.entries.clear() # Platform TTL expiry/eviction.
 assert run(PageCache(r,'W/"key"','1',300).get()) is None
 for response in (HTMLResponse('bad',status_code=503),HTMLResponse('secret',headers={'Set-Cookie':'session=secret'}),HTMLResponse('secret',headers={'Cache-Control':'no-store'}),HTMLResponse('x'*(MAX_PAGE_BYTES+1))):
  adapter=PageCache(r,'W/"key"','1',300);run(adapter.get());run(adapter.put(response));assert adapter.state=='BYPASS' and not cache.entries
 cache.fail='match';adapter=PageCache(r,'W/"key"','1',300);assert run(adapter.get()) is None and adapter.state=='BYPASS'
 cache.fail='put';adapter=PageCache(r,'W/"key"','1',300);run(adapter.get());run(adapter.put(HTMLResponse('ok')));assert adapter.state=='BYPASS'
 cache.fail=None;run(one.put(HTMLResponse('small')));stored=next(iter(cache.entries.values()));stored.headers['content-length']=str(MAX_PAGE_BYTES+1)
 assert run(PageCache(r,'W/"key"','1',300).get()) is None


def test_worker_real_public_route_hit(fixture,worker_cache):
 from fastapi.testclient import TestClient
 from backend.app.native.web_public import create_public_app
 c,r=fixture;r.kind='worker';r.worker_cache_mode='full';r.public_request_cache=False
 with TestClient(create_public_app(lambda request:r),base_url=r.config.origin) as worker:
  first=worker.get('/en');assert first.headers['x-public-page-cache']=='MISS'
  with patch.object(r.renderer,'render',side_effect=AssertionError('Worker render on HIT')):
   second=worker.get('/en');assert second.headers['x-public-page-cache']=='HIT' and second.content==first.content


def test_time_publication_invalidates_cached_news(fixture):
 c,r=fixture;c.cookies.clear();run(r.sql.batch([("UPDATE news SET visibility='public'",())]))
 with patch('backend.app.native.public_http_cache.now',return_value='2019-01-01T00:00:00.000Z'),patch('backend.app.native.content.now',return_value='2019-01-01T00:00:00.000Z'):
  first=c.get('/en/news');assert c.get('/en/news').headers['x-public-page-cache']=='HIT'
 with patch('backend.app.native.public_http_cache.now',return_value='2021-01-01T00:00:00.000Z'),patch('backend.app.native.content.now',return_value='2021-01-01T00:00:00.000Z'):
  second=c.get('/en/news');assert second.headers['x-public-page-cache']=='MISS' and second.headers['etag']!=first.headers['etag']


def test_response_secrets_and_errors_not_stored_local(fixture):
 from fastapi.responses import HTMLResponse
 c,r=fixture;pool=r.sql.public_cache;pool.pages.get('key','rev')
 for response in (HTMLResponse('secret',headers={'Set-Cookie':'token=x'}),HTMLResponse('secret',headers={'Cache-Control':'no-store'}),HTMLResponse('bad',status_code=500),HTMLResponse('x'*(MAX_PAGE_BYTES+1))):
  adapter=PageCache(r,'key','rev',300);run(adapter.put(response));assert adapter.state=='BYPASS' and not pool.pages.entries


def test_page_ttl_expires_over_http(fixture):
 c,r=fixture;c.cookies.clear();clock=[0];r.sql.public_cache.clock=lambda:clock[0]
 r.public_performance=P(public_page_cache_ttl_seconds=2)
 assert c.get('/en').headers['x-public-page-cache']=='MISS'
 clock[0]=1;assert c.get('/en').headers['x-public-page-cache']=='HIT'
 clock[0]=2;assert c.get('/en').headers['x-public-page-cache']=='MISS'
