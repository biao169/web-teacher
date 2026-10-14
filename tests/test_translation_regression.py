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


def test_public_batch_reads_only_local_winners_for_twelve_manual_rows_without_writes(fixture):
    from backend.app.native.translation_sources import overlay_many
    _,r=fixture
    rows=[]
    for i in range(12):
        original=source(r,'profiles','name','批量姓名'+str(i))
        cache(r,'profiles',original,'name','Person '+str(i),manual=1)
        rows.append({key:original[key] for key in ('uid','name','visibility')})
    queries=[];old=r.sql.query;before=run(old('SELECT count(*) n FROM translation_cache'))
    async def query(sql,args=()):queries.append((sql,len(args)));return await old(sql,args)
    r.sql.query=query
    try:returned=run(overlay_many(r.sql,'profiles',rows))
    finally:r.sql.query=old
    assert returned is rows and [row['name'] for row in rows]==['Person '+str(i) for i in range(12)]
    assert len(queries)==1 and all(count<=2 for _,count in queries)
    assert run(old('SELECT count(*) n FROM translation_cache'))==before


def test_public_batch_preserves_target_protection_and_visibility(fixture):
    from backend.app.native.translation_sources import overlay_many
    _,r=fixture;donor=source(r);cache(r,'profiles',donor,'title','Global',manual=1)
    rows=[];expected=[]
    for protection in ('native','manual','empty','stopped','explicit','hidden','automatic'):
        row=source(r,'profiles','name','共同原文')
        result='共同原文'
        if protection=='native':row['name_en']='Native';result='Native'
        elif protection=='manual':cache(r,'profiles',row,'name','Local',manual=1);result='Local'
        elif protection=='empty':cache(r,'profiles',row,'name','',manual=1)
        elif protection=='stopped':cache(r,'profiles',row,'name','Old',current=0,meta={'_inactive':True})
        elif protection=='explicit':cache(r,'profiles',row,'name','Explicit',meta={'_reuse':{'explicit':True}});result='Explicit'
        elif protection=='hidden':row['visibility']='hidden'
        # Conflicting manual versions Global/Local intentionally block a shared choice.
        rows.append(row);expected.append(result)
    run(overlay_many(r.sql,'profiles',rows));assert [row['name'] for row in rows]==expected


def test_public_batch_respects_original_per_row_local_hash_scope(fixture):
    """Another row's hash must not make a malformed newer local version suppress a valid one."""
    from backend.app.native.translation_sources import overlay_many
    _,r=fixture;a=source(r,'profiles','name','第一原文');b=source(r,'profiles','name','第二原文')
    cache(r,'profiles',a,'name','Valid local',manual=1)
    cache(r,'profiles',a,'name','Wrong newer local',manual=1,current=0,source_text=b['name'],meta={'_inactive':True})
    # Both hashes enter one batch, but the first row's old selector only allowed its own hash.
    rows=[{'uid':a['uid'],'name':a['name'],'visibility':'public'},{'uid':b['uid'],'name':b['name'],'visibility':'public'}]
    run(overlay_many(r.sql,'profiles',rows));assert rows[0]['name']=='Valid local' and rows[1]['name']=='第二原文'


def test_public_batch_keeps_plain_markdown_html_and_legacy_formats_separate(fixture):
    from backend.app.native.translation_sources import overlay_many
    _,r=fixture;rows=[]
    for fmt in ('plain','markdown','html'):
        row=source(r,'news','content','共同正文',content_format=fmt)
        cache(r,'news',row,'content','Translated '+fmt,manual=1)
        rows.append(row)
    run(overlay_many(r.sql,'news',rows))
    assert [row['content'] for row in rows]==['Translated '+fmt for fmt in ('plain','markdown','html')]
    legacy=source(r,'news','content','旧正文',content_format='plain');item=cache(r,'news',legacy,'content','Legacy')
    run(r.sql.batch([('UPDATE translation_cache SET source_refs=? WHERE uid=?',(json.dumps([{'table':'news','uid':legacy['uid'],'field':'content'}]),item['uid']))]))
    run(overlay_many(r.sql,'news',[legacy]));assert legacy['content']=='旧正文'


def test_public_batch_splits_field_and_byte_budget_without_dropping_large_field(fixture,monkeypatch):
    import backend.app.native.translation_sources as translations
    _,r=fixture;rows=[]
    for i in range(3):
        row=source(r,'profiles','name','姓名'+str(i));cache(r,'profiles',row,'name','Person '+str(i),manual=1)
        rows.append({'uid':row['uid'],'name':row['name'],'visibility':'public'})
    calls=[];old=r.sql.query
    async def query(sql,args=()):calls.append(sql);return await old(sql,args)
    r.sql.query=query
    monkeypatch.setattr(translations,'OVERLAY_BATCH_FIELDS',1)
    try:run(translations.overlay_many(r.sql,'profiles',rows))
    finally:r.sql.query=old
    assert len(calls)==3 and [row['name'] for row in rows]==['Person '+str(i) for i in range(3)]
    large=source(r,'profiles','bio','长简介'*300);cache(r,'profiles',large,'bio','Full biography',manual=1)
    monkeypatch.setattr(translations,'OVERLAY_BATCH_BYTES',32)
    run(translations.overlay_many(r.sql,'profiles',[large]));assert large['bio']=='Full biography'


