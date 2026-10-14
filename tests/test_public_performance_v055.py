import asyncio
from unittest.mock import patch
from types import SimpleNamespace
import pytest
from backend.app.public_performance import PublicPerformance as P
from backend.app.native.public_revision import revision,revision_write
from test_accounts_regression import fixture
from test_linux_manager_v76 import managed,update_args
run=asyncio.run

def test_revision_business_only_and_rollback(fixture):
 c,r=fixture;before=run(revision(r.sql))
 run(r.sql.batch([("INSERT INTO service_meta(key,value) VALUES ('test','1')",())]));assert run(revision(r.sql))==before
 run(r.sql.batch([('UPDATE profiles SET name=name',())]));assert run(revision(r.sql))!=before
 before=run(revision(r.sql))
 with pytest.raises(Exception):run(r.sql.batch([('UPDATE profiles SET name=name',()),('INSERT INTO nonexistent VALUES (1)',())]))
 assert run(revision(r.sql))==before
 assert revision_write([('UPDATE sync_tasks SET status=?',('waiting',))]) is None

def test_linux_generate_preserves_performance(managed):
 m,events,args=managed
 path=m.l.config/'teacher-site.env'
 with path.open('a') as f:f.write('TEACHER_PUBLIC_CACHE_TTL_SECONDS=3600\nTEACHER_PUBLIC_STREAM_CONCURRENCY=1\nTEACHER_PUBLIC_CACHE_MB=8\n')
 import hashlib
 unit=m.l.unit.read_text().replace('--workers 1','--workers 1 --port 8003');m.l.unit.write_text(unit)
 state=m.load();state['owned_files'][str(m.l.unit)]=hashlib.sha256(unit.encode()).hexdigest();m.save(state)
 (m.l.config/'generated/nginx-location.conf').write_text('proxy_pass http://127.0.0.1:8003;')
 m.update(update_args(scope='config'))
 m.configure(allowed_origins='https://teacher.example.org,https://extra.example.org')
 m.generate(m.l.current,m.load())
 assert 'TEACHER_PUBLIC_STREAM_CONCURRENCY=1' in path.read_text()
 assert 'TEACHER_PUBLIC_CACHE_TTL_SECONDS=3600' not in path.read_text()
 assert 'TEACHER_PUBLIC_CACHE_MB=8' not in path.read_text()



def test_sql_probe_counts_shapes_and_duplicates_without_logging_values():
 from probe_public_performance import SQLCounter
 import json
 class SQL:
  async def query(self,sql,args=()):return [{'secret':'DO_NOT_LOG_RESULT'}]
  async def batch(self,statements):return []
 sql=SQL();query=sql.query;batch=sql.batch
 with SQLCounter(sql) as counted:
  for value in ('DO_NOT_LOG_ARG','OTHER_ARG','DO_NOT_LOG_ARG'):
   run(sql.query('SELECT secret FROM translation_cache WHERE source_text=?',(value,)))
  run(sql.batch([('UPDATE private_table SET secret=?',('DO_NOT_LOG_WRITE',))]))
  report=counted.report();assert report['query_calls']==3 and report['unique_sql_shapes']==1
  assert report['exact_duplicate_calls']==1 and report['returned_rows']==3
  assert report['groups']=={'translation':3} and report['batch_statements']==1
  assert report['repeated_shapes'][0]['calls']==3
  text=json.dumps(report);assert all(s not in text for s in ('DO_NOT_LOG','SELECT','UPDATE','source_text'))
  counted.reset();assert counted.report()['query_calls']==0
 assert sql.query==query and sql.batch==batch


def test_sql_probe_restores_original_methods_on_failure():
 from probe_public_performance import SQLCounter
 class SQL:
  async def query(self,sql,args=()):raise RuntimeError('synthetic')
  async def batch(self,statements):return []
 sql=SQL();original=sql.query;batch=sql.batch
 with pytest.raises(RuntimeError):
  with SQLCounter(sql) as counted:run(sql.query('SELECT 1'))
 assert sql.query==original and sql.batch==batch
 assert counted.report()['query_calls']==1


