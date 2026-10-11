import asyncio
from unittest.mock import patch
import pytest
from test_accounts_regression import fixture,run
from backend.app.native.catalog import now

@pytest.mark.parametrize('kind',['local','worker'])
def test_twenty_admin_navigation_reads_one_heartbeat(fixture,kind):
 c,r=fixture;r.kind=kind
 run(r.sql.batch([('UPDATE auth_sessions SET created_at=?,last_seen_at=?',(now(seconds=-600),now(seconds=-121)))]))
 with patch.object(r.sql,'batch',wraps=r.sql.batch) as writes:
  for i in range(20):
   a=c.get('/admin' if i%2==0 else '/admin/profiles')
   assert a.status_code==200
  beats=[s for call in writes.call_args_list for s in call.args[0] if s[0].startswith('UPDATE auth_sessions SET last_seen_at')]
  assert len(beats)==1

@pytest.mark.parametrize('age,expected',[(119,0),(120,1),(121,1)])
def test_threshold_and_expiry_cap(fixture,age,expected):
 c,r=fixture;token=c.cookies.get('ts_session');at=now()
 from datetime import datetime,timedelta
 def clock(after=None,seconds=0):
  return (datetime.fromisoformat(at.replace('Z','+00:00'))+timedelta(seconds=seconds)).isoformat(timespec='milliseconds').replace('+00:00','Z')
 run(r.sql.batch([('UPDATE auth_sessions SET created_at=?,last_seen_at=?,idle_expires_at=?,expires_at=?',(clock(seconds=-600),clock(seconds=-age),clock(seconds=300),clock(seconds=300)))]))
 with patch('backend.app.native.auth.now',side_effect=clock),patch.object(r.sql,'batch',wraps=r.sql.batch) as writes:
  p=run(r.auth.principal(token));assert p and p['permissions'] and 'last_seen_at' not in p
  assert writes.call_count==expected
 if expected:
  row=run(r.sql.query('SELECT * FROM auth_sessions'))[0]
  assert row['idle_expires_at']==row['expires_at']==clock(seconds=300)

@pytest.mark.parametrize('column',['revoked_at','idle_expires_at','expires_at'])
def test_invalid_session_is_not_renewed(fixture,column):
 c,r=fixture;token=c.cookies.get('ts_session')
 run(r.sql.batch([('UPDATE auth_sessions SET created_at=?,updated_at=?,last_seen_at=?,idle_expires_at=?,expires_at=?',(now(seconds=-600),now(seconds=-500),now(seconds=-500),now(seconds=-1) if column in ('idle_expires_at','expires_at') else now(seconds=300),now(seconds=-1) if column=='expires_at' else now(seconds=300)))]))
 if column=='revoked_at':run(r.sql.batch([("UPDATE auth_sessions SET revoked_at=?,revoke_reason='logout'",(now(),))]))
 with patch.object(r.sql,'batch',wraps=r.sql.batch) as writes:
  assert run(r.auth.principal(token)) is None
  assert not writes.called

def test_concurrent_stale_reads_update_only_once(fixture):
 c,r=fixture;token=c.cookies.get('ts_session')
 run(r.sql.batch([('UPDATE auth_sessions SET created_at=?,last_seen_at=?',(now(seconds=-600),now(seconds=-121)))]))
 original=r.sql.query;rows=run(original("SELECT u.uid,u.display_name,u.username,u.role_uid,u.must_change_password,u.updated_at user_stamp,r.updated_at role_stamp,r.level,r.name role_name,r.visibility_scopes,r.is_system,s.uid session_uid,s.expires_at,s.last_seen_at FROM auth_sessions s JOIN auth_users u ON u.uid=s.user_uid JOIN auth_roles r ON r.uid=u.role_uid"))
 async def stale(sql,args=()):
  if 'FROM auth_sessions s JOIN' in sql:return [dict(rows[0])]
  return await original(sql,args)
 with patch.object(r.sql,'query',side_effect=stale):
  run(r.auth.principal(token));first=run(original('SELECT updated_at FROM auth_sessions'))[0]['updated_at']
  run(r.auth.principal(token));second=run(original('SELECT updated_at FROM auth_sessions'))[0]['updated_at']
 assert first==second
