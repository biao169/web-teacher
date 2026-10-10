"""Real SQLite + HTTP + template checks for early conditional responses."""
import asyncio
from unittest.mock import patch
import pytest
from test_accounts_regression import fixture
from backend.app.native.public_http_cache import matches_etag
from backend.app.public_performance import PublicPerformance
run=asyncio.run

@pytest.mark.parametrize('header,expected',[
 ('"abc"',True),('W/"abc"',True),(' "other", W/"abc" ',True),('*',True),
 ('"a,b", "abc"',True),(', , "abc",',True),('"abc"junk',False),
 ('abc',False),('W/abc',False),('"ABC"',False),('*, "abc"',False),
 ('"abc",bad',False),('"abc"'*3000,False),('',False),
])
def test_matching(header,expected):assert matches_etag(header,'W/"abc"')==expected

@pytest.mark.parametrize('path',['/en','/zh','/en/profiles','/en/students','/en/projects','/en/news','/en/publications','/en/patents','/en/courses','/en/research_interests'])
def test_early_304_skips_heavy_reads_and_render(fixture,path):
 c,r=fixture;c.cookies.clear();first=c.get(path);assert first.status_code==200
 etag=first.headers['etag'];calls=[];original=r.sql.query
 async def query(sql,args=()):calls.append(sql);return await original(sql,args)
 with patch.object(r.sql,'query',query),patch.object(r.renderer,'render',side_effect=AssertionError('render on 304')),patch('backend.app.native.public_data.public_listing',side_effect=AssertionError('listing on 304')),patch('backend.app.native.public_data.people_facets',side_effect=AssertionError('facets on 304')),patch('backend.app.native.public_data.public_media_map',side_effect=AssertionError('media on 304')):
  response=c.get(path,headers={'If-None-Match':etag})
 assert response.status_code==304 and response.content==b''
 assert response.headers['etag']==etag
 for header in ('vary','cache-control','x-public-revision'):assert response.headers[header]==first.headers[header]
 assert not any('site_settings' in sql or 'navigation_items' in sql or 'count(' in sql for sql in calls)
 assert len(calls)==(2 if path.endswith('/news') else 1),calls

@pytest.mark.parametrize('method',['GET','HEAD'])
def test_weak_list_star_head_and_miss(fixture,method):
 c,r=fixture;c.cookies.clear();first=c.get('/en/profiles');etag=first.headers['etag']
 for match in ('"other",'+etag.removeprefix('W/'), '*'):
  response=c.request(method,'/en/profiles',headers={'If-None-Match':match});assert response.status_code==304 and response.content==b''
 response=c.request(method,'/en/profiles',headers={'If-None-Match':'"other"'})
 assert response.status_code==200 and response.headers['etag']==etag
 if method=='HEAD':assert response.content==b'' and response.headers['content-length']==first.headers['content-length']

@pytest.mark.parametrize('path,status',[('/xx',404),('/en/unknown',404),('/en/profiles?size=3',422),('/en/profiles?home=1',400),('/en/projects?direction=bad',422),('/en/projects?page=0',422),('/en/projects?page=1&page=2',422),('/en/profiles/missing',404),('/en/n/missing',404),('/en/projects?sort=name',303),('/en/projects?q=Alpha',303)])
def test_invalid_and_redirects_never_304(fixture,path,status):
 c,r=fixture;c.cookies.clear();response=c.get(path,headers={'If-None-Match':'*'},follow_redirects=False)
 assert response.status_code==status,response.text
 assert 'etag' not in response.headers


def test_revision_language_query_identity_config_and_release(fixture):
 c,r=fixture;c.cookies.clear();first=c.get('/en/projects');etag=first.headers['etag']
 for path in ('/zh/projects','/en/projects?page=2','/en/projects?size=20','/en/projects?s=eyJxIjoiQWxwaGEifQ'):
  response=c.get(path,headers={'If-None-Match':etag});assert response.status_code==200 and response.headers['etag']!=etag
 run(r.sql.batch([('UPDATE projects SET name=name',())]))
 assert c.get('/en/projects',headers={'If-None-Match':etag}).status_code==200
 etag=c.get('/en/projects').headers['etag']
 r.public_performance=PublicPerformance(public_stream_concurrency=1)
 assert c.get('/en/projects',headers={'If-None-Match':etag}).status_code==200
 etag=c.get('/en/projects').headers['etag']
 with patch('backend.app.native.public_http_cache.REPRESENTATION_VERSION','future-release'):
  assert c.get('/en/projects',headers={'If-None-Match':etag}).status_code==200


