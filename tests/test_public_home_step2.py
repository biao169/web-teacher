"""Real HTTP/template regression on disposable SQLite; no production data."""
from html.parser import HTMLParser
from test_accounts_regression import fixture,run,user
from backend.app.native.catalog import TITLE

class DOM(HTMLParser):
    def __init__(self,html):super().__init__();self.tags=[];self.feed(html)
    def handle_starttag(self,tag,attrs):self.tags.append((tag,dict(attrs)))
    def find_path(self,path):
        from urllib.parse import urlsplit
        return [a for t,a in self.tags if t=='a' and urlsplit(a.get('href','')).path==path]
    def find(self,tag,**attrs):return [a for t,a in self.tags if t==tag and all(a.get(k)==v for k,v in attrs.items())]

def configure(r,**values):
    row=run(r.sql.query('SELECT * FROM site_settings WHERE is_active=1 ORDER BY id LIMIT 1'))[0]
    run(r.content.save('site_settings',r.p,values,row['uid'],row['updated_at']))

def add(r,table,title,**values):
    common={TITLE[table]:title,'visibility':'public',**values}
    if table=='news':common.update(slug=title,published_at='2025-01-02T00:00:00.000Z')
    return run(r.content.save(table,r.p,common))

def test_only_configured_faculty_and_public_key_fields(fixture):
    c,r=fixture
    chosen=add(r,'profiles','Chosen faculty',is_active=1,is_featured=1,bio='Public biography',education='EDUCATION_DETAIL_ONLY',recruiting='RECRUIT_DETAIL_ONLY',email='hidden@example.org',contact_visibility='hidden')
    add(r,'profiles','Other faculty',is_active=1,sort_order=-10)
    html=c.get('/zh').text
    assert 'Chosen faculty' in html and 'Public biography' in html and 'Other faculty' not in html
    assert 'EDUCATION_DETAIL_ONLY' not in html and 'RECRUIT_DETAIL_ONLY' in html and 'hidden@example.org' in html
    assert len(DOM(html).find('h1'))==1
    add(r,'profiles','Earlier featured',is_active=1,is_featured=1,sort_order=-5)
    assert 'Earlier featured</a></h1>' in c.get('/zh').text

def test_absent_or_hidden_faculty_falls_back_without_selecting_another(fixture):
    c,r=fixture
    add(r,'profiles','NOT_THE_FEATURED_PERSON',is_active=1)
    configure(r,hero_title='Site introduction',hero_subtitle='Site subtitle')
    assert 'Site introduction' in c.get('/zh').text and 'NOT_THE_FEATURED_PERSON' not in c.get('/zh').text
    hidden=add(r,'profiles','PRIVATE_PERSON',visibility='hidden',is_active=1,is_featured=1)
    page=c.get('/zh').text
    assert 'Site introduction' in page and 'PRIVATE_PERSON' not in page and 'NOT_THE_FEATURED_PERSON' not in page

def test_inactive_selected_faculty_falls_back(fixture):
    c,r=fixture;uid=add(r,'profiles','INACTIVE_PERSON',is_active=0,is_featured=1)
    configure(r,hero_title='Fallback title')
    page=c.get('/zh').text;assert 'Fallback title' in page and 'INACTIVE_PERSON' not in page

def test_real_home_modules_zero_limits_featured_visibility_and_order(fixture):
    c,r=fixture
    for table in ('publications','projects','news'):add(r,table,'Public-'+table,is_featured=1)
    add(r,'publications','PRIVATE_PAPER',visibility='hidden',is_featured=1)
    add(r,'publications','UNFEATURED_PAPER',is_featured=0)
    configure(r,homepage_publication_limit=0,homepage_news_limit=0)
    page=c.get('/zh').text
    assert 'home-publications' not in page and 'home-news' not in page and 'home-projects' in page
    configure(r,homepage_publication_limit=1,homepage_news_limit=1)
    page=c.get('/zh').text
    assert page.index('id="home-publications"')<page.index('id="home-news"')<page.index('id="home-projects"')
    assert 'PRIVATE_PAPER' not in page and 'UNFEATURED_PAPER' not in page

def test_no_content_does_not_render_empty_home_modules(fixture):
    c,r=fixture;page=c.get('/zh').text
    assert 'class="academic-home-section"' not in page and '<h1>' in page

def test_projects_show_fund_source_and_never_summary(fixture):
    c,r=fixture
    add(r,'projects','Project title',is_featured=1,source='Funding source',fund_name='Research program',summary='DO_NOT_SHOW_SUMMARY',amount='100.00')
    page=c.get('/zh').text
    assert 'Funding source' in page and 'Research program' in page
    assert 'DO_NOT_SHOW_SUMMARY' not in page and '100 万元' in page

