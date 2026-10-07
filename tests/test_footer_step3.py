"""Footer HTML, configured navigation, language and access using real templates/HTTP."""
import uuid
from html.parser import HTMLParser
from urllib.parse import urlsplit
import pytest
from test_accounts_regression import fixture,run,user,role
from backend.app.native.public_footer import footer_html,EXAMPLE,safe_href

class DOM(HTMLParser):
    def __init__(self,html):
        super().__init__();self.footers=0;self.footer_depth=0;self.links=[];self.tags=[];self.feed(html)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);self.tags.append((tag,a))
        if tag=='footer':self.footers+=1;self.footer_depth+=1
        if tag=='a':self.links.append((a,bool(self.footer_depth)))
    def handle_endtag(self,tag):
        if tag=='footer':self.footer_depth-=1

def site(r,text):
    row=run(r.sql.query('SELECT * FROM site_settings ORDER BY id LIMIT 1'))[0]
    run(r.content.save('site_settings',r.p,{'footer_text':text},row['uid'],row['updated_at']))
    return run(r.sql.query('SELECT * FROM site_settings WHERE uid=?',(row['uid'],)))[0]
def nav(r,**values):
    return run(r.content.save('navigation_items',r.p,{'title':'页脚按钮','title_en':'Footer button','kind':'button','style':'primary','location':'footer','path':'/zh/contact','enabled':1,'visibility':'public','sort_order':0,**values}))
def links(page):return {a['data-navigation-id']:(a,footer) for a,footer in DOM(page).links if 'data-navigation-id' in a}

@pytest.mark.parametrize('path',['/zh','/en','/zh/profiles','/zh/contact','/en/contact'])
def test_public_pages_have_one_footer_and_configured_button(fixture,path):
    c,r=fixture;site(r,EXAMPLE);uid=nav(r)
    response=c.get(path);assert response.status_code==200,response.text
    dom=DOM(response.text);assert dom.footers==1
    a,in_footer=links(response.text)[uid];assert in_footer
    assert a['href']==('/en/contact' if path.startswith('/en') else '/zh/contact')
    assert a['class']=='btn btn-primary';assert 'data-footer-navigation' not in response.text
    assert '<strong>教师与科研团队</strong>' in response.text
    assert ('Footer button' if path.startswith('/en') else '页脚按钮') in response.text

def test_slot_duplicate_fallback_and_plain_text():
    assert footer_html('', '\n')==''
    buttons='<nav class="footer-nav"><a href="/zh">Home</a></nav>'
    for value in ('','原来的文字\n第二行','<p>HTML</p>','<nav data-footer-navigation>OLD</nav><nav data-footer-navigation>SECOND</nav>'):
        html=footer_html(value,buttons);assert html.count('class="footer-nav"')==1
        assert 'OLD' not in html and 'SECOND' not in html
    assert '文字<br>第二行' in footer_html('原来的文字\n第二行')
    assert '{{ 7*7 }}' in footer_html('{{ 7*7 }}')

def test_html_sanitization_and_safe_static_links():
    html=footer_html('''<script>alert(1)</script><iframe src="https://example.org"></iframe>
      <div style="position:fixed" onclick="evil()" class="footer-grid evil"><strong>Keep</strong>
      <img src="/media/abc" onerror="evil()"><a href="javascript:evil()">bad</a>
      <a href="//example.org">relative</a><a href="https://example.org" target="_blank">good</a>
      <a href="mailto:test@example.org">Email</a></div>''')
    assert '<strong>Keep</strong>' in html
    dom=DOM(html);assert not any(t in ('script','iframe','img','style') for t,_ in dom.tags)
    assert all(not any(k.startswith('on') or k=='style' for k in a) for _,a in dom.tags)
    assert 'evil' not in next(a['class'] for t,a in dom.tags if t=='div')
    good=[a for a,_ in dom.links if a.get('href')=='https://example.org'][0]
    assert good['rel']=='noopener noreferrer'
    assert not any(a.get('href','').startswith(('javascript:','//')) for a,_ in dom.links)

