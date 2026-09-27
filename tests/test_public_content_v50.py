"""Approved content projection/facets and anonymous attachment access."""
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,DOM
from backend.app.native.public_data import public_listing,public_media_map

def asset(r,uid):
    key=uid+'.pdf';body=b'%PDF-1.4\nSynthetic public attachment\n%%EOF'
    run(r.media_store.put(key,body))
    run(r.sql.batch([('INSERT INTO media_assets(uid,object_key,title,mime_type,size,status) VALUES (?,?,?,?,?,?)',(uid,key,uid,'application/pdf',len(body),'active'))]))
    return key

def test_paper_and_patent_fields_first_paint_without_full_citations(fixture):
    c,r=fixture
    paper=add(r,'publications','Paper',authors='Ada; Bob',corresponding_authors='Bob',volume='VOLUME50',issue='ISSUE50',pages='PAGES50',display_tags='TAG50',citation_apa='DETAIL_ONLY_CITATION')
    run(r.sql.batch([('UPDATE publications SET abstract=? WHERE uid=?',('NEVER_ABSTRACT',paper))]))
    html=c.get('/zh/publications').text
    for v in ['VOLUME50','ISSUE50','PAGES50','TAG50','data-corresponding="Bob"']:assert v in html
    assert 'DETAIL_ONLY_CITATION' not in html and 'NEVER_ABSTRACT' not in html
    add(r,'patents','Patent',country='CN',application_number='APP50',grant_number='GRANT50',application_date='2024-01-01',grant_date='2025-01-01')
    html=c.get('/zh/patents').text
    for v in ['CN','APP50','GRANT50','2024-01-01','2025-01-01']:assert v in html

@pytest.mark.parametrize('table,field,extra',[
 ('publications','venue',{}),('projects','fund_name',{}),('patents','legal_status',{}),('courses','audience',{}),('news','category',{})])
def test_full_public_facets_and_exact_filters(fixture,table,field,extra):
    c,r=fixture
    first=add(r,table,'ENTRY_A',**{field:'VALUE_A'},**extra)
    add(r,table,'ENTRY_B',**{field:'VALUE_B'},**extra)
    add(r,table,'PRIVATE_ENTRY',visibility='hidden',**{field:'PRIVATE_VALUE'},**extra)
    c.cookies.clear()
    result=c.get(f'/api/public/people/{table}/facets/{field}')
    assert result.status_code==200 and result.json()['values']==['VALUE_A','VALUE_B']
    html=c.get(f'/zh/{table}?f.{field}=VALUE_A').text
    assert 'ENTRY_A' in html and 'ENTRY_B' not in html and 'PRIVATE_VALUE' not in html
    assert f'<select name="f.{field}"' in html
    assert html.count(f'name="f.{field}"')==1
    assert '<option value="VALUE_B">' in html # Whole public scope, not filtered/current page.
    assert c.get(f'/zh/{table}/{first}').status_code==200

def test_year_options_are_strings_newest_first_and_paged(fixture):
    c,r=fixture
    for year in range(1950,2002):add(r,'publications',f'Paper{year}',year=year)
    first=c.get('/api/public/people/publications/facets/year').json()
    second=c.get('/api/public/people/publications/facets/year?page=2').json()
    assert first['values']==[str(y) for y in range(2001,1951,-1)] and first['has_more']
    assert second['values']==['1951','1950'] and not second['has_more']
    html=c.get('/zh/publications?f.year=1950').text
    assert '<option value="1950" selected>' in html and 'data-facet-more hidden' in html

def test_future_news_and_private_fields_never_contribute_options(fixture):
    c,r=fixture
    uid=add(r,'news','Future',category='FUTURE_ONLY')
    run(r.sql.batch([('UPDATE news SET published_at=? WHERE uid=?',('2099-01-01T00:00:00.000Z',uid))]))
    assert 'FUTURE_ONLY' not in str(c.get('/api/public/people/news/facets/category').json())
    assert c.get('/api/public/people/projects/facets/amount').status_code==404
    assert c.get('/api/public/people/publications/facets/source_citation').status_code==404
    assert c.get('/zh/projects?f.amount=100').status_code==422

def test_attachments_map_to_ids_and_follow_anonymous_visibility(fixture):
    c,r=fixture
    certificate=asset(r,'certificate50');syllabus=asset(r,'syllabus50');material=asset(r,'material50');hidden=asset(r,'hidden50');pdf=asset(r,'paper50')
    patent=add(r,'patents','Patent',certificate_key=certificate)
    course=add(r,'courses','Course',syllabus_key=syllabus,material_key=material,material_visibility='public')
    private_material=add(r,'courses','Course2',material_key=hidden,material_visibility='hidden')
    paper=add(r,'publications','Paper',pdf_key=pdf,pdf_visibility='public')
    c.cookies.clear()
    for table,uid,media_ids in [('patents',patent,['certificate50']),('courses',course,['syllabus50','material50']),('publications',paper,['paper50'])]:
        html=c.get(f'/zh/{table}/{uid}').text
        for media_uid in media_ids:
            assert f'href="/media/{media_uid}"' in html
            assert c.get('/media/'+media_uid).status_code==200
        assert certificate not in html and syllabus not in html and material not in html
    assert 'href="/media/hidden50"' not in c.get('/zh/courses/'+private_material).text
    assert c.get('/media/hidden50').status_code==404
    mapped=run(public_media_map(r,{'courses':[{'material_key':hidden,'material_visibility':'hidden'}]}))
    assert hidden not in mapped
    run(r.sql.batch([("UPDATE media_assets SET status='trash' WHERE uid='material50'",())]))
    assert 'href="/media/material50"' not in c.get('/zh/courses/'+course).text
    assert c.get('/media/material50').status_code==404

def test_private_pdfs_unreferenced_files_and_private_parent_are_not_public(fixture):
    c,r=fixture
    secret=asset(r,'privatepaper50');orphan=asset(r,'orphan50');hidden_parent=asset(r,'parent50')
    uid=add(r,'publications','Private PDF',pdf_key=secret,pdf_visibility='hidden')
    add(r,'patents','Private patent',certificate_key=hidden_parent,visibility='hidden')
    c.cookies.clear()
    assert '/media/privatepaper50' not in c.get('/zh/publications/'+uid).text
    for key in ['privatepaper50','orphan50','parent50']:assert c.get('/media/'+key).status_code==404

def test_projection_still_bounded_and_project_summary_remains_excluded(fixture):
    c,r=fixture
    for i in range(21):add(r,'projects',f'Project{i:02}',source='Public source',fund_name='Plan',summary='NEVER_SHOW_SUMMARY')
    first=run(public_listing(r,'projects',{'size':100}))
    assert len(first['rows'])==20 and first['size']==20 and all('summary' not in row for row in first['rows'])
    response=c.get('/zh/projects?f.source=Public source&size=20',headers={'X-Public-Fragment':'1'}).json()
    assert len(DOM(response['html']).find('article',**{'data-person-card':None}))==20
    import base64,json
    from urllib.parse import urlsplit,parse_qs
    token=parse_qs(urlsplit(response['next_url']).query)['s'][0]
    assert json.loads(base64.urlsafe_b64decode(token+'='*((-len(token))%4)))['f.source']=='Public source'
    assert 'NEVER_SHOW_SUMMARY' not in response['html']
