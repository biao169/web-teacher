import asyncio
from unittest.mock import patch
from types import SimpleNamespace
from starlette.requests import Request
from test_media_management_step2 import fixture,register
from backend.app.native.media_response import media_file_response
run=asyncio.run

def test_public_same_for_authenticated_anonymous_and_conditional(fixture):
 c,r=fixture;row=register(r,status='active')
 run(r.sql.batch([('UPDATE site_settings SET logo_key=?',(row['object_key'],))]))
 url='/media/'+row['uid'];a=c.get(url)
 assert a.status_code==200 and a.headers['cache-control']=='public, max-age=3600'
 assert c.get('/api/admin/media/'+row['uid']+'/content').headers['cache-control']=='public, max-age=3600'
 c.cookies.clear();b=c.get(url,headers={'If-None-Match':a.headers['etag']})
 assert b.status_code==304 and b.content==b'' and b.headers['cache-control']==a.headers['cache-control']
 assert c.head(url,headers={'If-None-Match':'W/'+a.headers['etag']}).status_code==304
 run(r.sql.batch([('UPDATE site_settings SET logo_key=NULL',())]))
 assert c.get(url,headers={'If-None-Match':a.headers['etag']}).status_code==404

def test_private_authorization_version_range_and_errors(fixture):
 c,r=fixture;row=register(r,status='active');url='/api/admin/media/'+row['uid']+'/content'
 a=c.get(url);assert a.headers['cache-control']=='private, max-age=900'
 assert c.get(url,headers={'If-None-Match':a.headers['etag']}).status_code==304
 part=c.get(url,headers={'Range':'bytes=0-3','If-Range':a.headers['etag']})
 assert part.status_code==206 and len(part.content)==4 and part.headers['cache-control']=='private, max-age=900'
 bad=c.get(url,headers={'Range':'bytes=999999-'})
 assert bad.status_code==416 and bad.headers['cache-control']=='no-store'
 run(r.media_store.put(row['object_key'],b'changed'))
 b=c.get(url,headers={'If-None-Match':a.headers['etag']});assert b.status_code==200 and b.headers['etag']!=a.headers['etag']
 c.cookies.clear();denied=c.get(url,headers={'If-None-Match':b.headers['etag']},follow_redirects=False)
 assert denied.status_code!=304 and denied.headers['cache-control']=='no-store'

def test_r2_304_reads_metadata_only():
 class Store:
  async def head(self,key):return {'version':'r2-version','size':1024}
  async def read_range(self,*args):raise AssertionError('body read on 304')
 row={'object_key':'a.png','storage_kind':'r2','_public_media':True}
 r=SimpleNamespace(kind='r2',media_store=object())
 req=Request({'type':'http','method':'GET','path':'/media/a','query_string':b'','headers':[(b'if-none-match',b'"r2-version"')]})
 with patch('backend.app.native.media_response.inventory',return_value=Store()):response=run(media_file_response(req,r,row))
 assert response.status_code==304 and response.headers['cache-control']=='public, max-age=3600'

def test_nonmedia_admin_stays_no_store(fixture):
 c,r=fixture
 assert c.get('/admin/media_assets').headers['cache-control']=='no-store'
 assert c.get('/api/admin/media/usage-summaries?uid=missing').headers['cache-control']=='no-store'
