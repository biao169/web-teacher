"""Bounded SQL/HTTP slices, configured home caps, public-only payloads and explicit migration."""
import json,sqlite3
from pathlib import Path
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,configure,DOM
from backend.app.native.catalog import TABLES,Error
from backend.app.native.database import Database,SCHEMA
from backend.app.native.schema_upgrade import migrate
from backend.app.native.public_data import public_listing
H={'Accept':'application/json','X-Public-Fragment':'1'}

def many(r,table,n,**extra):
    return [add(r,table,'Stream-'+str(i),is_featured=1,**extra) for i in range(n)]
def records(html):return DOM(html).find('article')
def ids(html):return [a['data-record-id'] for a in records(html) if 'data-record-id' in a]

def test_home_chunks_respect_setting_above_ten_and_partial_last_page(fixture):
    c,r=fixture;many(r,'publications',26);configure(r,homepage_publication_limit=23)
    shell=c.get('/zh').text;assert len(ids(shell))==0
    html=c.get('/zh/publications?home=1&page=1',headers=H).json()['html'];assert len(ids(html))==10
    streams=[a for t,a in DOM(shell).tags if 'data-public-stream' in a]
    first=next(a for a in streams if a['data-table']=='publications');assert first['data-page']=='0'
    page1=c.get(first['data-next'],headers=H).json();assert page1['total']==23
    p2=c.get(page1['next_url'],headers=H);assert p2.status_code==200
    data=p2.json();assert len(ids(data['html']))==10 and data['home'] and data['total']==23
    last=c.get(data['next_url'],headers=H).json();assert len(ids(last['html']))==3 and not last['next_url']
    assert len(set(ids(html)+ids(data['html'])+ids(last['html'])))==23
    assert '<header' not in data['html'] and '<script' not in data['html']

def test_project_setting_editable_zero_hides_and_defaults_ten(fixture):
    c,r=fixture;many(r,'projects',12)
    assert run(r.sql.query('SELECT homepage_project_limit FROM site_settings'))[0]['homepage_project_limit']==10
    configure(r,homepage_project_limit=0)
    assert 'id="home-projects"' not in c.get('/zh').text
    zero=c.get('/zh/projects?home=1&page=2',headers=H).json();assert zero['total']==0 and not ids(zero['html'])
    configure(r,homepage_project_limit=11)
    page=c.get('/zh/projects?home=1&page=2&size=100&limit=900',headers=H).json()
    assert len(ids(page['html']))==1 and page['total']==11
    row=run(r.sql.query('SELECT uid FROM site_settings'))[0]
    editor=c.get('/admin/site_settings/'+row['uid']+'/edit');assert editor.status_code==200
    assert 'homepage_project_limit' in editor.text and '首页项目数量' in editor.text
    with pytest.raises(Error):configure(r,homepage_project_limit=-1)

def test_teacher_searches_full_featured_set_and_ignores_legacy_uid(fixture):
    c,r=fixture
    for n in range(21):add(r,'profiles','Not featured '+str(n),is_active=1,is_featured=0,sort_order=n)
    selected=add(r,'profiles','RIGHT_FEATURED_PERSON',is_active=1,is_featured=1,sort_order=100)
    wrong=add(r,'profiles','LEGACY_PERSON',is_active=1,is_featured=0)
    run(r.sql.batch([('UPDATE site_settings SET homepage_profile_uid=?',(wrong,))]))
    html=c.get('/zh').text;assert 'RIGHT_FEATURED_PERSON</a></h1>' in html and 'LEGACY_PERSON' not in html

def test_header_hero_icons_order_language_and_visibility(fixture):
    c,r=fixture
    for loc,title,icon in [('header','TOP_NAV','book'),('hero','HERO_CTA','user'),('footer','FOOTER_CTA','file')]:
        run(r.content.save('navigation_items',r.p,{'title':title,'title_en':title+'_EN','path':'/zh/projects','location':loc,'visibility':'public','enabled':1,'icon':icon}))
    page=c.get('/en').text;head=page.split('<header class="academic-header">')[1].split('</header>')[0]
    hero=page.split('<section class="faculty-home">')[1].split('</section>')[0]
    assert 'TOP_NAV_EN' in head and 'HERO_CTA' not in head and 'FOOTER_CTA' not in head
    assert 'HERO_CTA_EN' in hero and '/assets/shared/icons.svg#user' in hero
    assert '/assets/shared/icons.svg#book' in head
    assert page.count('FOOTER_CTA_EN')==1

