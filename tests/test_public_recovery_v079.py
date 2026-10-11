import asyncio
from unittest.mock import patch
import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from test_accounts_regression import fixture
from backend.app.native.public_recovery import response,template
from backend.app.native.catalog import Error

@pytest.mark.parametrize('lang',['en','zh'])
@pytest.mark.parametrize('attempted',[False,True])
def test_standalone_response(lang,attempted):
 request=Request({'type':'http','method':'GET','path':'/'+lang+'/profiles','headers':[], 'query_string':b'q=%22%3E%3Cscript%3E'+(b'&__recover=1' if attempted else b'')})
 request.state.request_id='safe-id'
 a=response(request);body=a.body.decode()
 assert a.status_code==503 and a.headers['retry-after']=='1'
 assert a.headers['cache-control']==a.headers['cloudflare-cdn-cache-control']=='no-store'
 assert f'data-attempted="{int(attempted)}"' in body
 assert '__recover=1' in body and 'safe-id' in body and '<script>' not in body
 assert ('This page could not' if lang=='en' else '页面暂时没有加载成功') in body
 assert '@@' not in body
 request.scope['method']='HEAD';assert response(request).body==b''

@pytest.mark.parametrize('kind',['local','r2'])
@pytest.mark.parametrize('failure',[RuntimeError('synthetic failure'),Error('synthetic failure',500),Error('synthetic failure',502),Error('synthetic failure',503),Error('synthetic failure',504)])
def test_public_failure_uses_independent_template(fixture,kind,failure,caplog):
 original,r=fixture;r.kind=kind;r.public_request_cache=False;r.worker_cache_mode='simple'
 with TestClient(original.app,base_url=r.config.origin,raise_server_exceptions=False) as c:
  with patch('backend.app.native.public_data.public_listing',side_effect=failure):
   first=c.get('/en/profiles');second=c.get('/en/profiles?__recover=1')
  assert first.status_code==second.status_code==503
  assert 'data-attempted="0"' in first.text and 'data-attempted="1"' in second.text
  assert first.headers['x-request-id'] in caplog.text
  assert 'synthetic failure' not in first.text
  assert second.headers['cache-control']=='no-store' and 'etag' not in second.headers


def test_success_marker_only_on_recovery(fixture):
 c,r=fixture;r.kind='r2';r.public_request_cache=False
 assert 'data-public-recovery-success' not in c.get('/en').text
 a=c.get('/en?__recover=1')
 assert a.status_code==200 and 'data-public-recovery-success' in a.text
 assert a.headers['cache-control']=='no-store'
 assert 'data-public-recovery-success' not in c.get('/auth/login?__recover=1').text


def test_form_and_fragment_not_html_recovered(fixture):
 original,r=fixture;r.kind='r2';r.public_request_cache=False
 asyncio.run(r.sql.batch([("INSERT INTO news(uid,title,slug,visibility,allow_comments,published_at) VALUES('form','News','form','public',1,'2020-01-01T00:00:00.000Z')",())]))
 with TestClient(original.app,base_url=r.config.origin,raise_server_exceptions=False) as c:
  with patch.object(r.renderer,'render',side_effect=RuntimeError('render error')):
   form=c.get('/en/news/form');admin=c.get('/admin');auth=c.get('/auth/login')
   for a in (form,admin,auth):assert 'x-public-recovery' not in a.headers
  with patch('backend.app.native.public_data.public_listing',side_effect=RuntimeError('fragment error')):
   a=c.get('/en/profiles',headers={'X-Public-Fragment':'1'})
   assert a.status_code==500 and 'x-public-recovery' not in a.headers


def test_no_jinja_or_data_needed(fixture):
 c,r=fixture;r.kind='r2';r.public_request_cache=False
 with TestClient(c.app,base_url=r.config.origin,raise_server_exceptions=False) as client:
  with patch.object(r.renderer,'render',side_effect=RuntimeError('broken Jinja')):
   a=client.get('/en')
   assert a.status_code==503 and 'data-public-recovery' in a.text
