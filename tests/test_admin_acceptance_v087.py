"""Final Admin acceptance using disposable SQLite; no production data access."""
from unittest.mock import patch
from fastapi.testclient import TestClient
from test_accounts_regression import fixture,run
from backend.app.native.catalog import now

def test_revoked_session_redirects_and_clears_cookie(fixture):
 c,r=fixture
 run(r.sql.batch([("UPDATE auth_sessions SET revoked_at=?,revoke_reason='logout'",(now(),))]))
 a=c.get('/admin/profiles',follow_redirects=False)
 assert a.status_code==303 and a.headers['location']=='/auth/login'
 assert 'Max-Age=0' in a.headers['set-cookie']

def test_database_outage_is_not_invalid_session(fixture,caplog):
 original,r=fixture
 with TestClient(original.app,base_url=r.config.origin,raise_server_exceptions=False) as c:
  c.cookies.update(original.cookies)
  with patch.object(r.sql,'query',side_effect=RuntimeError('synthetic database outage')):
   a=c.get('/admin',follow_redirects=False)
 assert a.status_code==500  # ASGI boundary; Worker outer boundary converts this to 503.
 assert 'location' not in a.headers and 'set-cookie' not in a.headers
 assert a.headers['cache-control']=='no-store'
 assert 'synthetic database outage' in caplog.text
