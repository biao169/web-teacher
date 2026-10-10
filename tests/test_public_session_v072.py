import asyncio
from unittest.mock import patch
import pytest
from starlette.requests import Request
from test_accounts_regression import fixture
from backend.app.native.auth import Auth
from backend.app.native.web_common import shared_public_route
run=asyncio.run

@pytest.mark.parametrize('path,expected',[('/en',True),('/zh/projects',True),('/en/news/id',True),('/en/n/x',False),('/zh/contact',False),('/api/public/session-summary',False),('/admin',False),('/en/unknown',False),('/en/projects/id/extra',False)])
def test_boundary(path,expected):
 req=Request({'type':'http','method':'GET','path':path,'query_string':b'','headers':[]})
 assert shared_public_route(req)==expected
 req.scope['method']='POST';assert not shared_public_route(req)
 req.scope['method']='GET';req.scope['query_string']=b'nav=private';assert not shared_public_route(Request(dict(req.scope)))

def test_summary_minimal_single_auth(fixture):
 c,r=fixture;queries=[];original=r.sql.query
 async def query(sql,args=()):queries.append(sql);return await original(sql,args)
 with patch.object(Auth,'principal',side_effect=AssertionError('full auth')),patch.object(r.sql,'query',query):
  response=c.get('/api/public/session-summary');data=response.json()
 assert response.status_code==200 and data['can_view_private_projects'] and data['csrf']
 assert len(queries)==1 and not {'permissions','session_uid','scopes','password_hash'}&data.keys()
 assert response.headers['cache-control']=='private, max-age=60'
 assert response.headers['vary']=='Cookie, Authorization'
 c.cookies.clear();data=c.get('/api/public/session-summary').json();assert not data['authenticated'] and 'csrf' not in data

def test_project_permission_bounds_and_visibility(fixture):
 c,r=fixture
 run(r.sql.batch([("INSERT INTO projects(uid,name,visibility,principal,amount,members) VALUES(?,?,?,?,?,?)",(uid,uid,visibility,'PI','123','team')) for uid,visibility in [('pub','public'),('secret','hidden')]]))
 response=c.get('/api/public/admin-project-fields',params=[('uid','pub'),('uid','secret'),('uid','missing')])
 assert response.json()=={'projects':[{'uid':'pub','principal':'PI','amount':'123','members':'team'}]}
 for params in [[],[('uid','x')]*21,[('uid','')]]:
  response=c.get('/api/public/admin-project-fields',params=params);assert response.status_code==400 and response.headers['cache-control']=='no-store'
 run(r.sql.batch([("UPDATE auth_permissions SET can_view=0 WHERE module='projects'",())]))
 assert c.get('/api/public/admin-project-fields?uid=pub').status_code==403
 c.cookies.clear();assert c.get('/api/public/admin-project-fields?uid=pub').status_code==401

@pytest.mark.parametrize('change',["UPDATE auth_users SET must_change_password=1","UPDATE auth_roles SET is_system=0","UPDATE auth_sessions SET revoked_at=created_at,revoke_reason='logout'"])
def test_deny_changed_identity(fixture,change):
 c,r=fixture;run(r.sql.batch([(change,())]))
 assert c.get('/api/public/admin-project-fields?uid=pub').status_code in (401,403)

def test_exact_admin_ownership():
 import importlib.util
 spec=importlib.util.spec_from_file_location('routes','deploy/cloudflare/runtime/site_routes.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 for path in ('session-summary','admin-project-fields'):
  assert m.owner('https://example.test/api/public/'+path)=='admin'
  assert m.owner('https://example.test/api/public/'+path+'/extra')=='public'
 assert m.owner('/api/public/cache-revision')=='public'
