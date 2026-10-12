"""PublicData HTTP: real database models, success markers and error exclusion."""
import json
from unittest.mock import patch, AsyncMock
import pytest
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from test_translation_regression import fixture,source,run
from backend.app.native.auth import Auth
from backend.app.native.public_read_model import ModelUnavailable
from backend.app.native.web_common import create_base
from backend.app.public_performance import PUBLIC_TABLES, PUBLIC_DATA_EDGE_POLICY

BASE='/api/public/data/'

@pytest.mark.parametrize('table',sorted(PUBLIC_TABLES))
@pytest.mark.parametrize('lang',['zh','en'])
def test_all_fixed_models_success(fixture,table,lang):
 c,r=fixture
 with patch.object(Auth,'principal',side_effect=AssertionError('auth in data')),patch.object(Auth,'public_principal',side_effect=AssertionError('auth in data')):
  response=c.get(BASE+lang+'/'+table)
 assert response.status_code==200
 assert response.headers['x-teacher-data-ok']=='1'
 assert response.headers['cache-control']=='public, max-age=300'
 assert response.headers['cloudflare-cdn-cache-control']==PUBLIC_DATA_EDGE_POLICY
 assert 'cookie' not in response.headers.get('vary','').lower()
 assert response.headers['x-robots-tag']=='noindex, nofollow'
 data=response.json()
 assert data['complete'] is True and data['module']==table and data['lang']==lang
 assert data['total']==len(data['items'])


def test_cookie_auth_and_admin_do_not_change_public_model(fixture):
 c,r=fixture
 source(r,'profiles','title','Public',email='PRIVATE_EMAIL',contact_visibility='hidden')
 first=c.get(BASE+'zh/profiles')
 c.cookies.clear();second=c.get(BASE+'zh/profiles')
 c.cookies.set('ts_session','invalid');third=c.get(BASE+'zh/profiles',headers={'Authorization':'Bearer ignored'})
 assert first.headers['etag']==second.headers['etag']==third.headers['etag']
 for response in (first,second,third):
  assert 'PRIVATE_EMAIL' not in response.text and '"csrf"' not in response.text


def test_head_conditional_and_semantic_etag(fixture):
 c,r=fixture;shown=source(r,'profiles','title','Before')
 first=c.get(BASE+'zh/profiles');head=c.head(BASE+'zh/profiles')
 assert head.status_code==200 and not head.content
 assert head.headers['etag']==first.headers['etag']
 assert head.headers['content-length']==first.headers['content-length']
 condition={'If-None-Match':first.headers['etag']}
 unchanged=c.get(BASE+'zh/profiles',headers=condition)
 assert unchanged.status_code==304 and not unchanged.content
 assert unchanged.headers['x-teacher-data-ok']=='1' and 'content-length' not in unchanged.headers
 assert c.head(BASE+'zh/profiles',headers=condition).status_code==304
 run(r.sql.batch([('UPDATE profiles SET title=? WHERE uid=?',('After',shown['uid']))]))
 changed=c.get(BASE+'zh/profiles',headers=condition)
 assert changed.status_code==200 and changed.headers['etag']!=first.headers['etag']


@pytest.mark.parametrize('suffix', ['zh/profiles?sort=name','zh/profiles?page=2','zh/profiles?_rev=1','fr/profiles','zh/auth_users','zh/unknown'])
def test_bad_urls_never_generate_models(fixture,suffix):
 c,r=fixture
 with patch('backend.app.native.public_read_model.build',new_callable=AsyncMock,side_effect=AssertionError('bad URL build')) as build:
  response=c.get(BASE+suffix)
 assert response.status_code in (400,404)
 assert response.headers['cache-control']==response.headers['cloudflare-cdn-cache-control']=='no-store'
 assert 'x-teacher-data-ok' not in response.headers
 build.assert_not_awaited()