def test_public_batch_hashes_full_biography_before_page_snippet_trim(fixture):
    client,r=fixture;rows=[]
    for i in range(2):
        row=source(r,'profiles','name','完整姓名'+str(i),bio='很长简介'*600)
        cache(r,'profiles',row,'bio','Biography after exact full-source match '+str(i),manual=1);rows.append(row)
    client.cookies.clear();html=client.get('/en/profiles').text
    assert all('Biography after exact full-source match '+str(i) in html for i in range(2))


def test_public_navigation_batch_reuses_winners_and_native_english(fixture):
    from backend.app.native.public_footer import navigation
    _,r=fixture;wanted={}
    for i in range(12):
        row=source(r,'navigation_items','title','批量导航'+str(i),title_en='Native navigation' if i==0 else '')
        cache(r,'navigation_items',row,'title','Navigation '+str(i),manual=1)
        wanted[row['uid']]='Native navigation' if i==0 else 'Navigation '+str(i)
    queries=[];old=r.sql.query
    async def query(sql,args=()):queries.append(sql);return await old(sql,args)
    r.sql.query=query
    try:links=run(navigation(r,'en'))
    finally:r.sql.query=old
    titles={item['uid']:item['title'] for items in links.values() for item in items}
    assert all(titles[uid]==title for uid,title in wanted.items())
    assert sum('translation_cache' in sql for sql in queries)==1

@pytest.mark.parametrize('protection',['manual','empty','failed','stopped','explicit'])
def test_local_terminal_translation_never_queries_donors(fixture,protection):
    from backend.app.native.translation_sources import overlay_many
    from probe_public_performance import SQLCounter
    _,r=fixture;row=source(r,'profiles','name','受保护姓名');options={};expected='受保护姓名'
    if protection=='manual':options={'manual':1};expected='Protected'
    elif protection=='empty':options={'manual':1};
    elif protection=='failed':options={'manual':1,'current':0,'status':'failed'}
    elif protection=='stopped':options={'current':0,'meta':{'_inactive':True}}
    else:options={'meta':{'_reuse':{'explicit':True}}};expected='Protected'
    cache(r,'profiles',row,'name','' if protection=='empty' else 'Protected',**options)
    display={'uid':row['uid'],'name':row['name'],'visibility':'public'}
    with SQLCounter(r.sql) as counted:run(overlay_many(r.sql,'profiles',[display]));report=counted.report()
    assert display['name']==expected and report['query_calls']==1 and report['batch_statements']==0


def test_mixed_translation_only_packs_fields_allowed_to_reuse(fixture):
    from backend.app.native.translation_sources import overlay_many
    _,r=fixture;row=source(r,'profiles','name','本地姓名',title='自动职称')
    cache(r,'profiles',row,'name','Local name',manual=1)
    donor=source(r,'profiles','title','自动职称');cache(r,'profiles',donor,'title','Shared title',manual=1)
    seen=[];old=r.sql.query
    async def query(sql,args=()):seen.append((sql,args));return await old(sql,args)
    r.sql.query=query
    display={'uid':row['uid'],'name':row['name'],'title':row['title'],'visibility':'public'}
    try:run(overlay_many(r.sql,'profiles',[display]))
    finally:r.sql.query=old
    assert display['name']=='Local name' and display['title']=='Shared title'
    assert len(seen)==2
    keys=json.loads(seen[1][1][-1]);assert len(keys)==1 and keys[0][1]=='自动职称'


def test_wrong_local_text_cannot_block_needed_shared_lookup(fixture):
    from backend.app.native.translation_sources import overlay_many
    from probe_public_performance import SQLCounter
    _,r=fixture;row=source(r,'profiles','name','正确原文')
    cache(r,'profiles',row,'name','Malformed manual',manual=1,source_text='错误原文')
    donor=source(r,'profiles','title','正确原文');cache(r,'profiles',donor,'title','Correct shared',manual=1)
    display={'uid':row['uid'],'name':row['name'],'visibility':'public'}
    with SQLCounter(r.sql) as counted:run(overlay_many(r.sql,'profiles',[display]));report=counted.report()
    assert display['name']=='Correct shared' and report['query_calls']==2
