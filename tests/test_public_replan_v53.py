"""Configuration, branding, privacy, ordering and exact additive migration."""
import json,sqlite3
from pathlib import Path
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,configure,DOM
from backend.app.native.catalog import Error
from backend.app.native.database import Database,SCHEMA
from backend.app.native.schema_upgrade import migrate
from backend.app.native.public_data import public_listing
from backend.app.native.public_home import homepage_rows


def image_asset(r,uid):
    from backend.app.native.example_assets import portrait
    data=portrait(1);key=uid+'.png'
    run(r.media_store.put(key,data))
    run(r.sql.batch([('INSERT INTO media_assets(uid,object_key,title,mime_type,size,status) VALUES (?,?,?,?,?,?)',(uid,key,uid,'image/png',len(data),'active'))]))
    return key

def test_logo_active_site_brand_titles_and_public_asset(fixture):
    c,r=fixture;key=image_asset(r,'replan-logo')
    configure(r,site_name='配置站点',site_name_en='Configured site',logo_key=key,favicon_key=key,hero_title='首页标题',seo_title='搜索标题')
    c.cookies.clear();zh=c.get('/zh');en=c.get('/en')
    assert '<title>搜索标题</title>' in zh.text and '<h1>首页标题</h1>' in zh.text
    assert 'class="academic-brand-logo"' in zh.text
    assert '/media/replan-logo' in zh.text and 'Configured site' in en.text
    assert 'replan-logo.png' not in zh.text
    assert c.get('/media/replan-logo').status_code==200
    run(r.sql.batch([("UPDATE media_assets SET status='trash' WHERE uid='replan-logo'",())]))
    page=c.get('/zh');assert 'academic-brand-logo' not in page.text and '配置站点' in page.text
    assert c.get('/media/replan-logo').status_code==404

def test_home_phone_is_gated_while_office_email_and_academic_links_are_public(fixture):
    c,r=fixture
    uid=add(r,'profiles','Teacher contact',is_active=1,is_featured=1,office='Office 305',phone='123-456',email='contact@example.invalid',contact_visibility='public',github='https://example.invalid/github',google_scholar='https://example.invalid/scholar')
    c.cookies.clear();html=c.get('/zh').text
    for text in ('Office 305','123-456','contact@example.invalid','https://example.invalid/github'):assert text in html
    run(r.sql.batch([("UPDATE profiles SET contact_visibility='hidden' WHERE uid=?",(uid,))]))
    # Later homepage policy: only phone is gated; list/detail contact gates remain.
    home=c.get('/zh').text
    assert '123-456' not in home
    for text in ('Office 305','contact@example.invalid'):assert text in home
    for path in ('/zh/profiles','/zh/profiles/'+uid):
        html=c.get(path).text
        for text in ('Office 305','123-456','contact@example.invalid'):assert text not in html
    row=run(public_listing(r,'profiles',{}))['rows'][0]
    assert 'phone' not in row and 'office' not in row
    assert 'https://example.invalid/github' in c.get('/zh').text

def test_new_settings_validate_and_appear_in_existing_editor(fixture):
    c,r=fixture
    configure(r,homepage_student_limit=11,homepage_patent_limit=2,publication_citation_style='apa')
    row=run(r.sql.query('SELECT * FROM site_settings WHERE is_active=1'))[0]
    page=c.get('/admin/site_settings/'+row['uid']+'/edit')
    assert page.status_code==200
    for field in ('homepage_student_limit','homepage_patent_limit','publication_citation_style'):assert 'name="'+field+'"' in page.text
    for invalid in ({'publication_citation_style':'raw-html'},{'homepage_student_limit':-1},{'homepage_patent_limit':'bad'}):
        with pytest.raises(Error):configure(r,**invalid)
    assert run(r.sql.query('SELECT publication_citation_style FROM site_settings'))[0]['publication_citation_style']=='apa'

def test_selected_citation_is_bounded_and_manual_text_unchanged(fixture):
    c,r=fixture;uid=add(r,'publications','Selected citation',citation_apa='MANUAL_APA',citation_gbt='MANUAL_GBT')
    calls=[];old=r.sql.query
    async def query(sql,args=()):calls.append(sql);return await old(sql,args)
    r.sql.query=query
    row=run(public_listing(r,'publications',{}, {'publication_citation_style':'apa'}))['rows'][0]
    assert row['_citation_style']=='apa' and row['_citation_text']=='MANUAL_APA'
    assert 'citation_gbt' not in row
    selected=[q for q in calls if ' FROM "publications" ' in q and 'count(*)' not in q]
    assert selected and all('"citation_gbt"' not in q for q in selected)
    assert run(r.sql.query('SELECT citation_gbt,citation_apa FROM publications WHERE uid=?',(uid,)))[0]=={'citation_gbt':'MANUAL_GBT','citation_apa':'MANUAL_APA'}

@pytest.mark.parametrize('table',['profiles','publications','projects','patents','courses','news','research_interests'])
def test_default_order_is_admin_order_and_ties_reverse_stably(fixture,table):
    c,r=fixture;extra={'is_active':1} if table=='profiles' else {}
    a=add(r,table,'A',sort_order=9,**extra);b=add(r,table,'B',sort_order=1,**extra);d=add(r,table,'D',sort_order=1,**extra)
    first=run(public_listing(r,table,{}));reverse=run(public_listing(r,table,{'direction':'desc'}))
    assert first['query']['sort']=='sort_order' and first['query']['direction']=='asc'
    assert [row['uid'] for row in first['rows']]==[b,d,a]
    assert [row['uid'] for row in reverse['rows']]==[a,d,b]

def test_new_home_caps_and_no_unbounded_fetch(fixture):
    c,r=fixture
    for i in range(14):add(r,'students','Student'+str(i),is_featured=1,sort_order=i)
    add(r,'patents','Patent',is_featured=1)
    configure(r,homepage_student_limit=11,homepage_patent_limit=0)
    site=run(r.sql.query('SELECT * FROM site_settings WHERE is_active=1'))[0]
    data,pages=run(homepage_rows(r,site))
    assert len(data['students'])==10 and pages['students']['total']==11 and data['patents']==[]
    fragment=c.get('/zh/students?home=1&page=2',headers={'X-Public-Fragment':'1'}).json()
    assert len(DOM(fragment['html']).find('article'))==1 and not fragment['next_url']
    assert 'id="home-students"' in c.get('/zh').text and 'id="home-patents"' not in c.get('/zh').text


def old_database(path):
    snapshot=json.loads((SCHEMA/'teacher-v0.15.52.json').read_text())
    with sqlite3.connect(path) as c:
        for obj in snapshot['objects']:c.execute(obj['sql'])
        c.execute("INSERT INTO site_settings(uid,site_name,is_active,homepage_project_limit) VALUES ('s','Keep my site',1,17)")
        c.execute("INSERT INTO students(uid,name,visibility) VALUES ('student','Keep student','public')")
        c.execute("INSERT INTO publications(uid,title,citation_gbt) VALUES ('paper','Keep paper','Manual text')")

def test_v52_migration_preserves_all_rows_and_backup_and_is_repeatable(tmp_path):
    from sync_schema_contract import assert_unsupported
    assert_unsupported(tmp_path,'0.15.52')

def test_v52_migration_rolls_back_and_python_steps_match_fresh(tmp_path,monkeypatch):
    from sync_schema_contract import assert_rollback
    assert_rollback(tmp_path,monkeypatch)