@pytest.mark.parametrize('headers',[{'Range':'bytes=0-1'},{'X-Public-Fragment':'1'},{'If-Match':'*'},{'If-Unmodified-Since':'old'}])
def test_unsafe_request_bypasses_cache(fixture,headers):
 c,r=fixture
 response=c.get(BASE+'zh/profiles',headers=headers)
 assert response.status_code==400 and response.headers['cache-control']=='no-store'
 assert 'etag' not in response.headers


@pytest.mark.parametrize('exception',[ModelUnavailable('row_limit'),ModelUnavailable('query_limit'),RuntimeError('synthetic D1 outage')])
def test_failure_does_not_pollute_success_or_claim_304(fixture,exception):
 c,r=fixture;first=c.get(BASE+'zh/profiles')
 with patch('backend.app.native.public_read_model.build',new_callable=AsyncMock,side_effect=exception):
  failed=c.get(BASE+'zh/profiles',headers={'If-None-Match':first.headers['etag']})
 assert failed.status_code==503
 assert failed.headers['cache-control']==failed.headers['cloudflare-cdn-cache-control']=='no-store'
 assert all(key not in failed.headers for key in ('etag','x-teacher-data-ok','x-teacher-render-ok'))
 assert c.get(BASE+'zh/profiles').status_code==200


def test_incomplete_or_wrong_model_refuses_success_marker(fixture):
 c,r=fixture;valid=c.get(BASE+'zh/profiles').json()
 for key,value in [('complete',False),('module','auth_users'),('lang','fr'),('total',1),('revision',None)]:
  malformed={**valid,key:value}
  with patch('backend.app.native.public_read_model.build',new_callable=AsyncMock,return_value=malformed):
   response=c.get(BASE+'zh/profiles')
  assert response.status_code==503 and response.headers['cache-control']=='no-store'
  assert 'x-teacher-data-ok' not in response.headers


def test_unmarked_200_json_and_cookie_json_never_cached(fixture):
 _,r=fixture
 for marker,cookie in [(False,False),(True,True)]:
  app,_,_,_=create_base(lambda request:r)
  @app.get(BASE+'zh/profiles')
  async def invalid(req:Request):
   req.state.public_data_success=True
   response=JSONResponse({'error':'incorrect success'},headers={'Cache-Control':'public, max-age=300'})
   if marker:response.headers['X-Teacher-Data-OK']='1'
   if cookie:response.set_cookie('session','private')
   return response
  with TestClient(app,base_url=r.config.origin) as client:response=client.get(BASE+'zh/profiles')
  assert response.status_code==200 and response.headers['cache-control']=='no-store'
  assert 'x-teacher-data-ok' not in response.headers


def test_model_is_not_added_to_html_miss_and_admin_has_no_data_route(fixture):
 from backend.app.native.web_admin import create_admin_app
 c,r=fixture
 with patch('backend.app.native.public_read_model.build',new_callable=AsyncMock,side_effect=AssertionError('model on HTML')):
  assert c.get('/zh').status_code==200
 with TestClient(create_admin_app(lambda request:r),base_url=r.config.origin) as admin:
  response=admin.get(BASE+'zh/profiles')
 assert response.status_code==404 and response.headers['cache-control']=='no-store'


@pytest.mark.parametrize('status',[400,404,500,503])
def test_error_status_strips_forged_success_headers(fixture,status):
 _,r=fixture
 app,_,_,_=create_base(lambda request:r)
 @app.get(BASE+'zh/profiles')
 async def invalid(req:Request):
  req.state.public_data_success=True
  return JSONResponse({'error':'failed'},status_code=status,headers={'Cache-Control':'public, max-age=300','ETag':'"bad"','X-Teacher-Data-OK':'1'})
 with TestClient(app,base_url=r.config.origin) as c:response=c.get(BASE+'zh/profiles')
 assert response.status_code==status
 assert response.headers['cache-control']==response.headers['cloudflare-cdn-cache-control']=='no-store'
 assert 'etag' not in response.headers and 'x-teacher-data-ok' not in response.headers
