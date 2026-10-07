"""Cached bilingual predicates execute before pagination; translated facets keep raw keys."""
import pytest
from test_translation_regression import fixture,source,cache,run,translated
from test_public_stream_v46 import H,ids
from test_public_home_step2 import DOM
from test_public_navigation_v88 import entry

def listing(c,table,q,lang='en',path=None,**filters):
    response=c.get(path or '/'+lang+'/'+table,params={'q':q,**filters},headers=H)
    assert response.status_code==200,response.text
    return response.json()

@pytest.mark.parametrize('table,field',[('profiles','title'),('students','direction'),('research_interests','description'),('projects','fund_name'),('publications','venue'),('patents','owner'),('courses','audience'),('news','category')])
def test_cached_english_and_original_are_searchable_in_both_languages(fixture,table,field):
    c,r=fixture;row=source(r,table,field,'人工智能研究');cache(r,table,row,field,'Artificial Intelligence Research')
    for lang in ('zh','en'):
        assert row['uid'] in ids(listing(c,table,'intelligence',lang)['html'])
        assert row['uid'] in ids(listing(c,table,'人工智能',lang)['html'])
    assert listing(c,table,"%' OR 1=1 --")['total']==0

@pytest.mark.parametrize('reason',['hidden','inactive_source','changed','stopped','history','failed','empty','wrong_hash','wrong_language','wrong_format','private_donor'])
def test_unusable_cache_does_not_create_search_hits(fixture,reason):
    c,r=fixture;donor=source(r);target=source(r,'courses','name');options={'text':'InvisibleToken'}
    if reason=='stopped':options['meta']={'_inactive':True}
    if reason=='history':options['current']=0
    if reason=='failed':options['status']='failed'
    if reason=='empty':options['text']=''
    if reason=='wrong_hash':options['hash_value']='0'*64
    if reason=='wrong_language':options['lang']='fr'
    if reason=='wrong_format':options['meta']={'_format':'html'}
    if reason=='private_donor':donor=source(r,'projects','principal');cache(r,'projects',donor,'principal',**options)
    else:cache(r,'profiles',donor,'title',**options)
    if reason=='hidden':run(r.sql.batch([("UPDATE profiles SET visibility='hidden' WHERE uid=?",(donor['uid'],))]))
    if reason=='inactive_source':run(r.sql.batch([('UPDATE profiles SET is_active=0 WHERE uid=?',(donor['uid'],))]))
    if reason=='changed':run(r.sql.batch([("UPDATE profiles SET title='新原文' WHERE uid=?",(donor['uid'],))]))
    assert listing(c,'courses','InvisibleToken')['total']==0
    assert 'InvisibleToken' not in c.get('/en/courses/'+target['uid']).text

@pytest.mark.parametrize('protection',['native','manual','pending_manual','stopped','explicit'])
def test_effective_local_protection_matches_rendered_winner(fixture,protection):
    c,r=fixture;donor=source(r);cache(r,'profiles',donor,'title','GlobalToken',manual=1)
    row=source(r,'profiles','name');expected=None
    if protection=='native':run(r.sql.batch([('UPDATE profiles SET name_en=? WHERE uid=?',('NativeToken',row['uid']))]));expected='NativeToken'
    elif protection=='manual':cache(r,'profiles',row,'name','LocalToken',manual=1);expected='LocalToken'
    elif protection=='pending_manual':cache(r,'profiles',row,'name',None,manual=1,current=0,status='pending')
    elif protection=='stopped':cache(r,'profiles',row,'name','StoppedToken',current=0,meta={'_inactive':True})
    else:cache(r,'profiles',row,'name','ExplicitToken',meta={'_reuse':{'explicit':True}});expected='ExplicitToken'
    assert row['uid'] not in ids(listing(c,'profiles','GlobalToken')['html'])
    if expected:assert row['uid'] in ids(listing(c,'profiles',expected)['html'])

def test_manual_conflict_preserves_own_winners_without_global_guess(fixture):
    c,r=fixture;a=source(r);b=source(r);target=source(r,'courses','name')
    cache(r,'profiles',a,'title','FirstToken',manual=1);cache(r,'profiles',b,'title','SecondToken',manual=1)
    assert listing(c,'courses','FirstToken')['total']==0
    assert ids(listing(c,'profiles','FirstToken')['html'])==[a['uid']]
    assert ids(listing(c,'profiles','SecondToken')['html'])==[b['uid']]

def test_shared_matches_count_and_paginate_inside_fixed_scope_without_writes(fixture):
    c,r=fixture;donor=source(r);cache(r,'profiles',donor,'title','CrossLanguageToken')
    wanted=[source(r,'courses','name')['uid'] for _ in range(23)]
    source(r,'courses','name','共同原文',visibility='hidden')
    entry(r,'courses','name','共同',slug='bilingual')
    before=run(r.sql.query('SELECT * FROM translation_cache ORDER BY id'))
    first=listing(c,'courses','crosslanguagetoken',path='/en/n/bilingual');assert first['total']==23 and len(ids(first['html']))==10
    second=c.get(first['next_url'],headers=H).json();third=c.get(second['next_url'],headers=H).json()
    assert set(ids(first['html'])+ids(second['html'])+ids(third['html']))==set(wanted)
    assert not third['next_url'] and 's=' in first['next_url'] and first['next_url'].isascii()
    assert listing(c,'courses','crosslanguagetoken',path='/en/n/bilingual',**{'f.name':'无关'})['total']==0
    assert run(r.sql.query('SELECT * FROM translation_cache ORDER BY id'))==before
    run(r.sql.batch([("UPDATE profiles SET title='已更改' WHERE uid=?",(donor['uid'],))]))
    assert listing(c,'courses','CrossLanguageToken')['total']==0

