import asyncio
import pytest
from test_accounts_regression import fixture
from backend.app.public_performance import PublicPerformance
run=asyncio.run

def worker(r):r.kind='r2';r.worker_cache_mode='simple';r.public_request_cache=False

@pytest.mark.parametrize('system,ttl',[(1,60),(0,120)])
def test_private_cache_and_304(fixture,system,ttl):
 c,r=fixture;worker(r)
 if not system:run(r.sql.batch([('UPDATE auth_users SET role_uid=? WHERE uid=?',('role-registered',r.p['uid']))]))
 for path in ('/en','/en/projects','/en/profiles'):
  a=c.get(path);assert a.status_code==200
  assert a.headers['cache-control']==f'private, max-age={ttl}'
  assert a.headers['x-public-page-cache']=='BYPASS'
  assert 'Cookie' in a.headers['vary'] and 'Authorization' in a.headers['vary']
  b=c.get(path,headers={'If-None-Match':a.headers['etag']})
  assert b.status_code==304 and not b.content and b.headers['cache-control']==a.headers['cache-control']
  assert c.head(path).headers['cache-control']==a.headers['cache-control']

@pytest.mark.parametrize('path',['/admin','/auth/login','/en/contact','/api/public/cache-revision','/en/profiles/missing'])
def test_sensitive_no_store(fixture,path):
 c,r=fixture;worker(r);a=c.get(path,headers={'If-None-Match':'*'})
 assert a.status_code!=304 and a.headers['cache-control']=='no-store'

def test_boundaries_and_live_identity(fixture):
 c,r=fixture;worker(r);a=c.get('/en/projects');tag=a.headers['etag']
 assert c.get('/en/projects',headers={'X-Public-Fragment':'1'}).headers['cache-control']=='no-store'
 assert c.get('/en',headers={'Authorization':'Bearer ignored'}).headers['cache-control']=='no-store'
 run(r.sql.batch([("UPDATE auth_permissions SET can_view=0 WHERE role_uid=? AND module='projects'",(r.p['role_uid'],))]))
 assert c.get('/en/projects',headers={'If-None-Match':tag}).status_code==200
 run(r.auth.logout(r.p));a=c.get('/en/projects',headers={'If-None-Match':tag})
 assert a.status_code==200 and a.headers['cache-control']=='public, max-age=300'

@pytest.mark.parametrize('kind,mode,page_ttl,expected',[('local','simple',300,'private, no-cache'),('r2','simple',0,'private, no-cache'),('r2','off',0,'no-store'),('r2','full',300,'private, max-age=60')])
def test_policy_switches(fixture,kind,mode,page_ttl,expected):
 c,r=fixture;worker(r);r.kind=kind;r.worker_cache_mode=mode
 r.public_performance=PublicPerformance(public_cache_ttl_seconds=0 if mode=='off' else 1800,public_page_cache_ttl_seconds=page_ttl)
 assert c.get('/en').headers['cache-control']==expected
