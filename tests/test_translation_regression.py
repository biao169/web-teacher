"""Exact grouping and shared read regression; no provider or user data access."""
import asyncio
import copy
import hashlib
import json
import uuid
import pytest
from list_fixture import client_at
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from backend.app.native.catalog import defaults,fields,TITLE,Error
from backend.app.native.translation_sources import overlay,reference,source_format
from backend.app.native.translation_groups import TranslationGroups
from backend.app.native.translation_reuse import TranslationReuse

def run(value):return asyncio.run(value)

@pytest.fixture
def fixture(tmp_path):
    client,r=client_at(tmp_path)
    r.auth=Auth(r.sql,r.passwords);r.content=Content(r.sql,r.auth)
    r.p=run(r.auth.principal(client.cookies.get('ts_session')))
    yield client,r
    client.close()

def source(r,table='profiles',field='title',text='共同原文',**extra):
    values={key:value for key,value in defaults(table).items() if key in fields(table) and value is not None}
    values.update({TITLE[table]:'测试来源','is_active':1,'visibility':'public',field:text})
    if table=='news':values.update(slug=uuid.uuid4().hex,published_at='2020-01-01T00:00:00.000Z')
    if table=='navigation_items':values.update(path='/zh',url_name=uuid.uuid4().hex,enabled=1)
    values.update(extra)
    values={key:value for key,value in values.items() if key in fields(table)}
    uid=run(r.content.save(table,r.p,values))
    return run(r.content.get(table,uid,r.p))

