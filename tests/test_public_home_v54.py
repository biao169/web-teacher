"""Second-step homepage composition with real templates and public paging."""
import re
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,configure,DOM
from test_public_replan_v53 import image_asset


def seed_modules(r):
    ids={table:add(r,table,'HOME_'+table,is_featured=1) for table in ('publications','news','projects','patents','students')}
    configure(r,homepage_student_limit=3,homepage_patent_limit=3)
    return ids

def test_five_modules_are_grouped_in_reading_order_and_home_css_is_scoped(fixture):
    c,r=fixture;seed_modules(r)
    for lang in ('zh','en'):
        html=c.get('/'+lang).text;dom=DOM(html)
        groups=[a for t,a in dom.tags if 'data-home-group' in a]
        assert [(g['data-home-group'],g['data-module-count']) for g in groups]==[('primary','2'),('secondary','3')]
        sections=[a['data-table'] for t,a in dom.tags if 'data-public-stream' in a]
        assert sections==['publications','news','projects','patents','students']
        assert len(dom.find('h1'))==1
        asset=re.search(r'href="(/assets/public/css/home\.css\?v=[^"]+)"',html)
        assert asset and c.get(asset[1]).status_code==200
        assert html.index('id="home-news"')<html.index('data-home-group="secondary"')<html.index('id="home-projects"')
    for path in ('/zh/publications','/zh/contact','/admin/profiles'):
        assert 'home.css' not in c.get(path).text

def test_missing_modules_leave_only_real_groups_and_fill_count(fixture):
    c,r=fixture;seed_modules(r)
    configure(r,homepage_publication_limit=0,homepage_project_limit=0,homepage_student_limit=0)
    dom=DOM(c.get('/zh').text)
    groups=[a for t,a in dom.tags if 'data-home-group' in a]
    assert [(g['data-home-group'],g['data-module-count']) for g in groups]==[('primary','1'),('secondary','1')]
    configure(r,homepage_news_limit=0,homepage_patent_limit=0)
    empty=c.get('/zh').text
    assert 'data-home-group=' not in empty and '<h1>' in empty

def test_portrait_precedes_text_contacts_omit_empty_boxes_and_no_hidden_info(fixture):
    c,r=fixture;key=image_asset(r,'home-portrait')
    uid=add(r,'profiles','Home teacher',is_featured=1,is_active=1,avatar_key=key,bio='Public introduction',education='NO_EDUCATION',office='NO_OFFICE',contact_visibility='hidden')
    page=c.get('/zh').text
    assert page.index('class="faculty-portrait public-media"')<page.index('class="faculty-identity"')
    assert 'faculty-contact-panel' in page and 'NO_OFFICE' in page and 'NO_EDUCATION' not in page
    assert len(DOM(page).find_path('/zh/profiles/'+uid))==1
    run(r.sql.batch([("UPDATE profiles SET avatar_key=NULL WHERE uid=?",(uid,))]))
    page=c.get('/zh').text
    assert 'data-media-fallback' in page and 'faculty-portrait public-media' in page

def test_home_news_cover_is_left_and_links_are_same_tab_policy_as_before(fixture):
    c,r=fixture;key=image_asset(r,'home-news-cover')
    uid=add(r,'news','HOME_NEWS',is_featured=1,cover_key=key)
    html=c.get('/zh/news?home=1&page=1',headers={'X-Public-Fragment':'1'}).json()['html'];article=html.split('data-record-id="'+uid+'"')[1].split('</article>')[0]
    assert article.index('class="academic-card-media public-media"')<article.index('class="academic-card-copy"')
    links=DOM(article).find_path('/zh/news/'+uid)
    assert len(links)==2 and all(x.get('target')=='_blank' and x.get('rel')=='noopener noreferrer' for x in links)
    assert 'card-meta-row' in article and 'card-icon' in article

def test_home_non_detail_cards_do_not_link_but_list_entry_remains(fixture):
    c,r=fixture;ids=seed_modules(r);dom=DOM(c.get('/zh').text)
    for table in ('publications','projects','patents','students'):
        assert not dom.find('a',href=f'/zh/{table}/{ids[table]}')
        assert dom.find('a',href=f'/zh/{table}')

def test_continuation_keeps_home_card_structure_and_configured_limit(fixture):
    c,r=fixture
    for i in range(12):add(r,'students',f'HomeStudent{i:02}',is_featured=1,sort_order=i)
    configure(r,homepage_student_limit=11)
    page=c.get('/zh').text;stream=next(a for t,a in DOM(page).tags if a.get('data-table')=='students')
    first=c.get(stream['data-next'],headers={'X-Public-Fragment':'1'}).json()
    assert first['next_url']
    payload=c.get(first['next_url'],headers={'X-Public-Fragment':'1'}).json()
    assert payload['home'] and payload['total']==11 and not payload['next_url']
    articles=DOM(payload['html']).find('article')
    assert len(articles)==1 and 'home-card-students' in articles[0]['class']
    assert 'data-home-group' not in payload['html'] and '<script' not in payload['html']
    assert 'home.css' in c.get(stream['data-next']).text