@pytest.mark.parametrize('value',['javascript:alert(1)','//evil.example','/\\evil.example','/%2fevil.example','/a%0d%0ab','https://user:pass@example.org'])
def test_unsafe_href_rejected(value):assert safe_href(value)==''

def test_location_order_styles_fragment_and_disable_take_effect(fixture):
    c,r=fixture;site(r,'<p>Footer only</p>')
    first=nav(r,title='First',sort_order=-2,kind='external',path='https://example.org/docs',style='secondary')
    second=nav(r,title='Second',sort_order=-1,path='/zh/profiles?q=test',fragment='main')
    head=nav(r,title='Header only',location='header',kind='route',style='normal')
    off=nav(r,title='Disabled',enabled=0)
    page=c.get('/en').text;entries=links(page)
    assert entries[first][0]['href']=='https://example.org/docs' and entries[first][1]
    assert entries[first][0]['class']=='btn btn-outline-secondary'
    assert entries[second][0]['href']=='/en/profiles?q=test#main'
    assert not entries[head][1] and off not in entries
    footer=[a.get('data-navigation-id') for a,f in DOM(page).links if f]
    assert footer==[first,second]
    row=run(r.sql.query('SELECT * FROM navigation_items WHERE uid=?',(first,)))[0]
    run(r.content.save('navigation_items',r.p,{'enabled':0},first,row['updated_at']))
    assert first not in links(c.get('/en').text)

def test_visibility_never_exposes_hidden_or_owner_links(fixture):
    c,r=fixture;site(r,'<p>Footer</p>')
    ids={scope:nav(r,title=scope,visibility=scope) for scope in ('public','authenticated','staff','owner','hidden')}
    admin=links(c.get('/zh').text)
    assert all(ids[x] in admin for x in ('public','authenticated','staff'))
    assert all(ids[x] not in admin for x in ('owner','hidden'))
    c.cookies.clear();guest=links(c.get('/zh').text)
    assert ids['public'] in guest and all(ids[x] not in guest for x in ('authenticated','staff','owner','hidden'))

def test_admin_editor_example_is_escaped_and_does_not_overwrite(fixture):
    c,r=fixture;row=site(r,'Existing footer')
    response=c.get('/admin/site_settings/'+row['uid']+'/edit');assert response.status_code==200
    assert '可复制的HTML页脚示例' in response.text and '&lt;nav data-footer-navigation' in response.text
    assert 'Existing footer' in response.text
    assert run(r.sql.query('SELECT footer_text FROM site_settings WHERE uid=?',(row['uid'],)))[0]['footer_text']=='Existing footer'
    assert '<strong>教师与科研团队</strong>' not in response.text

def test_active_site_selection_and_read_only_render(fixture):
    c,r=fixture;row=site(r,'<strong>Active footer</strong>')
    run(r.content.save('site_settings',r.p,{'site_name':'Inactive','is_active':0,'footer_text':'SHOULD NOT APPEAR'}))
    before=run(r.sql.query('SELECT count(*) n FROM operation_logs'))[0]['n']
    page=c.get('/zh').text
    assert '<strong>Active footer</strong>' in page and 'SHOULD NOT APPEAR' not in page
    assert run(r.sql.query('SELECT count(*) n FROM operation_logs'))[0]['n']==before

def test_translated_footer_is_sanitized_and_navigation_falls_back(fixture):
    from test_translation_regression import cache
    c,r=fixture;row=site(r,'<p>中文页脚</p><nav data-footer-navigation></nav>');uid=nav(r,title_en='English action')
    cache(r,'site_settings',row,'footer_text','<p>English footer</p><script>evil()</script>',manual=1)
    page=c.get('/en').text
    assert '<p>English footer</p>' in page and '<script>evil()' not in page
    assert links(page)[uid][1]
    assert '<p>中文页脚</p>' in c.get('/zh').text