def cache(r,table,row,field,text='Shared translation',manual=0,current=1,status='success',meta=None,lang='en',hash_value=None,source_text=None):
    uid=uuid.uuid4().hex;original=row[field] if source_text is None else source_text
    refs={'table':table,'uid':row['uid'],'field':field,'_format':source_format(table,row,field)}
    if meta:refs.update(meta)
    run(r.sql.batch([('INSERT INTO translation_cache(uid,source_hash,source_ref_key,source_text,source_lang,target_lang,translated_text,provider,status,is_manual,is_current,source_refs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        (uid,hash_value or hashlib.sha256(original.encode()).hexdigest(),reference(table,row['uid'],field),original,'zh',lang,text,'manual' if manual else 'test',status,manual,current,json.dumps([refs])))]))
    return run(r.content.get('translation_cache',uid,r.p))

def translated(r,table,row,field):return run(overlay(r.sql,table,dict(row)))[field]

def test_manual_candidate_matches_list_reuse_and_public(fixture):
    client,r=fixture
    a=source(r);b=source(r);c=source(r,'courses','name')
    manual=cache(r,'profiles',a,'title','A curated translation',manual=1)
    cache(r,'profiles',b,'title','Z machine translation')
    pending=cache(r,'courses',c,'name',None,current=0,status='pending')
    listing=run(TranslationGroups(r).listing())
    assert listing['total']==1
    assert listing['rows'][0]['translated_text']=='A curated translation'
    assert listing['rows'][0]['provider']=='manual'
    assert run(TranslationReuse(r).donor(pending))['uid']==manual['uid']
    assert translated(r,'courses',c,'name')=='A curated translation'
    assert run(r.content.get('translation_cache',pending['uid'],r.p))==pending
    page=client.get('/admin/translation_cache')
    assert page.status_code==200 and 'A curated translation' in page.text
    fragment=client.get('/admin/translation_cache',headers={'X-Native-List':'1'})
    assert fragment.status_code==200 and 'A curated translation' in fragment.json()['html']
    assert client.get(listing['rows'][0]['group_url']).status_code==200
    assert 'A curated translation' in client.get('/en/courses/'+c['uid']).text
    assert '共同原文' in client.get('/zh/courses/'+c['uid']).text

def test_source_without_cache_shares_without_database_writes(fixture):
    _,r=fixture;a=source(r);b=source(r,'courses','name')
    cache(r,'profiles',a,'title')
    before=run(r.sql.query('SELECT * FROM translation_cache ORDER BY id'))
    assert translated(r,'courses',b,'name')=='Shared translation'
    assert run(r.sql.query('SELECT * FROM translation_cache ORDER BY id'))==before

def test_manual_conflict_keeps_local_versions_and_blocks_global_choice(fixture):
    _,r=fixture;a=source(r);b=source(r);c=source(r,'courses','name')
    cache(r,'profiles',a,'title','First',manual=1);cache(r,'profiles',b,'title','Second',manual=1)
    pending=cache(r,'courses',c,'name',None,current=0,status='pending')
    group=run(TranslationGroups(r).listing())['rows'][0]
    assert group['manual_versions']==2 and group['translated_text'] is None
    assert translated(r,'profiles',a,'title')=='First'
    assert translated(r,'profiles',b,'title')=='Second'
    assert translated(r,'courses',c,'name')=='共同原文'
    with pytest.raises(Error) as error:run(TranslationReuse(r).donor(pending))
    assert error.value.code=='translation_conflict'

@pytest.mark.parametrize('reason',['hidden','inactive_source','changed','stopped','history','failed','empty','wrong_hash','wrong_language'])
def test_unusable_donor_is_not_shared_or_representative(fixture,reason):
    _,r=fixture;a=source(r);b=source(r,'courses','name')
    options={}
    if reason=='stopped':options['meta']={'_inactive':True}
    if reason=='history':options['current']=0
    if reason=='failed':options['status']='failed'
    if reason=='empty':options['text']=''
    if reason=='wrong_hash':options['hash_value']='0'*64
    if reason=='wrong_language':options['lang']='fr'
    cache(r,'profiles',a,'title',**options)
    if reason=='hidden':run(r.sql.batch([("UPDATE profiles SET visibility='hidden' WHERE uid=?",(a['uid'],))]))
    if reason=='inactive_source':run(r.sql.batch([('UPDATE profiles SET is_active=0 WHERE uid=?',(a['uid'],))]))
    if reason=='changed':run(r.sql.batch([("UPDATE profiles SET title='已变化' WHERE uid=?",(a['uid'],))]))
    assert translated(r,'courses',b,'name')=='共同原文'
    if reason not in ('wrong_hash','wrong_language'):
        assert all(group['translated_text'] is None for group in run(TranslationGroups(r).listing())['rows'])

@pytest.mark.parametrize('protection',['native_english','manual_cache','empty_manual','stopped','explicit'])
def test_target_protection(fixture,protection):
    _,r=fixture;a=source(r);b=source(r,field='name',text='共同原文')
    cache(r,'profiles',a,'title','Global',manual=1)
    expected='Own'
    if protection=='native_english':b['name_en']='Own'
    elif protection=='manual_cache':cache(r,'profiles',b,'name','Own',manual=1)
    elif protection=='empty_manual':
        cache(r,'profiles',b,'name',None,manual=1,current=0,status='pending');expected='共同原文'
    elif protection=='stopped':
        cache(r,'profiles',b,'name','Old',current=0,meta={'_inactive':True});expected='共同原文'
    else:cache(r,'profiles',b,'name','Own',meta={'_reuse':{'explicit':True}})
    assert translated(r,'profiles',b,'name')==expected

def test_format_isolation_and_legacy_body_refusal(fixture):
    _,r=fixture;a=source(r,'news','content','共同原文',content_format='html')
    b=source(r,'news','content','共同原文',content_format='plain')
    cache(r,'news',a,'content','HTML translation')
    assert translated(r,'news',b,'content')=='共同原文'
    c=source(r,'news','content','另一原文',content_format='html')
    cache(r,'news',c,'content','Unreviewed',meta={'_format':'unknown'})
    assert translated(r,'news',c,'content')=='另一原文'

def test_native_manual_english_source_is_not_a_shared_donor(fixture):
    _,r=fixture;a=source(r,field='name',text='共同原文',name_en='Native English');b=source(r,'courses','name')
    cache(r,'profiles',a,'name','Stale cache')
    assert translated(r,'courses',b,'name')=='共同原文'
    assert translated(r,'profiles',a,'name')=='Native English'

def test_scoped_list_does_not_leak_other_source_classes(fixture):
    _,r=fixture;a=source(r);b=source(r,'courses','name')
    cache(r,'profiles',a,'title','Private to this filter',manual=1)
    cache(r,'courses',b,'name',None,current=0,status='pending')
    result=run(TranslationGroups(r,{'source.courses':'1'}).listing())
    assert result['total']==1 and result['rows'][0]['records']==1
    assert result['rows'][0]['translated_text'] is None
    limited=copy.copy(r);limited.p=copy.deepcopy(r.p)
    limited.p['is_system']=False;limited.p['permissions']['profiles']['can_view']=False
    assert run(TranslationGroups(limited).listing())['rows'][0]['translated_text'] is None

def test_source_and_history_counts_before_pagination_and_export(fixture):
    _,r=fixture
    for i in range(12):
        a=source(r,text='分组'+str(i));cache(r,'profiles',a,'title','Version'+str(i))
        cache(r,'profiles',a,'title','Old'+str(i),current=0)
    group=TranslationGroups(r,{'size':'10','page':'2','sort':'source_text','direction':'asc'})
    result=run(group.listing())
    assert result['total']==12 and result['pages']==2 and len(result['rows'])==2
    assert all(row['records']==2 and row['sources']==1 for row in result['rows'])
    member=run(group.members(result['rows'][0]['uid']))
    assert member['total']==2
    exported=json.loads(run(group.export()))
    assert len(exported['groups'])==12
    assert sum(len(item['sources']) for item in exported['groups'])==24

def test_explicit_selection_still_uses_existing_guarded_write(fixture):
    _,r=fixture;a=source(r);b=source(r);c=source(r,'courses','name')
    donor=cache(r,'profiles',a,'title','Chosen',manual=1)
    cache(r,'profiles',b,'title','Other',manual=1)
    target=cache(r,'courses',c,'name',None,current=0,status='pending')
    group=TranslationGroups(r)
    run(group.choose(target['uid'],donor['uid'],donor['updated_at'],target['uid'],target['updated_at']))
    assert translated(r,'courses',c,'name')=='Chosen'
    with pytest.raises(Error):run(group.choose(target['uid'],donor['uid'],donor['updated_at'],target['uid'],target['updated_at']))

def test_public_navigation_projection_has_public_gates(fixture):
    client,r=fixture;a=source(r,field='title',text='导航中文')
    nav=source(r,'navigation_items','title','导航中文',location='header')
    cache(r,'profiles',a,'title','Shared navigation')
    assert 'Shared navigation' in client.get('/en').text

def test_sort_uses_selected_translation_not_lexical_max_of_all_versions(fixture):
    _,r=fixture;a=source(r,text='甲');b=source(r,text='甲');c=source(r,text='乙')
    cache(r,'profiles',a,'title','A manual',manual=1)
    cache(r,'profiles',b,'title','Z automatic')
    cache(r,'profiles',c,'title','M other')
    for direction,expected in [('asc',['A manual','M other']),('desc',['M other','A manual'])]:
        rows=run(TranslationGroups(r,{'sort':'translated_text','direction':direction}).listing())['rows']
        assert [item['translated_text'] for item in rows]==expected

def test_over_one_hundred_history_rows_stay_one_complete_group(fixture):
    _,r=fixture;a=source(r);cache(r,'profiles',a,'title','Current',manual=1)
    for i in range(105):cache(r,'profiles',a,'title','History '+str(i),current=0)
    group=TranslationGroups(r,{'size':'10'})
    listing=run(group.listing())
    assert listing['total']==1 and listing['rows'][0]['records']==106
    assert listing['rows'][0]['translated_text']=='Current'
    assert len(json.loads(run(group.export()))['groups'][0]['sources'])==106

def test_shared_donor_change_is_seen_without_rewriting_target(fixture):
    _,r=fixture;a=source(r);b=source(r,'courses','name')
    donor=cache(r,'profiles',a,'title','Before',manual=1)
    pending=cache(r,'courses',b,'name',None,current=0,status='pending')
    assert translated(r,'courses',b,'name')=='Before'
    run(r.content.save('translation_cache',r.p,{'translated_text':'After'},donor['uid'],donor['updated_at']))
    assert translated(r,'courses',b,'name')=='After'
    assert run(r.content.get('translation_cache',pending['uid'],r.p))==pending

@pytest.mark.parametrize('condition',['unpublished','disabled_navigation','hidden_target'])
def test_publication_and_target_gates(fixture,condition):
    _,r=fixture;b=source(r,'courses','name')
    if condition=='unpublished':
        a=source(r,'news','title','共同原文',published_at='2099-01-01T00:00:00.000Z');cache(r,'news',a,'title')
    elif condition=='disabled_navigation':
        a=source(r,'navigation_items','title','共同原文',location='header',enabled=0);cache(r,'navigation_items',a,'title')
    else:
        a=source(r);cache(r,'profiles',a,'title');b['visibility']='hidden'
    assert translated(r,'courses',b,'name')=='共同原文'
