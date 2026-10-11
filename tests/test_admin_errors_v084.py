from unittest.mock import patch
import pytest
from test_accounts_regression import fixture,run,user
from backend.app.native.auth import Auth

@pytest.mark.parametrize('kind',['local','worker'])
@pytest.mark.parametrize('path,status',[('/admin',303),('/admin/profiles',303),('/api/admin/dashboard-counts',401)])
def test_invalid_session_cleared_once(fixture,kind,path,status):
 c,r=fixture;r.kind=kind;c.cookies.set('ts_session','invalid-token')
 original=Auth.principal;calls=[]
 async def principal(self,token):
  calls.append(token)
  if len(calls)>1:raise RuntimeError('second authentication forbidden')
  return await original(self,token)
 with patch.object(Auth,'principal',principal):a=c.get(path,follow_redirects=False)
 assert a.status_code==status and len(calls)==1
 assert any('ts_session=' in h and 'Max-Age=0' in h for h in a.headers.get_list('set-cookie'))
 assert a.headers['cache-control']=='no-store'
 if status==401:assert a.json()['code']=='session_required'
 else:assert a.headers['location']=='/auth/login'

@pytest.mark.parametrize('accept',['text/html','application/json'])
def test_denied_role_no_second_auth_or_template(fixture,accept):
 c,r=fixture;u=user(r);token=run(r.auth.login(u['username'],'Synthetic-only-password-035','test'));c.cookies.set('ts_session',token)
 original=Auth.principal;calls=[]
 async def principal(self,token):
  calls.append(token)
  if len(calls)>1:raise RuntimeError('second authentication forbidden')
  return await original(self,token)
 with patch.object(Auth,'principal',principal),patch.object(r.renderer,'render',side_effect=RuntimeError('no error template DB context')):
  a=c.get('/admin/profiles',headers={'Accept':accept},follow_redirects=False)
 assert a.status_code==403 and len(calls)==1
 assert 'set-cookie' not in a.headers
 assert a.headers['cache-control']=='no-store'

def test_expired_fragment_returns_401_not_login_document(fixture):
 c,r=fixture;c.cookies.set('ts_session','expired')
 a=c.get('/admin/profiles',headers={'X-Native-List':'1'},follow_redirects=False)
 assert a.status_code==401 and 'location' not in a.headers
 assert 'Max-Age=0' in a.headers['set-cookie']