def test_performance_probe_observation_is_not_a_claim_of_edge_hit_or_cpu():
 from probe_public_performance import samples,classification
 rows=samples(['nav-generic']);assert len(rows)==10
 assert ('/zh/n/nav-generic','fixed_base') in rows
 assert ('/en/n/nav-generic?direction=asc&size=10','fixed_query') in rows
 with pytest.raises(ValueError):samples(['unsafe?query=1'])
 with pytest.raises(ValueError):samples(['a','b','c','d','e'])
 result=classification(200,{'cache-control':'public, max-age=60','x-teacher-render-ok':'1'})
 assert result['response_public'] and result['edge_status']=='not_reported'
 assert classification(200,{'cf-cache-status':'MISS'})['edge_status']=='MISS'
 assert classification(500,{'cache-control':'no-store','cloudflare-cdn-cache-control':'no-store'})['no_store']
 assert not classification(500,{'cache-control':'public, max-age=60','x-teacher-render-ok':'1'})['response_public']


def test_local_measurement_counts_request_sql_and_conditional_still_renders():
 from probe_public_performance import measure_local
 class SQL:
  async def query(self,sql,args=()):return [{'n':1}]
  async def batch(self,statements):return []
 sql=SQL()
 class Client:
  def get(self,path,*,headers,follow_redirects):
   assert not follow_redirects;run(sql.query('SELECT 1'))
   return SimpleNamespace(status_code=304 if 'If-None-Match' in headers else 200,
           headers={'etag':'"synthetic"','cache-control':'public, max-age=60','x-teacher-render-ok':'1'},content=b'' if 'If-None-Match' in headers else b'body')
 original=sql.query;rows=measure_local(Client(),sql,[('/zh','home')])
 assert [r['status'] for r in rows]==[200,200,304]
 assert [r['sql']['query_calls'] for r in rows]==[1,1,1]
 assert all(r['edge_status']=='not_reported' for r in rows)
 assert rows[-1]['body_bytes']==0 and sql.query==original

@pytest.mark.parametrize('inside_source',[False,True])
def test_probe_cli_refuses_existing_or_source_outputs_before_measurement(tmp_path,monkeypatch,inside_source):
 import probe_public_performance as probe
 called=[];monkeypatch.setattr(probe,'local_baseline',lambda:called.append(True))
 output=probe.ROOT/'must-not-create.json' if inside_source else tmp_path/'existing.json'
 if not inside_source:output.write_text('KEEP')
 monkeypatch.setattr('sys.argv',['probe','--local','--output',str(output)])
 with pytest.raises(SystemExit) as error:probe.main()
 assert error.value.code==2 and called==[]
 if inside_source:assert not output.exists()
 else:assert output.read_text()=='KEEP'


def test_online_probe_does_not_follow_redirects_and_caps_response_body(monkeypatch):
 import probe_public_performance as probe
 requested=[];body_limits=[]
 class Reply:
  code=303;headers={'location':'https://other.test/unfollowed','cache-control':'no-store','cloudflare-cdn-cache-control':'no-store'}
  def __enter__(self):return self
  def __exit__(self,*args):pass
  def read(self,limit):body_limits.append(limit);return b''
 class Opener:
  def open(self,request,*,timeout):requested.append(request);assert timeout==15;return Reply()
 def opener(handler):assert isinstance(handler,probe.NoRedirect);return Opener()
 monkeypatch.setattr(probe.urllib.request,'build_opener',opener)
 report=probe.probe('https://site.test','synthetic',['nav-test'])
 assert len(requested)==20 and len(body_limits)==20
 assert all(limit==probe.MAX_BODY+1 for limit in body_limits)
 assert all(request.full_url.startswith('https://site.test/') for request in requested)
 assert all('Cookie' not in request.headers and 'Authorization' not in request.headers for request in requested)
 assert sum(row['status']=='not_run' for row in report['samples'])==10
 assert probe.NoRedirect().redirect_request(None,None,None,None,None,None) is None


