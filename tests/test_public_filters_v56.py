"""Configured order and public-scope facets, independent of management writes."""
from urllib.parse import urlencode
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,DOM
from backend.app.native.public_data import public_listing,PEOPLE_FACETS
from test_public_stream_v46 import ids,H

@pytest.mark.parametrize('table',['profiles','students','research_interests','publications','projects','patents','courses','news'])
def test_legacy_sort_normalizes_and_reverse_is_stable_across_batches(fixture,table):
    c,r=fixture;record_ids=[]
    for i in range(12):record_ids.append(add(r,table,f'Record {12-i:02}',sort_order=i//3,**({'is_active':1} if table=='profiles' else {})))
    for direction,expected in [('asc',record_ids),('desc',list(reversed(record_ids)))]:
        first=c.get('/zh/'+table+'?sort=created_at&direction='+direction,headers=H).json()
        following=c.get(first['next_url'],headers=H).json()
        assert ids(first['html'])+ids(following['html'])==expected
        assert 'sort='+('student_category' if table=='students' else 'sort_order') in first['next_url']
        assert 'created_at' not in first['next_url'] and first['size']==10
    html=c.get('/en/'+table).text;dom=DOM(html)
    assert not dom.find('select',name='sort') and not dom.find('select',name='size')
    assert len(dom.find('input',name='direction'))==2
    assert 'public-filters.js?v=0.15.56' in html

@pytest.mark.parametrize('table,field', [('publications','index_type'),('publications','publication_type'),('students','category'),('students','direction'),('courses','audience'),('projects','project_role')])
def test_multivalue_tokens_match_full_values_with_safe_special_characters(fixture,table,field):
    c,r=fixture
    target=add(r,table,'TOKEN_MATCH',**{field:'SCI; EI； A_%\nC++\rD\\Q; \tQuoted "value" '})
    add(r,table,'DO_NOT_MATCH',**{field:'ESCI;AC++;ABCDE'})
    add(r,table,'SECRET',visibility='hidden',**{field:'PRIVATE_OPTION'})
    result=c.get(f'/api/public/people/{table}/facets/{field}').json()
    assert 'PRIVATE_OPTION' not in result['values'] and 'SCI' in result['values'] and 'EI' in result['values']
    for value in ['SCI','sci','EI','A_%','C++','D\\Q','Quoted "value"']:
        response=c.get('/zh/'+table+'?'+urlencode({'f.'+field:value}),headers=H)
        assert response.status_code==200 and ids(response.json()['html'])==[target]
    # Administration still uses exact whole-field equality, never token matching.
    assert not run(r.content.listing(table,r.p,query={'f.'+field:'SCI'}))['rows']

def test_year_facets_use_public_business_dates_and_combine_with_other_filters(fixture):
    c,r=fixture
    def news(title,date,**values):
        uid=add(r,'news',title,**values)
        run(r.sql.batch([('UPDATE news SET published_at=? WHERE uid=?',(date,uid))]))
        return uid
    wanted=news('NEWS_2024','2024-02-03T09:00:00.000Z',category='Lab')
    news('NEWS_2025','2025-01-01T09:00:00.000Z',category='Other')
    news('FUTURE','2099-01-01T09:00:00.000Z',category='Future')
    news('PRIVATE','2000-01-01T09:00:00.000Z',visibility='hidden')
    assert c.get('/api/public/people/news/facets/published_year').json()['values']==['2025','2024']
    page=c.get('/zh/news?f.published_year=2024&f.category=Lab',headers=H).json();assert ids(page['html'])==[wanted]
    patent=add(r,'patents','PATENT',application_date='2020-05-01',grant_date='2023-04-01')
    add(r,'patents','UNDATED')
    for field,value in [('application_year','2020'),('grant_year','2023')]:
        assert c.get('/api/public/people/patents/facets/'+field).json()['values']==[value]
        assert ids(c.get('/zh/patents?f.'+field+'='+value,headers=H).json()['html'])==[patent]
    assert c.get('/zh/publications?f.grant_year=2023').status_code==422
    assert c.get('/api/public/people/news/facets/content').status_code==404

def test_whole_scope_paged_facets_keep_offpage_or_no_match_selection(fixture):
    c,r=fixture
    for i in range(53):add(r,'publications',str(i),index_type=f'Type{i:02};SHARED')
    first=c.get('/api/public/people/publications/facets/index_type').json()
    second=c.get('/api/public/people/publications/facets/index_type?page=2').json()
    assert len(first['values'])==50 and first['has_more'] and len(second['values'])==4 and not second['has_more']
    html=c.get('/zh/publications?f.index_type=Type52&q=NO_MATCH').text
    assert '<option value="Type52" selected>' in html and '<option value="Type00">' in html
    assert 'data-facet-more hidden' in html and '暂无公开内容' in html
    assert c.get('/api/public/people/publications/facets/index_type?page=0').status_code==200

def test_filters_remain_original_values_in_english_and_unapproved_fields_are_blocked(fixture):
    c,r=fixture;add(r,'publications','Paper',publication_type='期刊；会议',index_type='SCI')
    html=c.get('/en/publications?f.publication_type=%E6%9C%9F%E5%88%8A').text
    assert 'Paper type' in html and '<option value="期刊" selected>' in html
    assert 'data-facet-label="Paper type"' in html
    assert c.get('/zh/students?f.email=x').status_code==422
    assert c.get('/zh/publications?f.source_citation=x').status_code==422
    assert c.get('/zh/projects?f.amount=100').status_code==422
    assert c.get('/zh/research_interests').text.count('data-person-facet')==0