def test_private_fields_and_future_news_are_not_searchable(fixture):
    c,r=fixture;p=source(r,'projects','principal','私密负责人');cache(r,'projects',p,'principal','PrivateToken')
    assert listing(c,'projects','PrivateToken')['total']==0
    n=source(r,'news','title','尚未发布',published_at='2099-01-01T00:00:00.000Z');cache(r,'news',n,'title','FutureToken')
    assert listing(c,'news','FutureToken')['total']==0

def test_literal_wildcards_and_case_are_preserved(fixture):
    c,r=fixture;row=source(r,'courses','name');cache(r,'courses',row,'name',r'Alpha 10% _literal_ C:\Data')
    for term in ('ALPHA','10%',r'C:\Data','_literal_'):assert listing(c,'courses',term)['total']==1
    assert listing(c,'courses','10_')['total']==0

def test_facets_translate_labels_keep_raw_values_and_fallback(fixture):
    c,r=fixture;row=source(r,'projects','source','国家基金');cache(r,'projects',row,'source','National Foundation')
    other=source(r,'projects','source','省级项目')
    page=c.get('/en/projects');assert page.status_code==200
    assert '<option value="国家基金">National Foundation</option>' in page.text
    assert '<option value="省级项目">省级项目</option>' in page.text
    zh=c.get('/zh/projects').text;assert '<option value="国家基金">国家基金</option>' in zh
    response=c.get('/api/public/people/projects/facets/source?lang=en').json()
    assert response['labels']['国家基金']=='National Foundation' and '国家基金' in response['values']
    assert ids(listing(c,'projects','',**{'f.source':'国家基金'})['html'])==[row['uid']]
    assert c.get('/api/public/people/projects/facets/source?lang=fr').status_code==422

def test_facet_ambiguous_manual_labels_fall_back_instead_of_merging_values(fixture):
    c,r=fixture;a=source(r,'projects','source','共同基金');b=source(r,'projects','source','共同基金')
    cache(r,'projects',a,'source','One',manual=1);cache(r,'projects',b,'source','Two',manual=1)
    assert '共同基金' not in c.get('/api/public/people/projects/facets/source?lang=en').json()['labels']
    x=source(r,'projects','source','甲基金');y=source(r,'projects','source','乙基金')
    cache(r,'projects',x,'source','Same label');cache(r,'projects',y,'source','Same label')
    result=c.get('/api/public/people/projects/facets/source?lang=en').json()
    assert result['labels']['甲基金']==result['labels']['乙基金']=='Same label'
    assert '甲基金' in result['values'] and '乙基金' in result['values']

def test_multivalue_facets_use_exact_term_cache_without_splitting_translations(fixture):
    c,r=fixture;a=source(r,'students','direction','人工智能;机器人');cache(r,'students',a,'direction','AI and Robotics')
    assert c.get('/api/public/people/students/facets/direction?lang=en').json()['labels']=={}
    donor=source(r,'courses','name','人工智能');cache(r,'courses',donor,'name','Artificial Intelligence')
    labels=c.get('/api/public/people/students/facets/direction?lang=en').json()['labels']
    assert labels=={'人工智能':'Artificial Intelligence'}

def test_facet_next_page_and_selected_value_translate_in_fixed_scope(fixture):
    c,r=fixture
    for i in range(52):source(r,'projects','source',f'基金{i:02}',name='限定项目')
    last=run(r.sql.query("SELECT * FROM projects WHERE source='基金51'"))[0];cache(r,'projects',last,'source','Last Foundation')
    source(r,'projects','source','范围外',name='其它项目');entry(r,'projects','name','限定',slug='funds')
    result=c.get('/api/public/people/projects/facets/source?lang=en&page=2&nav=funds').json()
    assert result['values']==['基金50','基金51'] and result['labels']['基金51']=='Last Foundation'
    html=c.get('/en/n/funds',params={'f.source':'基金51'}).text
    assert '<option value="基金51" selected>Last Foundation</option>' in html and '范围外' not in html

def test_shared_manual_overrides_machine_and_updates_search_immediately(fixture):
    c,r=fixture;a=source(r,'courses','name');b=source(r)
    cache(r,'courses',a,'name','MachineToken');cache(r,'profiles',b,'title','ReviewedToken',manual=1)
    assert listing(c,'courses','MachineToken')['total']==0
    assert listing(c,'courses','ReviewedToken')['total']==1
    run(r.sql.batch([("UPDATE translation_cache SET translated_text='UpdatedToken' WHERE source_ref_key=?",('profiles:'+b['uid']+':title',))]))
    assert listing(c,'courses','ReviewedToken')['total']==0
    assert listing(c,'courses','UpdatedToken')['total']==1

def test_stopped_facet_and_html_label_are_safe(fixture):
    c,r=fixture;a=source(r,'projects','source','基金甲');b=source(r,'courses','name','基金甲')
    cache(r,'courses',b,'name','SharedLabel');cache(r,'projects',a,'source','StoppedLabel',current=0,meta={'_inactive':True})
    assert '基金甲' not in c.get('/api/public/people/projects/facets/source?lang=en').json()['labels']
    x=source(r,'projects','source','基金乙');cache(r,'projects',x,'source','<script>literal</script>')
    html=c.get('/en/projects').text
    assert '&lt;script&gt;literal&lt;/script&gt;' in html and '<script>literal</script>' not in html
