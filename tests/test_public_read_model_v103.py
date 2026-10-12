"""Real SQLite: complete anonymous models, parity and bounded generation."""
import asyncio
import json
from unittest.mock import patch
import pytest
from test_translation_regression import fixture, source, cache, run, translated
from backend.app.native.public_read_model import build, ModelLimits, ModelUnavailable, SUPPORTED
from backend.app.native.catalog import Error
from backend.app.native.public_data import public_listing, people_facet


def model(r,table='profiles',lang='zh',**kw):return run(build(r,table,lang,**kw))
def item(data,uid):return next(row for row in data['items'] if row['uid']==uid)

@pytest.mark.parametrize('table',['profiles','students'])
@pytest.mark.parametrize('lang',['zh','en'])
def test_complete_public_projection_and_no_writes(fixture,table,lang):
 c,r=fixture
 shown=source(r,table,'bio','公开摘要',email='PUBLIC@EXAMPLE.TEST',contact_visibility='public')
 source(r,table,'bio','SECRET_HIDDEN',visibility='hidden')
 source(r,table,'bio','SECRET_OWNER',visibility='owner')
 private=source(r,table,'bio','Visible biography',email='SECRET_EMAIL',contact_visibility='hidden')
 if table=='profiles':source(r,table,'bio','SECRET_INACTIVE',is_active=0)
 original=r.sql.query;reads=[]
 async def query(sql,args=()):reads.append(sql);return await original(sql,args)
 with patch.object(r.sql,'query',query),patch.object(r.sql,'batch',side_effect=AssertionError('write in model')):
  data=model(r,table,lang)
 body=json.dumps(data)
 assert data['complete'] is True and data['total']==2
 assert item(data,shown['uid'])['display']['email']=='PUBLIC@EXAMPLE.TEST'
 assert 'email' not in item(data,private['uid'])['display']
 assert all(secret not in body for secret in ('SECRET_EMAIL','SECRET_HIDDEN','SECRET_OWNER','SECRET_INACTIVE'))
 for forbidden in ('csrf','permissions','contact_visibility','avatar_key','password_hash','source_refs','provider'):
  assert '"'+forbidden+'"' not in body
 assert data['stats']['json_bytes']==len(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode())
 assert data['stats']['queries']==len(reads) and len(reads)<=40


def test_full_dataset_not_first_server_page(fixture):
 c,r=fixture
 uids=[source(r,'profiles','title','Professor',name='Person'+str(i))['uid'] for i in range(31)]
 data=model(r)
 assert data['total']==31 and {row['uid'] for row in data['items']}==set(uids)
 page=run(public_listing(r,'profiles',{}))
 assert len(page['rows'])==10
 assert [row['uid'] for row in data['items'][:10]]==[row['uid'] for row in page['rows']]


@pytest.mark.parametrize('protection',['none','manual','explicit','stop','failed_manual','native'])
def test_batched_english_matches_existing_overlay(fixture,protection):
 c,r=fixture
 donor=source(r,'profiles','title','共同原文');cache(r,'profiles',donor,'title','Shared',manual=1)
 target=source(r,'profiles','title','共同原文')
 if protection=='manual':cache(r,'profiles',target,'title','Own',manual=1)
 if protection=='explicit':cache(r,'profiles',target,'title','Own',meta={'_reuse':{'explicit':True}})
 if protection=='stop':cache(r,'profiles',target,'title','Stopped',meta={'_inactive':True})
 if protection=='failed_manual':cache(r,'profiles',target,'title','Failed',manual=1,status='failed',current=0)
 if protection=='native':
  target=source(r,'profiles','name','中文',name_en='Native English')
  field='name'
 else:field='title'
 expected=translated(r,'profiles',target,field)
 assert item(model(r,'profiles','en'),target['uid'])['display'][field]==expected
 # Search remains bilingual even for a Chinese model, matching existing search behavior.
 assert expected in item(model(r,'profiles','zh'),target['uid'])['search_values']


def test_private_and_wrong_hash_donors_do_not_leak(fixture):
 c,r=fixture
 donor=source(r,'profiles','title','共同原文',visibility='hidden');cache(r,'profiles',donor,'title','SECRET_DONOR')
 shown=source(r,'profiles','title','共同原文')
 cache(r,'profiles',shown,'title','WRONG_HASH',hash_value='0'*64)
 data=model(r,'profiles','en')
 assert item(data,shown['uid'])['display']['title']=='共同原文'
 assert 'SECRET_DONOR' not in json.dumps(data) and 'WRONG_HASH' not in json.dumps(data)