def test_request_media_reuses_present_missing_and_mime_without_leaking_other_keys():
 from backend.app.native.public_data import public_media_map
 class SQL:
  def __init__(self):self.calls=[]
  async def query(self,sql,args=()):
   self.calls.append(tuple(args))
   return [{'uid':'uid-'+key,'object_key':key,'mime_type':'video/mp4' if key=='cover' else 'application/pdf'} for key in args if key!='missing']
 sql=SQL();r=SimpleNamespace(sql=sql,public_render_reads={})
 first=run(public_media_map(r,{'profiles':[{'avatar_key':'same'}],'site_settings':[{'logo_key':'same','favicon_key':'missing'}]}))
 assert first=={'same':'uid-same'} and len(sql.calls)==1
 news={'cover_key':'cover'};course={'syllabus_key':'same','material_key':'private','material_visibility':'hidden'}
 second=run(public_media_map(r,{'news':[news],'courses':[course],'site_settings':[{'favicon_key':'missing'}]}))
 assert second=={'same':'uid-same','cover':'uid-cover'} and sql.calls[-1]==('cover',)
 assert news['_cover_type']=='video/mp4' and course['_attachment_types']=={'syllabus_key':'application/pdf'}
 third=run(public_media_map(r,{'site_settings':[{'favicon_key':'missing'}]}))
 assert third=={} and len(sql.calls)==2
 assert run(public_media_map(r,{'publications':[{'pdf_key':'same','pdf_visibility':'hidden'}]}))=={}
 assert len(sql.calls)==2


def test_request_media_only_remembers_successful_queries_and_keeps_batch_bound():
 from backend.app.native.public_data import public_media_map
 class SQL:
  def __init__(self):self.calls=[];self.fail=True
  async def query(self,sql,args=()):
   self.calls.append(tuple(args))
   if self.fail:self.fail=False;raise RuntimeError('synthetic')
   return []
 sql=SQL();r=SimpleNamespace(sql=sql,public_render_reads={});data={'profiles':[{'avatar_key':'key-'+str(i)} for i in range(85)]}
 with pytest.raises(RuntimeError):run(public_media_map(r,data))
 assert r.public_render_reads['media_keys']=={}
 assert run(public_media_map(r,data))=={}
 assert all(len(args)<=40 for args in sql.calls) and len(sql.calls)==4
 run(public_media_map(r,data));assert len(sql.calls)==4


def test_site_options_request_copy_and_empty_result_are_reused_without_global_state():
 from backend.app.native.public_data import public_site_options
 class SQL:
  def __init__(self):self.calls=0;self.rows=[{'uid':'site','site_name':'Raw name'}]
  async def query(self,sql,args=()):self.calls+=1;return self.rows
 sql=SQL();r=SimpleNamespace(sql=sql,public_render_reads={})
 first=run(public_site_options(r));first['site_name']='Translated';first['title']='Decorated'
 assert run(public_site_options(r))=={'uid':'site','site_name':'Raw name'} and sql.calls==1
 sql.rows=[];empty=SimpleNamespace(sql=sql,public_render_reads={})
 assert run(public_site_options(empty))==run(public_site_options(empty))=={} and sql.calls==2
 unscoped=SimpleNamespace(sql=sql);run(public_site_options(unscoped));run(public_site_options(unscoped))
 assert sql.calls==4 and not hasattr(unscoped,'public_render_reads')


def test_render_read_memo_is_reset_for_each_request_even_shared_factory_has_old_data(fixture):
 from backend.app.native.web_common import create_base
 from fastapi.testclient import TestClient
 from fastapi.responses import JSONResponse
 c,r=fixture
 stale={'site_options':{'uid':'wrong','site_name':'STALE'},'media_keys':{'bad':{'uid':'leak','mime_type':'x'}}}
 r.public_render_reads=stale
 app,resources,csrf,render=create_base(lambda request:r);seen=[]
 @app.get('/test-request-isolation')
 async def inspect():
  from test_public_page_v102 import request
  current=await resources(request('/zh'));seen.append(current.public_render_reads)
  assert current.public_render_reads=={}
  current.public_render_reads['site_options']={'site_name':'request only'}
  return JSONResponse({'ok':True})
 client=TestClient(app,base_url=r.config.origin)
 try:
  assert client.get('/test-request-isolation').status_code==200
  assert client.get('/test-request-isolation').status_code==200
 finally:client.close()
 assert seen[0] is not seen[1] and r.public_render_reads is stale
 assert r.public_render_reads['site_options']['site_name']=='STALE'


