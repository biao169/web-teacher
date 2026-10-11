import asyncio
from unittest.mock import patch
import pytest
from test_accounts_regression import fixture,run
from backend.app.native.auth import Auth
from backend.app.native.catalog import now

@pytest.mark.parametrize('kind',['local','r2'])
def test_contract_and_expiry(fixture,kind):
 c,r=fixture;r.kind=kind
 response=c.get('/api/public/session-summary');data=response.json()
 assert response.status_code==200 and data['authenticated']
 assert data['display_ttl_seconds']==300 and data['heartbeat_interval_seconds']==300
 rows=run(r.sql.query('SELECT idle_expires_at,expires_at FROM auth_sessions'))
 assert data['idle_expires_at']==rows[0]['idle_expires_at']
 assert data['absolute_expires_at']==rows[0]['expires_at']
 assert data['checked_at']<=data['absolute_expires_at']
 assert not {'session_uid','token_hash','permissions','scopes'}&data.keys()
 assert response.headers['cache-control']=='private, no-store'
 assert response.headers['cloudflare-cdn-cache-control']=='no-store'

@pytest.mark.parametrize('change',[
 "UPDATE auth_sessions SET revoked_at=created_at,revoke_reason='logout'",
 "UPDATE auth_users SET status='disabled'",
 "UPDATE auth_roles SET is_active=0",
])
def test_invalid_not_renewed(fixture,change):
 c,r=fixture;run(r.sql.batch([(change,())]))
 before=run(r.sql.query('SELECT last_seen_at,idle_expires_at FROM auth_sessions'))
 data=c.get('/api/public/session-summary').json()
 assert data['authenticated'] is False and data['display_ttl_seconds']==60
 assert not {'csrf','uid','idle_expires_at'}&data.keys()
 assert run(r.sql.query('SELECT last_seen_at,idle_expires_at FROM auth_sessions'))==before

def test_renewal_returns_persisted_expiry_and_caps_absolute(fixture):
 c,r=fixture
 run(r.sql.batch([('UPDATE auth_sessions SET created_at=?,last_seen_at=?,idle_expires_at=?,expires_at=?',(now(seconds=-200),now(seconds=-180),now(seconds=60),now(seconds=600)))]))
 data=c.get('/api/public/session-summary').json()
 assert data['idle_expires_at']==data['absolute_expires_at']
 assert data['idle_expires_at']==run(r.sql.query('SELECT idle_expires_at FROM auth_sessions'))[0]['idle_expires_at']
 with patch.object(r.sql,'batch',side_effect=AssertionError('fresh session write')):
  assert c.get('/api/public/session-summary').status_code==200

@pytest.mark.parametrize('kind',['local','r2'])
def test_failure_is_unknown_and_no_secrets(fixture,kind):
 c,r=fixture;r.kind=kind
 with patch.object(Auth,'public_principal',side_effect=RuntimeError('SENSITIVE SQL TOKEN')):
  response=c.get('/api/public/session-summary')
 assert response.status_code==503
 assert 'authenticated' not in response.json()
 assert response.json()['code']=='SESSION_CHECK_UNAVAILABLE'
 assert response.headers['x-request-id']==response.json()['request_id']
 assert 'SENSITIVE' not in response.text
 assert 'no-store' in response.headers['cache-control']
 assert response.headers['retry-after']=='60'

def test_cancel_propagates(fixture):
 c,r=fixture
 # CancelledError is BaseException, outside the transient failure boundary.
 assert not issubclass(asyncio.CancelledError,Exception)

@pytest.mark.parametrize('seconds',[1900,44000])
def test_expired_session_not_revived(fixture,seconds):
 c,r=fixture
 before=run(r.sql.query('SELECT last_seen_at,idle_expires_at FROM auth_sessions'))
 future=now(seconds=seconds)
 with patch('backend.app.native.auth.now',return_value=future):
  assert c.get('/api/public/session-summary').json()['authenticated'] is False
 assert run(r.sql.query('SELECT last_seen_at,idle_expires_at FROM auth_sessions'))==before
