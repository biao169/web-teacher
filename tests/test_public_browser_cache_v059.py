import asyncio
import pytest
from test_accounts_regression import fixture
from backend.app.native.public_http_cache import identity_fingerprint,finish
from backend.app.public_performance import PublicPerformance as P
run=asyncio.run

@pytest.mark.parametrize('ttl',[0,30,300,3600])
def test_anonymous_browser_policy_and_304(fixture,ttl):
 c,r=fixture;c.cookies.clear();r.public_performance=P(public_page_cache_ttl_seconds=ttl)
 expected=f'public, max-age={ttl}' if ttl else 'private, no-cache'
 response=c.get('/en');assert response.status_code==200 and response.headers['cache-control']==expected
 assert set(x.strip() for x in response.headers['vary'].split(','))=={'Cookie','Authorization','X-Public-Fragment'}
 repeat=c.get('/en');assert repeat.headers['cache-control']==expected
 if ttl:assert repeat.headers['x-public-page-cache']=='HIT'
 conditional=c.get('/en',headers={'If-None-Match':response.headers['etag']})
 assert conditional.status_code==304 and conditional.headers['cache-control']==expected and conditional.content==b''
 head=c.head('/en');assert head.headers['cache-control']==expected and head.content==b''


def test_live_login_logout_expired_session_and_permissions(fixture):
 c,r=fixture;token=c.cookies.get('ts_session');admin=c.get('/en/projects');tag=admin.headers['etag']
 assert admin.headers['cache-control']=='private, no-cache' and admin.headers['x-public-page-cache']=='BYPASS'
 assert c.get('/en/projects',headers={'If-None-Match':tag}).status_code==304
 old_identity=c.get('/api/public/cache-revision').json()['identity']
 run(r.sql.batch([("UPDATE auth_permissions SET can_view=0 WHERE role_uid=? AND module='projects'",(r.p['role_uid'],))]))
 current_identity=c.get('/api/public/cache-revision').json()['identity']
 assert old_identity!=current_identity
 assert c.get('/en/projects',headers={'If-None-Match':tag}).status_code==200
 c.cookies.clear();anon=c.get('/en/projects',headers={'If-None-Match':tag})
 assert anon.status_code==200 and anon.headers['cache-control']=='public, max-age=300'
 c.cookies.set('ts_session',token)
 assert c.get('/en/projects',headers={'If-None-Match':anon.headers['etag']}).status_code==200
 run(r.auth.logout(r.p))
 expired=c.get('/en/projects',headers={'If-None-Match':tag})
 assert expired.status_code==200 and expired.headers['cache-control']=='public, max-age=300'
 assert c.get('/api/public/cache-revision').json()['identity']==''


def test_identity_consistent_with_html_and_no_secrets(fixture):
 c,r=fixture;identity=c.get('/api/public/cache-revision').json()['identity']
 assert len(identity)==64 and 'data-public-identity="'+identity+'"' in c.get('/en').text
 for value in (r.p['csrf'],r.p['uid'],r.p['username']):assert value not in identity
 assert identity_fingerprint(None)==''

@pytest.mark.parametrize('path',['/en/contact','/auth/login','/admin','/api/public/cache-revision','/en/profiles/missing','/xx'])
def test_sensitive_and_error_pages_no_store(fixture,path):
 c,r=fixture;response=c.get(path,headers={'If-None-Match':'*'})
 assert response.status_code!=304 and response.headers['cache-control']=='no-store'


def test_details_not_accidentally_public_cached(fixture):
 c,r=fixture;c.cookies.clear()
 uid=run(r.sql.query("SELECT uid FROM profiles LIMIT 1"))[0]['uid']
 run(r.sql.batch([("UPDATE profiles SET visibility='public',is_active=1 WHERE uid=?",(uid,))]))
 response=c.get('/en/profiles/'+uid,headers={'If-None-Match':'*'})
 assert response.status_code==200 and response.headers['cache-control']=='no-store' and 'etag' not in response.headers


def test_set_cookie_overrides_public_header():
 from fastapi.responses import HTMLResponse
 from types import SimpleNamespace
 response=HTMLResponse('safe?',headers={'Cache-Control':'public, max-age=300','ETag':'"old"'})
 response.set_cookie('challenge','test')
 response=finish(SimpleNamespace(method='GET'),response,'"new"')
 assert response.headers['cache-control']=='no-store' and 'etag' not in response.headers


def test_expired_session_does_not_revalidate_private_html(fixture,monkeypatch):
 c,r=fixture;first=c.get('/en')
 monkeypatch.setattr('backend.app.native.auth.now',lambda **kwargs:'9999-01-01T00:00:00.000Z')
 response=c.get('/en',headers={'If-None-Match':first.headers['etag']})
 assert response.status_code==200 and response.headers['cache-control']=='public, max-age=300'
 assert c.get('/api/public/cache-revision').json()['identity']==''