def test_html_combines_distinct_brand_and_avatar_keys_but_fragments_skip_brand(fixture):
 from test_public_home_step2 import add,run
 from probe_public_performance import SQLCounter
 c,r=fixture
 run(r.sql.batch([('INSERT INTO media_assets(uid,object_key,title,mime_type,size,storage_kind,status) VALUES (?,?,?,?,?,?,?)',('avatar','avatar-key','Avatar','image/png',1,'local','active')),
                 ('INSERT INTO media_assets(uid,object_key,title,mime_type,size,storage_kind,status) VALUES (?,?,?,?,?,?,?)',('logo','logo-key','Logo','image/png',1,'local','active')),
                 ('UPDATE site_settings SET logo_key=? WHERE is_active=1',('logo-key',))]))
 add(r,'profiles','Public person',is_active=1,avatar_key='avatar-key');c.cookies.clear()
 with SQLCounter(r.sql) as counted:
  html=c.get('/zh/profiles');report=counted.report()
 assert html.status_code==200 and '/media/avatar' in html.text and '/media/logo' in html.text
 assert report['groups']['media']==1 and report['groups']['settings']==1
 with SQLCounter(r.sql) as counted:
  fragment=c.get('/zh/profiles',headers={'X-Public-Fragment':'1'});report=counted.report()
 assert fragment.status_code==200 and '/media/avatar' in fragment.json()['html']
 assert '/media/logo' not in fragment.json()['html'] and report['groups']['media']==1


def test_new_request_rechecks_deleted_media_and_changed_settings(fixture):
 from test_public_home_step2 import add,run
 c,r=fixture
 run(r.sql.batch([('INSERT INTO media_assets(uid,object_key,title,mime_type,size,storage_kind,status) VALUES (?,?,?,?,?,?,?)',('shared','shared-key','Shared','image/png',1,'local','active')),('UPDATE site_settings SET logo_key=?,site_name=? WHERE is_active=1',('shared-key','Before request'))]))
 add(r,'profiles','Person',is_active=1,avatar_key='shared-key');c.cookies.clear()
 before=c.get('/zh/profiles');assert '/media/shared' in before.text and 'Before request' in before.text
 run(r.sql.batch([("UPDATE media_assets SET status='trash' WHERE uid=?",('shared',)),('UPDATE site_settings SET site_name=? WHERE is_active=1',('After request',))]))
 after=c.get('/zh/profiles');assert '/media/shared' not in after.text and 'After request' in after.text
 assert after.headers['etag']!=before.headers['etag']

@pytest.mark.parametrize('table',['profiles','students','projects','publications','patents','courses','research_interests','news'])
def test_public_zero_count_skips_data_and_group_rules_after_validation(fixture,table):
 from probe_public_performance import SQLCounter
 from backend.app.native.catalog import Error,TITLE
 c,r=fixture
 query={'q':'NO_MATCH_SYNTHETIC_ONLY','page':'999','size':'10','sort':'student_category' if table=='students' else 'id'}
 with SQLCounter(r.sql) as counted:
  result=run(r.content.listing(table,public=True,query=query,projection=['uid',TITLE[table]]));report=counted.report()
 assert result=={'rows':[],'page':1,'pages':1,'size':10,'total':0}
 assert report['query_calls']==1 and report['batch_statements']==0
 for options in [{'projection':['not_a_field']},{'projection':['uid'],'projection_limits':{'uid':0}},{'query':{**query,'sort':'not_a_field'}},{'query':{**query,'size':'3'}}]:
  with pytest.raises(Error):run(r.content.listing(table,public=True,**({'query':query}|options)))
 # The private/export path preserves its two-read behavior and live authorization.
 with SQLCounter(r.sql) as counted:run(r.content.listing(table,r.p,query={'q':'NO_MATCH_SYNTHETIC_ONLY'}));report=counted.report()
 assert report['query_calls']==2
 c.cookies.clear()
 for lang in ['zh','en']:
  response=c.get('/'+lang+'/'+table+'?q=NO_MATCH_SYNTHETIC_ONLY&page=999')
  assert response.status_code==200 and 'data-total="0"' in response.text and 'data-page="1"' in response.text
  assert response.headers['cache-control']=='no-store' and response.headers['cloudflare-cdn-cache-control']=='no-store'
