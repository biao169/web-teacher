"""Project public formatting/filtering and patent grouping use real HTTP/SQLite."""
import pytest
from backend.app.domain.public_projects import project_amount,project_role,project_period
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,configure,DOM
from test_public_cards_v55 import article

@pytest.mark.parametrize('value,zh,en', [('12.5000','12.5 万元','CNY 125,000'),('0','0 万元','CNY 0'),('0.0001','0.0001 万元','CNY 1'),('999999999999999999.9999','999999999999999999.9999 万元','CNY 9,999,999,999,999,999,999,999'),(None,'',''),('NaN','','')])
def test_exact_decimal_unit_format(value,zh,en):
    assert project_amount(value)==zh and project_amount(value,'en')==en

def test_role_aliases_facets_legacy_links_and_english_labels(fixture):
    c,r=fixture
    for i,role in enumerate(['主持','负责人','PI','lead','参与','成员','participant','顾问']):add(r,'projects',f'ROLE_{i}',project_role=role)
    add(r,'projects','HIDDEN_ROLE',project_role='PRIVATE_ROLE',visibility='hidden')
    facet=c.get('/api/public/people/projects/facets/project_role').json()
    assert set(facet['values'])=={'主持','参与','顾问'}
    for query,count in [('主持',4),('负责人',4),('PI',4),('参与',3),('member',3),('顾问',1)]:
        page=c.get('/zh/projects',params={'f.project_role':query},headers={'X-Public-Fragment':'1'}).json()
        assert page['total']==count
    page=c.get('/en/projects').text
    assert '>Lead</option>' in page and '>Participant</option>' in page and 'PRIVATE_ROLE' not in page
    assert project_role('Co-PI','en')=='Co-PI'
    dual=add(r,'projects','DUAL_ROLE',project_role='负责人；成员')
    for value,total in [('主持',5),('参与',4),('负责人；成员',1)]:
        result=c.get('/zh/projects',params={'f.project_role':value},headers={'X-Public-Fragment':'1'}).json()
        assert result['total']==total and dual in result['html']
    assert project_role('负责人；成员','en')=='Lead / Participant'

def test_project_home_list_fragment_order_amount_and_public_policy(fixture):
    c,r=fixture;configure(r,homepage_project_limit=12)
    for i in range(11):uid=add(r,'projects','PROJECT_TITLE',source='SOURCE_TEXT',fund_name='FUND_TEXT',project_number='NUMBER_TEXT',project_role='负责人',start_date='2025-01-01',end_date='2027-12-31',status='ACTIVE_TEXT',principal='PRIVATE_PI',members='PRIVATE_MEMBERS',amount='12.5000',summary='NEVER_SUMMARY',is_featured=1,sort_order=i)
    for lang,amount,role in [('zh','12.5 万元','主持'),('en','CNY 125,000','Lead')]:
        for path,fragment in [(f'/{lang}/projects?home=1&page=1',True),(f'/{lang}/projects',False),(f'/{lang}/projects?page=2',True),(f'/{lang}/projects?home=1&page=2',True)]:
            res=c.get(path,headers={'X-Public-Fragment':'1'} if fragment else {})
            text=res.json()['html'] if fragment else res.text
            for word in [amount,role,'2025-01-01 – 2027-12-31']:assert word in text
            assert 'NEVER_SUMMARY' not in text
            text=text.split('data-project-text>',1)[1].split('</article>',1)[0]
            positions=[text.index(x) for x in ('SOURCE_TEXT','FUND_TEXT','>PROJECT_TITLE<','NUMBER_TEXT',role,'PRIVATE_PI',amount,'PRIVATE_MEMBERS','ACTIVE_TEXT')]
            assert positions==sorted(positions)
    assert run(r.sql.query('SELECT amount FROM projects WHERE uid=?',(uid,)))[0]['amount']=='12.5000'
    c.cookies.clear()
    for path in ('/zh','/zh/projects'):
        page=c.get(path).text
        assert all(x not in page for x in ['PRIVATE_PI','PRIVATE_MEMBERS','12.5 万元'])
    assert project_period('2025-01-01',None,'en')=='From 2025-01-01'
    assert project_period(None,'2027-12-31')=='截至 2027-12-31'

def test_patent_group_order_status_summary_escaping_and_no_detail(fixture):
    c,r=fixture;configure(r,homepage_patent_limit=2)
    uid=add(r,'patents','Patent60',patent_type='TYPE60',legal_status='GRANTED60',application_number='APP60',application_date='2024-01-02',grant_number='GRANT60',grant_date='2025-02-03',inventors='INVENTOR60',owner='OWNER60',country='CN',summary='SUMMARY <script>literal</script>\nSecond line',is_featured=1)
    for path in ('/zh/patents','/en/patents','/zh/patents?home=1&page=1'):
        response=c.get(path,headers={'X-Public-Fragment':'1'} if 'home=1' in path else {})
        text=article(response.json()['html'] if 'home=1' in path else response.text,uid)
        assert text.index('APP60')<text.index('2024-01-02')<text.index('GRANT60')<text.index('2025-02-03')
        assert 'data-patent-group="application"' in text and 'data-patent-group="grant"' in text
        assert 'class="content-status"' in text and 'class="patent-summary"' in text
        assert '<script>literal</script>' not in text and 'Second line' in text
        assert not DOM(text).find('a',href='/zh/patents/'+uid)
