"""Six public content modules share controls and enforce existing public readers."""
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,DOM

@pytest.mark.parametrize('table',['publications','projects','patents','news','courses','research_interests'])
def test_all_content_lists_details_fragments_and_no_script_controls(fixture,table):
    c,r=fixture
    for i in range(12):add(r,table,'Content'+str(i),sort_order=i)
    first=c.get('/en/'+table+'?sort=sort_order&direction=asc');assert first.status_code==200
    dom=DOM(first.text);assert len(dom.find('article',**{'data-person-card':None}))==10
    assert dom.find('form',**{'data-person-form':None,'method':'get'})
    assert 'aria-label="Number">12</span>' in first.text
    assert 'data-person-select hidden' in first.text
    response=c.get('/en/'+table+'?page=2&sort=sort_order&direction=asc',headers={'X-Public-Fragment':'1'})
    assert response.status_code==200 and 'aria-label="Number">2</span>' in response.json()['html']
    uid=dom.find('article',**{'data-person-card':None})[0]['data-record-id']
    detail=c.get('/en/'+table+'/'+uid);assert detail.status_code==200 and len(DOM(detail.text).find('h1'))==1
    if table in ('courses','news'):assert 'data-person-copy-detail hidden' in detail.text
    else:
        assert detail.history[0].status_code==303
        assert 'data-person-detail' not in detail.text and f'id="record-{uid}"' in detail.text

def test_project_card_prioritizes_source_and_program_includes_amount_excludes_summary(fixture):
    c,r=fixture;uid=add(r,'projects','PROJECT',source='SOURCE',fund_name='PLAN',principal='PRINCIPAL',project_role='LEAD',members='MEMBERS',summary='NEVER_PROJECT_SUMMARY',amount='123456.00')
    for path in ['/zh/projects','/zh/projects/'+uid]:
        html=c.get(path).text
        assert 'SOURCE' in html and 'PLAN' in html
        assert html.index('SOURCE')<html.index('PRINCIPAL')
        assert 'NEVER_PROJECT_SUMMARY' not in html and '123456 万元' in html
    assert 'MEMBERS' in c.get('/zh/projects/'+uid).text

def test_paper_details_citations_escaped_authors_and_safe_links(fixture):
    c,r=fixture;uid=add(r,'publications','PAPER',authors='Ada;Bob',corresponding_authors='Bob',venue='Venue',year=2025,volume='8',issue='2',pages='12–20',citation_apa='APA <script>literal</script>',bibtex='@article{example}',display_tags='TAG_ONLY',doi='10.1000/example')
    run(r.sql.batch([("UPDATE site_settings SET publication_citation_style='apa'",())]))
    html=c.get('/zh/publications/'+uid).text
    assert 'data-corresponding="Bob"' in html and 'data-citation-format="citation_apa"' in html
    assert 'APA &lt;script&gt;literal&lt;/script&gt;' in html and '<script>literal</script>' not in html
    for v in ['TAG_ONLY','https://doi.org/10.1000/example']:assert v in html
    assert '@article{example}' not in html
    assert 'class="content-tags"' in html
    assert c.get('/assets/admin/js/native-corresponding-authors.js').status_code==200
    assert c.get('/assets/admin/js/publication-tools.mjs').status_code==200

def test_news_new_tab_centered_cover_richtext_and_publication_scope(fixture):
    c,r=fixture
    run(r.sql.batch([("INSERT INTO media_assets(uid,object_key,title,mime_type,size,status) VALUES (?,?,?,?,?,?)",('cover49','cover49.jpg','Cover','image/jpeg',12,'active'))]))
    uid=add(r,'news','NEWS49',cover_key='cover49.jpg',content='<p>First paragraph</p><p><strong>Second paragraph</strong></p>',content_format='html',category='Updates')
    html=c.get('/zh/news').text
    from urllib.parse import urlsplit,parse_qs
    links=[a for a in DOM(html).find('a') if urlsplit(a.get('href','')).path=='/zh/news/'+uid]
    assert all(parse_qs(urlsplit(a['href']).query).get('from')==['/zh/news'] for a in links)
    assert len(links)==2 and all(a.get('target')=='_blank' for a in links)
    assert DOM(html).find('img',src='/media/cover49') and 'content-cover' in html
    detail=c.get('/zh/news/'+uid).text
    assert '<strong>Second paragraph</strong>' in detail and 'data-copy-rich' in detail
    private=add(r,'news','Hidden49',visibility='hidden')
    assert 'Hidden49' not in c.get('/zh/news').text and c.get('/zh/news/'+private).status_code==404

def test_patent_course_research_details_show_full_public_fields(fixture):
    c,r=fixture
    cases=[('patents',dict(country='CN',application_number='APP123',grant_number='GRANT456',owner='OWNER',summary='PATENT_BODY'),['CN','APP123','GRANT456','OWNER','PATENT_BODY']),('courses',dict(semester='2025',audience='Graduate',summary='COURSE_BODY',references_text='REFERENCE'),['COURSE_BODY','REFERENCE','Graduate']),('research_interests',dict(name_en='English topic',description='TOPIC_BODY'),['English topic','TOPIC_BODY'])]
    for table,values,expected in cases:
        uid=add(r,table,'ENTRY',**values);response=c.get('/en/'+table+'/'+uid)
        assert response.status_code==200
        for word in expected:assert word in response.text

def test_existing_filters_submit_with_approved_content_facets(fixture):
    c,r=fixture;add(r,'publications','Recent',year=2025,publication_type='Journal');add(r,'publications','Old',year=2020)
    html=c.get('/zh/publications?f.year=2025&f.publication_type=Journal').text
    assert 'Recent' in html and '>Old<' not in html
    assert '<select name="f.year"' in html and '<option value="2025" selected>' in html
    assert 'data-copy-format' in html and 'data-citation-text' in html
    assert c.get('/zh/projects?f.source=Unapproved').status_code==200


def test_home_chunk_fallback_still_renders_without_list_query_controls(fixture):
    c,r=fixture
    for table in ['publications','projects','news']:
        add(r,table,'Featured',is_featured=1)
        response=c.get('/zh/'+table+'?home=1&page=2')
        assert response.status_code==200
        assert 'Featured' in response.text and 'data-person-form' not in response.text
