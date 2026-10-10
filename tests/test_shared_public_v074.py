import asyncio
from unittest.mock import patch
import pytest
from test_accounts_regression import fixture
from backend.app.native.auth import Auth
run=asyncio.run

def worker(r):r.kind='r2';r.worker_cache_mode='simple';r.public_request_cache=False

@pytest.mark.parametrize('path',['/en','/zh','/en/projects','/en/profiles','/en/students','/en/publications','/en/news'])
def test_equal_html_and_etag_without_auth(fixture,path):
 c,r=fixture;worker(r);token=c.cookies.get('ts_session')
 with patch.object(Auth,'principal',side_effect=AssertionError('full auth')),patch.object(Auth,'public_principal',side_effect=AssertionError('light auth')):
  admin=c.get(path);assert admin.status_code==200
  c.cookies.clear();anon=c.get(path)
  c.cookies.set('ts_session','invalid');invalid=c.get(path,headers={'Authorization':'Bearer ignored'})
  assert admin.content==anon.content==invalid.content
  assert admin.headers['etag']==anon.headers['etag']==invalid.headers['etag']
  assert admin.headers['vary']=='X-Public-Fragment'
  assert admin.headers['cache-control']=='public, max-age=1800'
  assert c.get(path,headers={'If-None-Match':admin.headers['etag']}).status_code==304
  assert not c.head(path).content
  assert 'name="_csrf"' not in admin.text and 'data-public-identity=""' in admin.text
 c.cookies.set('ts_session',token)
 run(r.sql.batch([('UPDATE auth_users SET role_uid=? WHERE uid=?',('role-registered',r.p['uid']))]))
 assert c.get(path).content==anon.content


def test_private_fields_and_navigation_absent(fixture):
 c,r=fixture;worker(r)
 run(r.sql.batch([("INSERT INTO projects(uid,name,visibility,principal,amount,members) VALUES('shared','Public','public','PRIVATE-PI','123.45','PRIVATE-MEMBERS')",())]))
 a=c.get('/en/projects');assert 'PRIVATE-PI' not in a.text and 'PRIVATE-MEMBERS' not in a.text
 rev=a.headers['x-public-revision'];headers={'X-Public-Fragment':'1'}
 first=c.get('/en/projects?_rev='+rev,headers=headers)
 c.cookies.clear();second=c.get('/en/projects?_rev='+rev,headers=headers)
 assert first.content==second.content and first.headers['etag']==second.headers['etag']
 assert first.headers['vary']=='X-Public-Fragment'
 assert c.get('/en/projects?_rev='+rev,headers={**headers,'If-None-Match':first.headers['etag']}).status_code==304
 assert first.headers['etag']!=a.headers['etag']


def test_news_form_stays_authenticated_and_no_store(fixture):
 c,r=fixture;worker(r)
 run(r.sql.batch([("INSERT INTO news(uid,title,slug,visibility,allow_comments,published_at) VALUES('form','News','form','public',1,'2020-01-01T00:00:00.000Z')",())]))
 with patch.object(Auth,'public_principal',wraps=Auth(r.sql,r.passwords).public_principal) as auth:
  response=c.get('/en/news/form',headers={'If-None-Match':'*'})
 assert auth.call_count==1 and response.status_code==200
 assert response.headers['cache-control']=='no-store' and 'etag' not in response.headers
 assert 'data-public-shared="1"' not in response.text
 with patch.object(Auth,'public_principal',wraps=Auth(r.sql,r.passwords).public_principal) as auth:
  c.get('/en/n/missing');assert auth.call_count==1


def test_detail_and_revision_guard(fixture):
 c,r=fixture;worker(r)
 run(r.sql.batch([("INSERT INTO profiles(uid,name,visibility,is_active) VALUES('shared','Teacher','public',1)",())]))
 a=c.get('/en/profiles/shared');assert a.status_code==200 and 'etag' in a.headers
 assert c.get('/en/profiles/shared',headers={'If-None-Match':a.headers['etag']}).status_code==304
 run(r.sql.batch([("UPDATE profiles SET visibility='hidden' WHERE uid='shared'",())]))
 assert c.get('/en/profiles/shared',headers={'If-None-Match':'*'}).status_code==404
 with patch.object(Auth,'public_principal',side_effect=AssertionError('auth in revision')):
  assert c.get('/api/public/cache-revision?shared=1').json()['identity']==''
 r.kind='local'
 with patch.object(Auth,'principal',wraps=Auth(r.sql,r.passwords).principal) as auth:
  c.get('/api/public/cache-revision?shared=1');assert auth.call_count==1