def test_token_facets_and_student_group_order(fixture):
 c,r=fixture
 run(r.sql.batch([("INSERT INTO student_category_displays(uid,key,label,label_en,keywords,enabled,display_order) VALUES('rule-v103','doctoral-v103','博士','Doctoral','PhD',1,0)",())]))
 first=source(r,'students','degree','PhD',name='A',category='AI；ai\nRobotics',sort_order=20)
 second=source(r,'students','degree','Master',name='B',category='Robotics',sort_order=1)
 data=model(r,'students')
 assert data['items'][0]['uid']==first['uid']
 assert item(data,first['uid'])['order']['group']==0 and item(data,second['uid'])['order']['group']==1
 facet=next(f for f in data['facets'] if f['field']=='category')
 assert facet['values']==run(people_facet(r.content,'students','category'))['values']
 page=run(public_listing(r,'students',{}))
 assert [row['uid'] for row in data['items']]==[row['uid'] for row in page['rows']]
 assert data['groups'][0]['label']=='博士'
 assert model(r,'students','en')['groups'][0]['label']=='Doctoral'


def test_literal_search_values_and_safe_links(fixture):
 c,r=fixture
 shown=source(r,'profiles','bio','Literal %_\\ keyword',orcid='0000-0002-1825-0097')
 run(r.sql.batch([('UPDATE profiles SET personal_homepage=? WHERE uid=?',('javascript:alert(1)',shown['uid']))]))
 row=item(model(r),shown['uid'])
 assert 'Literal %_\\ keyword' in row['search_values']
 assert 'personal_homepage' not in row['links']
 assert row['links']['orcid']=='https://orcid.org/0000-0002-1825-0097'


@pytest.mark.parametrize('limits,reason',[(ModelLimits(max_rows=1),'row_limit'),
 (ModelLimits(max_json_bytes=100),'byte_limit'),(ModelLimits(max_field_chars=2),'field_limit'),
 (ModelLimits(max_queries=1),'query_limit')])
def test_limits_never_return_partial_success(fixture,limits,reason):
 c,r=fixture
 source(r,'profiles','title','Long title');source(r,'profiles','title','Another')
 with pytest.raises(ModelUnavailable) as caught:model(r,limits=limits)
 assert caught.value.reason==reason and caught.value.status==503


def test_revision_change_during_generation_rejects_model(fixture):
 c,r=fixture;source(r)
 original=r.sql.query;count=0
 async def query(sql,args=()):
  nonlocal count
  if sql.startswith('SELECT value FROM service_meta'):
   count+=1
   return [{'value':'before' if count==1 else 'after'}]
  return await original(sql,args)
 with patch.object(r.sql,'query',query),pytest.raises(ModelUnavailable) as caught:model(r)
 assert caught.value.reason=='source_changed'


def test_batch_translation_queries_do_not_scale_per_row(fixture):
 c,r=fixture
 for i in range(24):source(r,'profiles','title','共同原文',name='共同名字')
 data=model(r)
 assert data['stats']['queries']<=8 # Two batched winner reads, not 2 per person.


@pytest.mark.parametrize('table,lang',[('auth_users','zh'),('unknown','zh'),('profiles','fr')])
def test_unsupported_inputs_rejected_without_database(fixture,table,lang):
 c,r=fixture
 with patch.object(r.sql,'query',side_effect=AssertionError('invalid input SQL')) as read,pytest.raises(Error):
  model(r,table,lang)
 read.assert_not_called()


@pytest.mark.parametrize('table,field',[('research_interests','description'),('projects','fund_name'),
 ('publications','venue'),('patents','owner'),('courses','audience'),('news','category')])
@pytest.mark.parametrize('lang',['zh','en'])
def test_other_standard_modules_complete_and_bilingual(fixture,table,field,lang):
 c,r=fixture
 shown=source(r,table,field,'共同原文');cache(r,table,shown,field,'Public English')
 source(r,table,field,'HIDDEN_TOKEN',visibility='hidden')
 data=model(r,table,lang)
 assert data['total']==1 and data['complete']
 row=item(data,shown['uid'])
 assert row['display'][field]==('Public English' if lang=='en' else '共同原文')
 assert 'Public English' in row['search_values']
 assert 'HIDDEN_TOKEN' not in json.dumps(data)


