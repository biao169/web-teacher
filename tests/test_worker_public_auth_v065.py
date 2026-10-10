import asyncio
from unittest.mock import patch
import pytest
from test_accounts_regression import fixture
from backend.app.native.auth import Auth
from backend.app.native.catalog import now
from backend.app.native.public_data import project_private_allowed
from backend.app.native.public_http_cache import identity_fingerprint
run=asyncio.run

def test_projection_and_throttle(fixture):
 c,r=fixture;token=c.cookies.get(r.config.name('session'));auth=Auth(r.sql,r.passwords)
 full=run(auth.principal(token));queries=[];writes=[];original=r.sql.query;batch=r.sql.batch
 async def query(sql,args=()):queries.append(sql);return await original(sql,args)
 async def write(items):writes.extend(items);return await batch(items)
 with patch.object(r.sql,'query',query),patch.object(r.sql,'batch',write):
  light=run(auth.public_principal(token));assert len(queries)==1 and not writes
 assert light['uid']==full['uid'] and light['scopes']==full['scopes'] and light['csrf']==full['csrf']
 assert project_private_allowed(light)==project_private_allowed(full)
 assert set(light['permissions'])=={'projects'} and light['can_enter_admin']
 from datetime import datetime,timedelta,timezone
 def future_now(seconds=0,**kw):return (datetime.now(timezone.utc)+timedelta(seconds=121+seconds)).isoformat(timespec='milliseconds').replace('+00:00','Z')
 with patch.object(r.sql,'batch',write),patch('backend.app.native.auth.now',future_now):
  a=run(auth.public_principal(token));b=run(auth.public_principal(token))
 assert len(writes)==1 and identity_fingerprint(a)==identity_fingerprint(b)

@pytest.mark.parametrize('change',["UPDATE auth_users SET status='disabled'","UPDATE auth_roles SET is_active=0","UPDATE auth_sessions SET revoked_at=created_at,revoke_reason='logout'"])
def test_invalid_session_or_role_rejected(fixture,change):
 c,r=fixture;token=c.cookies.get(r.config.name('session'));run(r.sql.batch([(change,())]))
 assert run(Auth(r.sql,r.passwords).public_principal(token)) is None

def test_permission_change_live_and_no_admin_menu(fixture):
 c,r=fixture;r.kind='r2';r.public_request_cache=False;r.worker_cache_mode='simple'
 calls=[];original=r.sql.query
 async def query(sql,args=()):calls.append(sql);return await original(sql,args)
 with patch.object(r.sql,'query',query),patch.object(Auth,'principal',side_effect=AssertionError('full auth on public')):
  page=c.get('/en');assert page.status_code==200,page.text
  assert 'href="/admin"' in page.text
  old=c.get('/api/public/cache-revision').json()['identity']
 assert not any("location='admin-sidebar'" in q or q.startswith('SELECT module,can_view') for q in calls)
 token=c.cookies.get(r.config.name('session'));auth=Auth(r.sql,r.passwords);p=run(auth.public_principal(token))
 run(r.sql.batch([('UPDATE auth_permissions SET can_view=0 WHERE role_uid=?',(p['role_uid'],))]))
 p=run(auth.public_principal(token));assert not p['can_enter_admin'] and not project_private_allowed(p)
 page=c.get('/en');assert 'href="/admin"' not in page.text
 assert c.get('/api/public/cache-revision').json()['identity']!=old

@pytest.mark.parametrize('kind,path,method',[('local','/en','get'),('r2','/admin','get'),('r2','/auth/login','get'),('r2','/en/contact','get'),('r2','/auth/logout','post')])
def test_full_auth_boundaries(fixture,kind,path,method):
 c,r=fixture;r.kind=kind;r.public_request_cache=False
 with patch.object(Auth,'public_principal',side_effect=AssertionError('light auth outside Worker public')):
  response=getattr(c,method)(path,follow_redirects=False)
 assert response.status_code in (200,302,303,403)

@pytest.mark.parametrize('seconds',[1801,43201])
def test_expired_session(fixture,seconds):
 c,r=fixture;token=c.cookies.get(r.config.name('session'))
 future=now(seconds=seconds)
 with patch('backend.app.native.auth.now',return_value=future):assert run(Auth(r.sql,r.passwords).public_principal(token)) is None