def test_live_identity_grants_and_logout(fixture):
 c,r=fixture;admin=c.get('/en/projects');tag=admin.headers['etag']
 assert admin.headers['cache-control']=='private, no-cache'
 assert c.get('/en/projects',headers={'If-None-Match':tag}).status_code==304
 run(r.sql.batch([("UPDATE auth_permissions SET can_view=0 WHERE role_uid=? AND module='projects'",(r.p['role_uid'],))]))
 changed=c.get('/en/projects',headers={'If-None-Match':tag});assert changed.status_code==200 and changed.headers['etag']!=tag
 c.cookies.clear();anon=c.get('/en/projects',headers={'If-None-Match':tag});assert anon.status_code==200 and anon.headers['etag']!=tag
 for private in (r.p['uid'],r.p['csrf'],r.p['username']):assert private not in tag


def test_bypass_and_fragment_separation(fixture):
 c,r=fixture;c.cookies.clear();tag=c.get('/en/projects').headers['etag']
 fragment=c.get('/en/projects',headers={'X-Public-Fragment':'1','If-None-Match':tag})
 assert fragment.status_code==200 and fragment.headers['etag']!=tag
 assert c.get('/en/projects',headers={'X-Public-Fragment':'1','If-None-Match':fragment.headers['etag']}).status_code==304
 for path in ('/en/contact','/auth/login','/api/public/cache-revision'):
  response=c.get(path,headers={'If-None-Match':'*'});assert response.status_code!=304 and 'etag' not in response.headers
 assert c.get('/en',headers={'Authorization':'Bearer test','If-None-Match':'*'}).status_code==200
 r.public_performance=PublicPerformance(public_cache_ttl_seconds=0,public_page_cache_ttl_seconds=0)
 response=c.get('/en',headers={'If-None-Match':'*'});assert response.status_code==200 and 'etag' not in response.headers and response.headers['cache-control']=='no-store'


def test_news_publication_clock_uses_covering_index(fixture):
 c,r=fixture;c.cookies.clear()
 run(r.sql.batch([("UPDATE news SET visibility='public'",())]))
 sql="SELECT published_at FROM news WHERE visibility='public' AND published_at<=? ORDER BY published_at DESC LIMIT 1"
 plan=run(r.sql.query('EXPLAIN QUERY PLAN '+sql,('2050',)))
 assert any('idx_news_published' in row['detail'] and 'SEARCH' in row['detail'] for row in plan),plan
 with patch('backend.app.native.public_http_cache.now',return_value='2019-01-01T00:00:00.000Z'),patch('backend.app.native.content.now',return_value='2019-01-01T00:00:00.000Z'):
  first=c.get('/en/news');tag=first.headers['etag']
 with patch('backend.app.native.public_http_cache.now',return_value='2021-01-01T00:00:00.000Z'),patch('backend.app.native.content.now',return_value='2021-01-01T00:00:00.000Z'):
  second=c.get('/en/news',headers={'If-None-Match':tag})
 assert second.status_code==200 and second.headers['etag']!=tag
 assert second.headers['x-public-revision']==first.headers['x-public-revision']


def test_fixed_navigation_validates_access_and_stamp_before_304(fixture):
 from test_public_navigation_v88 import entry,update
 c,r=fixture;uid=entry(r,value='Alpha');c.cookies.clear()
 first=c.get('/en/n/ai-projects');tag=first.headers['etag']
 assert c.get('/en/n/ai-projects',headers={'If-None-Match':tag}).status_code==304
 update(r,uid,visibility='authenticated')
 denied=c.get('/en/n/ai-projects',headers={'If-None-Match':'*'})
 assert denied.status_code==404 and 'etag' not in denied.headers


def test_worker_public_app_and_cache_wrapper_early_exit(fixture,monkeypatch):
 import sys
 from types import SimpleNamespace
 from fastapi.testclient import TestClient
 from backend.app.native.web_public import create_public_app
 c,r=fixture;r.kind='worker';r.public_request_cache=True
 class Cache:
  async def match(self,key):return None
  async def put(self,*args):pass
 async def opened(name):return Cache()
 monkeypatch.setitem(sys.modules,'js',SimpleNamespace(caches=SimpleNamespace(open=opened)))
 with TestClient(create_public_app(lambda request:r),base_url=r.config.origin) as worker:
  first=worker.get('/en/profiles');assert first.status_code==200
  with patch.object(r.renderer,'render',side_effect=AssertionError('Worker render on 304')):
   second=worker.get('/en/profiles',headers={'If-None-Match':first.headers['etag']})
  assert second.status_code==304 and second.content==b''


def test_error_is_not_tagged_or_swallowed(fixture):
 from backend.app.native.catalog import Error
 c,r=fixture;c.cookies.clear()
 with patch('backend.app.native.public_data.public_listing',side_effect=Error('synthetic unavailable',503)):
  response=c.get('/en/profiles')
 assert response.status_code==503 and 'etag' not in response.headers and response.headers['cache-control']=='no-store'