def test_project_private_fields_and_role_aliases(fixture):
 c,r=fixture
 shown=source(r,'projects','project_role','负责人；成员',principal='SECRET_PI',members='SECRET_MEMBERS',amount='123.4')
 data=model(r,'projects','en')
 body=json.dumps(data)
 assert all(value not in body for value in ('SECRET_PI','SECRET_MEMBERS','123.4','"principal"','"members"','"amount"'))
 row=item(data,shown['uid'])
 assert row['display']['project_role']=='Lead / Participant'
 assert row['filter_tokens']['project_role']==['主持','参与']
 assert next(f for f in data['facets'] if f['field']=='project_role')['values']==['主持','参与']


def test_news_publish_gate_and_no_body(fixture):
 c,r=fixture
 shown=source(r,'news','category','Public',content='PRIVATE_HEAVY_BODY')
 source(r,'news','category','FUTURE_TOKEN',published_at='2099-01-01T00:00:00.000Z')
 data=model(r,'news')
 assert data['total']==1 and item(data,shown['uid'])
 assert all(value not in json.dumps(data) for value in ('PRIVATE_HEAVY_BODY','FUTURE_TOKEN','"content"'))
 assert next(f for f in data['facets'] if f['field']=='published_year')['values']==['2020']


def test_public_media_urls_and_private_attachment_gate(fixture):
 from test_media_management_step2 import register
 c,r=fixture
 active=register(r,status='active');private=register(r,status='active')
 teacher=source(r,'profiles','bio','Public',avatar_key=active['object_key'])
 paper=source(r,'publications','venue','Public')
 run(r.sql.batch([('UPDATE publications SET pdf_key=?,pdf_visibility=? WHERE uid=?',(private['object_key'],'owner',paper['uid']))]))
 data=model(r)
 assert item(data,teacher['uid'])['media']['avatar_url']=='/media/'+active['uid']
 assert active['object_key'] not in json.dumps(data)
 assert not item(model(r,'publications'),paper['uid'])['media']


def test_publicpage_remains_independent_of_model(fixture):
 c,r=fixture
 with patch('backend.app.native.public_read_model.build',side_effect=AssertionError('Read Model in HTML MISS')):
  assert c.get('/zh').status_code==200



def test_summary_trim_does_not_truncate_search_inputs(fixture):
 c,r=fixture
 bio='公开简介'*600+'SEARCH_END'
 shown=source(r,'profiles','bio',bio)
 row=item(model(r),shown['uid'])
 assert len(row['display']['bio'])==2001 and row['display']['bio'].endswith('…')
 assert bio in row['search_values'] and row['filter_values']['bio'].endswith('SEARCH_END')


def test_oversized_translation_is_not_exported(fixture):
 c,r=fixture
 shown=source(r,'profiles','title','共同原文');cache(r,'profiles',shown,'title','X'*5000)
 with pytest.raises(ModelUnavailable) as caught:model(r,'profiles','en')
 assert caught.value.reason=='translation_limit'


def test_too_many_group_rules_fail_closed(fixture):
 c,r=fixture
 run(r.sql.batch([("INSERT INTO student_category_displays(uid,key,label,keywords,enabled,display_order) VALUES(?,?,?,?,1,0)",(str(i),'rule103-'+str(i),'Rule'+str(i),'Word'+str(i))) for i in range(2)]))
 with pytest.raises(ModelUnavailable) as caught:model(r,'students',limits=ModelLimits(max_rules=1))
 assert caught.value.reason=='rule_limit'


def test_english_facet_keys_and_labels_match_existing_reader(fixture):
 c,r=fixture
 shown=source(r,'profiles','title','公开职称');cache(r,'profiles',shown,'title','Public Title')
 data=model(r,'profiles','en')
 facet=next(f for f in data['facets'] if f['field']=='title')
 old=run(people_facet(r.content,'profiles','title',lang='en'))
 assert facet['values']==old['values'] and facet['labels']==old['labels']


def test_d1_style_reader_without_sqlite_hash_function(fixture):
 c,r=fixture
 shown=source(r,'profiles','title','共同原文');cache(r,'profiles',shown,'title','D1 English')
 r.sql.supports_text_hash=False
 assert item(model(r,'profiles','en'),shown['uid'])['display']['title']=='D1 English'


@pytest.mark.parametrize('table',SUPPORTED)
def test_empty_models_are_complete(fixture,table):
 c,r=fixture
 data=model(r,table)
 assert data['complete'] is True and data['total']==0 and data['items']==[]
