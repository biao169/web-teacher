"""Real SQLite HTTP acceptance; r2 selects Worker branches, not hosted D1."""
from unittest.mock import patch
import pytest
from test_accounts_regression import fixture, run
from backend.app.native.catalog import now

@pytest.mark.parametrize('kind', ['local', 'r2'])
def test_public_navigation_and_twenty_summary_reads_have_one_heartbeat(fixture, kind):
 c,r=fixture;r.kind=kind
 run(r.sql.batch([('UPDATE auth_sessions SET created_at=?,last_seen_at=?',(now(seconds=-600),now(seconds=-121)))]))
 with patch.object(r.sql,'batch',wraps=r.sql.batch) as writes:
  for _ in range(20):
   assert c.get('/en/profiles').status_code==200
  assert not any('UPDATE auth_sessions' in s[0] for call in writes.call_args_list for s in call.args[0])
  for _ in range(20):
   response=c.get('/api/public/session-summary')
   assert response.status_code==200 and response.json()['authenticated']
  beats=[s for call in writes.call_args_list for s in call.args[0] if s[0].startswith('UPDATE auth_sessions SET last_seen_at')]
  assert len(beats)==1

@pytest.mark.parametrize('kind', ['local', 'r2'])
def test_cached_display_cannot_authorize_after_revocation(fixture, kind):
 c,r=fixture;r.kind=kind
 assert c.get('/api/public/session-summary').json()['authenticated']
 run(r.sql.batch([("UPDATE auth_sessions SET revoked_at=created_at,revoke_reason='logout'",())]))
 # The browser may still display a name. Server-side access must already be denied.
 assert c.get('/en/profiles').status_code==200
 assert c.get('/api/public/session-summary').json()['authenticated'] is False
 assert c.get('/api/public/admin-project-fields?uid=pub').status_code==401
 response=c.get('/admin/profiles',follow_redirects=False)
 assert response.status_code in (302,303,307,401)
 if response.status_code!=401:assert '/auth/login' in response.headers['location']

@pytest.mark.parametrize('kind', ['local', 'r2'])
def test_project_permission_change_is_live(fixture,kind):
 c,r=fixture;r.kind=kind
 assert c.get('/api/public/session-summary').json()['can_view_private_projects']
 run(r.sql.batch([("UPDATE auth_permissions SET can_view=0 WHERE module='projects'",())]))
 assert c.get('/api/public/admin-project-fields?uid=pub').status_code==403
 assert c.get('/api/public/session-summary').json()['can_view_private_projects'] is False