def test_regular_lists_page_in_small_batches_preserve_filters_and_sort(fixture):
    c,r=fixture;many(r,'publications',25,year=2025);many(r,'publications',3,year=2024)
    first=c.get('/en/publications?q=Stream&f.year=2025&sort=title&direction=desc',headers=H).json()
    assert len(ids(first['html']))==10 and first['size']==10 and first['total']==25
    from starlette.datastructures import QueryParams
    from urllib.parse import urlsplit
    from backend.app.native.public_navigation import visitor_query
    assert visitor_query(QueryParams(urlsplit(first['next_url']).query),'publications')['f.year']=='2025'
    assert 's=' in first['next_url'] and 'sort=sort_order' in first['next_url'] and 'direction=desc' in first['next_url']
    second=c.get(first['next_url'],headers=H).json();third=c.get(second['next_url'],headers=H).json()
    assert len(set(ids(first['html'])+ids(second['html'])+ids(third['html'])))==25
    assert not third['next_url']
    large=c.get('/zh/publications?size=100',headers=H).json();assert large['size']==20 and len(ids(large['html']))==20

@pytest.mark.parametrize('table',['profiles','students','research_interests','projects','publications','patents','courses','news'])
def test_all_list_types_share_fragment_template(fixture,table):
    c,r=fixture;values={'is_active':1} if 'is_active' in TABLES[table]['columns'] else {}
    add(r,table,'VISIBLE_'+table,**values)
    response=c.get('/zh/'+table,headers=H)
    assert response.status_code==200,response.text
    assert 'VISIBLE_'+table in response.json()['html'] and response.json()['table']==table
    assert c.get('/zh/'+table).status_code==200

def test_list_projection_skips_heavy_fields_and_hidden_future_records(fixture):
    c,r=fixture
    uid=add(r,'news','VISIBLE_NEWS',is_featured=1,content='PRIVATE_LIST_HEAVY_BODY'*1000)
    hidden=add(r,'news','HIDDEN_NEWS',visibility='hidden',is_featured=1)
    future=add(r,'news','FUTURE_NEWS',is_featured=1)
    run(r.sql.batch([('UPDATE news SET published_at=? WHERE uid=?',('2099-01-01T00:00:00.000Z',future))]))
    calls=[];original=r.sql.query
    async def track(sql,args=()):calls.append(sql);return await original(sql,args)
    r.sql.query=track
    c.cookies.clear();response=c.get('/zh/news',headers=H);assert response.status_code==200
    payload=response.json();assert uid in ids(payload['html']) and hidden not in ids(payload['html']) and future not in ids(payload['html'])
    assert 'PRIVATE_LIST_HEAVY_BODY' not in payload['html']
    reads=[s for s in calls if ' FROM "news" ' in s and 'count(*)' not in s]
    assert reads and all('"content"' not in s for s in reads)
    assert not any("FROM media_assets WHERE status='active'" in s for s in calls) # no referenced media keys
    assert 'PRIVATE_LIST_HEAVY_BODY' in c.get('/zh/news/'+uid).text
    assert response.headers['cache-control']=='no-store'

def test_public_projection_cannot_request_private_fields(fixture):
    c,r=fixture
    with pytest.raises(Error):run(r.content.listing('profiles',public=True,projection=['uid','education']))
    with pytest.raises(Error):run(r.content.listing('auth_users',public=True,projection=['uid','username']))
    assert c.get('/zh/profiles?c.phone=x',headers=H).status_code==422
    assert c.get('/zh/auth_users',headers=H).status_code==404
    assert c.get('/zh',headers=H).status_code==400

def test_snippets_bounded_but_detail_complete(fixture):
    c,r=fixture;uid=add(r,'profiles','Long biography',bio='A'*7000,is_active=1)
    payload=c.get('/zh/profiles',headers=H).json()
    assert 'A'*2000+'…' in payload['html'] and 'A'*2002 not in payload['html']
    assert 'A'*7000 in c.get('/zh/profiles/'+uid).text

def test_migrate_v45_preserves_accounts_content_media_and_settings(tmp_path):
    from sync_schema_contract import assert_unsupported
    assert_unsupported(tmp_path,'0.15.45')

def test_python_steps_match_fresh_schema_and_rollback(tmp_path,monkeypatch):
    from sync_schema_contract import assert_rollback
    assert_rollback(tmp_path,monkeypatch)


def test_long_original_keeps_shared_translation_before_snippet_truncation(fixture):
    from test_translation_regression import cache
    c,r=fixture;uid=add(r,'profiles','Long translated bio',bio='中文原文'*1500,is_active=1)
    row=run(r.content.get('profiles',uid,r.p));cache(r,'profiles',row,'bio','TRANSLATED '+('Z'*5000),manual=1)
    payload=c.get('/en/profiles',headers=H).json()['html']
    assert 'TRANSLATED ' in payload and '中文原文' not in payload and 'Z'*5000 not in payload
    assert 'Z'*5000 in c.get('/en/profiles/'+uid).text
