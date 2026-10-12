"""PublicData forwarding on HIT and D1-only callee on MISS (platform simulated)."""
import asyncio
from types import SimpleNamespace,ModuleType
from unittest.mock import AsyncMock,Mock
import sys
import pytest
from test_startup_lazy import entry
from test_public_page_router_v102 import Headers,JSRequest
from runtime.cache_policy import entrypoint_cache,edge_cache
from runtime.public_data import serve


@pytest.mark.parametrize('cache_status',['HIT','STALE'])
def test_data_hit_does_not_build_app_or_touch_database(entry,monkeypatch,cache_status):
 js=ModuleType('js');js.Request=JSRequest;monkeypatch.setitem(sys.modules,'js',js)
 hit=SimpleNamespace(status=200,headers={'cf-cache-status':cache_status})
 cached=AsyncMock(return_value=hit)
 obj=entry.Default();obj.env=SimpleNamespace(TEACHER_ORIGIN='https://site.test') # No DB/R2 at all.
 obj.ctx=SimpleNamespace(exports=SimpleNamespace(PublicData=SimpleNamespace(fetch=cached)))
 monkeypatch.setattr(entry,'build_application',Mock(side_effect=AssertionError('app on data HIT')))
 req=SimpleNamespace(url='https://site.test/api/public/data/zh/profiles',method='GET',headers=Headers({'host':'site.test','cookie':'secret','authorization':'Bearer private'}))
 assert asyncio.run(obj.fetch(req)) is hit
 passed=cached.call_args.args[0]
 assert 'cookie' not in passed.headers and 'authorization' not in passed.headers
 assert req.headers['cookie']=='secret' and entry.application.application is None


@pytest.mark.parametrize('path',['/api/public/session-summary','/api/public/admin-project-fields','/admin','/auth/login','/sync/v1/read','/api/public/data/zh/profiles?sort=name','/api/public/data/fr/profiles'])
def test_dynamic_routes_do_not_call_data_export(entry,path):
 obj=entry.Default();obj.env=SimpleNamespace();obj.ctx=SimpleNamespace()
 obj._dynamic_fetch=AsyncMock(return_value='dynamic')
 request=SimpleNamespace(url='https://site.test'+path,method='GET',headers={})
 assert asyncio.run(obj.fetch(request))=='dynamic'
 obj._dynamic_fetch.assert_awaited_once_with(request)


def test_publicdata_config_does_not_enable_default_or_admin():
 assert not edge_cache({})['enabled']
 exports=entrypoint_cache({})
 assert not exports['default']['cache']['enabled']
 assert exports['PublicPage']['cache']['enabled'] and exports['PublicData']['cache']['enabled']


def test_invalid_host_cannot_receive_data_hit(entry,monkeypatch):
 monkeypatch.setattr(sys.modules['workers'],'Response',lambda body,**kw:SimpleNamespace(body=body,**kw),raising=False)
 cached=AsyncMock();obj=entry.Default();obj.env=SimpleNamespace(TEACHER_ORIGIN='https://site.test')
 obj.ctx=SimpleNamespace(exports=SimpleNamespace(PublicData=SimpleNamespace(fetch=cached)))
 req=SimpleNamespace(url='https://evil.test/api/public/data/zh/profiles',method='GET',headers={'host':'evil.test'})
 response=asyncio.run(obj.fetch(req))
 assert response.status==400 and response.headers['cache-control']=='no-store'
 cached.assert_not_awaited()


def test_callee_miss_uses_d1_without_app_r2_or_auth(entry,monkeypatch):
 from pathlib import Path
 import tempfile,json
 from list_fixture import client_at
 ffi=ModuleType('pyodide.ffi');ffi.jsnull=object();monkeypatch.setitem(sys.modules,'pyodide.ffi',ffi)
 monkeypatch.setattr(sys.modules['workers'],'Response',lambda body,**kw:SimpleNamespace(body=body,**kw),raising=False)
 monkeypatch.setattr(entry,'build_application',Mock(side_effect=AssertionError('app on data MISS')))
 with tempfile.TemporaryDirectory() as folder:
  c,r=client_at(Path(folder));calls=[]
  class Statement:
   def __init__(self,sql,args=()):self.sql,self.args=sql,args
   def bind(self,*args):return Statement(self.sql,args)
   async def all(self):
    calls.append(self.sql)
    return {'results':await r.sql.query(self.sql,self.args)}
  binding=SimpleNamespace(prepare=lambda sql:Statement(sql))
  env=SimpleNamespace(TEACHER_ORIGIN='https://site.test',DB=binding)
  req=SimpleNamespace(url='https://site.test/api/public/data/zh/profiles',method='GET',headers={'host':'site.test','cookie':'private'})
  response=asyncio.run(serve(req,env))
  assert response.status==200 and response.headers['X-Teacher-Data-OK']=='1'
  assert json.loads(response.body)['complete'] is True and len(calls)==3
  assert not any('auth_' in sql.lower() for sql in calls)
  assert entry.application.application is None
  req.method='HEAD';head=asyncio.run(serve(req,env))
  assert head.status==200 and head.body is None
  c.close()


def test_missing_binding_returns_uncached_error(entry,monkeypatch):
 monkeypatch.setattr(sys.modules['workers'],'Response',lambda body,**kw:SimpleNamespace(body=body,**kw),raising=False)
 req=SimpleNamespace(url='https://site.test/api/public/data/zh/profiles',method='GET',headers={'host':'site.test'})
 response=asyncio.run(serve(req,SimpleNamespace(TEACHER_ORIGIN='https://site.test')))
 assert response.status==503 and response.headers['Cache-Control']=='no-store'
 assert 'X-Teacher-Data-OK' not in response.headers