def test_news_links_open_new_tab(fixture):
    c,r=fixture;uid=add(r,'news','news-demo',is_featured=1)
    matches=DOM(c.get('/zh').text).find_path('/zh/news/'+uid)
    assert len(matches)==2 and all(a.get('target')=='_blank' and a.get('rel')=='noopener noreferrer' for a in matches)

def test_manual_english_faculty_and_english_ui(fixture):
    c,r=fixture;uid=add(r,'profiles','中文姓名',name_en='English Name',bio='中文介绍',bio_en='English biography',is_active=1,is_featured=1)
    configure(r,site_name='中文网站',site_name_en='English site')
    page=c.get('/en').text
    assert 'English Name' in page and 'English biography' in page and 'English site' in page
    assert 'Faculty profile' not in page and 'Main navigation' in page
    assert DOM(page).find_path('/en/profiles/'+uid)

def test_navigation_only_configured_enabled_public_links(fixture):
    c,r=fixture
    for title,enabled,visibility in [('TOP_ALLOWED',1,'public'),('TOP_DISABLED',0,'public'),('TOP_PRIVATE',1,'hidden')]:
        run(r.content.save('navigation_items',r.p,{'title':title,'path':'/zh/projects','enabled':enabled,'visibility':visibility,'location':'header'}))
    c.cookies.clear();page=c.get('/zh').text;head=page.split('<header class="academic-header">')[1].split('</header>')[0]
    assert 'TOP_ALLOWED' in head and 'TOP_DISABLED' not in head and 'TOP_PRIVATE' not in head
    assert '/zh/students' not in head and 'href="/transfer"' not in head
    assert 'href="/auth/login?' in head and 'href="/admin"' not in head

def test_real_admin_and_logout_csrf_then_registered_user_no_admin_link(fixture):
    c,r=fixture;page=c.get('/zh').text
    assert 'href="/admin"' in page
    dom=DOM(page);assert dom.find('form',action='/auth/logout',method='post')
    assert dom.find('input',name='_csrf',value=r.p['csrf'])
    role_uid=run(r.content.save('auth_roles',r.p,{'name':'No admin access','level':1,'visibility_scopes':'["public"]','is_active':1},permissions={}))
    u=user(r,role_uid=role_uid);token=run(r.auth.login(u['username'],'Synthetic-only-password-035','home-test'))
    c.cookies.set('ts_session',token);page=c.get('/zh').text
    assert 'href="/admin"' not in page and 'action="/auth/logout"' in page

def test_language_fallback_preserves_module_and_linked_record_filter(fixture):
    c,r=fixture;uid=add(r,'publications','Paper name',is_featured=1)
    page=c.get('/zh/publications/'+uid).text
    import base64,json
    from urllib.parse import urlsplit,parse_qs
    links=DOM(page).find_path('/en/publications')
    assert links
    token=parse_qs(urlsplit(links[0]['href']).query)['s'][0]
    assert json.loads(base64.urlsafe_b64decode(token+'='*((-len(token))%4)))=={'f.uid':uid}
    teacher=add(r,'profiles','Teacher',is_active=1)
    assert DOM(c.get('/zh/profiles/'+teacher).text).find_path('/en/profiles/'+teacher)
    assert 'Paper name' in page

def test_public_html_escapes_fields_and_keeps_footer_sanitizer(fixture):
    c,r=fixture
    uid=add(r,'profiles','<script>bad()</script>',is_active=1,is_featured=1,bio='<img src=x onerror=bad()>')
    configure(r,footer_text='<strong>Safe footer</strong><script>evil()</script>')
    page=c.get('/zh').text
    assert '&lt;script&gt;bad()&lt;/script&gt;' in page and '<script>bad()' not in page
    assert '<img src=x onerror=bad()>' not in page
    assert '<strong>Safe footer</strong>' in page and '<script>evil()' not in page

def test_home_read_only_and_admin_template_unaffected(fixture):
    c,r=fixture;before=run(r.sql.query('SELECT count(*) n FROM operation_logs'))[0]['n']
    for path in ('/zh','/en','/zh/contact','/admin/profiles'):
        response=c.get(path);assert response.status_code==200,response.text
        if path.startswith('/admin'):assert 'academic.css' not in response.text and 'academic-header' not in response.text
    assert run(r.sql.query('SELECT count(*) n FROM operation_logs'))[0]['n']==before
