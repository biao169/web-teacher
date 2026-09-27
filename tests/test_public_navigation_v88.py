"""Stable public entries, mandatory server scopes and ASCII query state over real HTTP/SQLite."""
from urllib.parse import urlsplit,parse_qs
import pytest
from test_accounts_regression import fixture,run,user
from test_public_home_step2 import add,DOM
from test_public_stream_v46 import ids,H
from backend.app.native.navigation import build_public_path
from backend.app.native.public_navigation import encode_state

def entry(r,table='projects',field='name',value='人工智能',slug='ai-projects',**extra):
    return run(r.content.save('navigation_items',r.p,{'title':'SCOPED_NAV','url_name':slug,'kind':'route','location':'header','visibility':'public','enabled':1,'path':build_public_path(table,[{'field':field,'operator':'contains','value':value}]),**extra}))
def fragment(c,path='/en/n/ai-projects',**params):
    response=c.get(path,params=params,headers=H);assert response.status_code==200,response.text
    return response.json()
def stream(html):return next(a for _,a in DOM(html).tags if 'data-public-stream' in a)
def update(r,uid,**values):
    row=run(r.sql.query('SELECT * FROM navigation_items WHERE uid=?',(uid,)))[0]
    run(r.content.save('navigation_items',r.p,values,uid,row['updated_at']))

@pytest.mark.parametrize('lang',['en','zh'])
def test_entry_lists_fixed_intersection_pages_reset_language(fixture,lang):
    c,r=fixture
    wanted=[add(r,'projects','人工智能 医疗 '+str(i),source='国家基金',amount='987654',principal='PRIVATE_PI',members='PRIVATE_MEMBER') for i in range(13)]
    add(r,'projects','无关项目',source='独有来源');add(r,'projects','人工智能隐藏',visibility='hidden')
    entry(r);c.cookies.clear();path='/'+lang+'/n/ai-projects'
    html=c.get(path).text;s=stream(html)
    assert s['data-total']=='13' and len(ids(html))==10
    assert all(x not in html for x in ['PRIVATE_PI','PRIVATE_MEMBER','987654','独有来源','人工智能隐藏'])
    assert DOM(html).find('form',**{'data-person-form':None})[0]['action']==path
    assert next(a for _,a in DOM(html).tags if 'data-person-reset' in a)['href']==path
    assert all('/n/ai-projects' in a['href'] for _,a in DOM(html).tags if 'data-public-language' in a)
    assert 'nf=' not in c.get('/'+lang).text
    assert 'href="'+path+'"' in c.get('/'+lang).text
    p2=c.get(s['data-next'],headers=H).json();assert p2['total']==13 and not p2['next_url']
    assert set(ids(html)+ids(p2['html']))==set(wanted)
    assert fragment(c,path,q='无关')['total']==0
    assert fragment(c,path,**{'f.source':'独有来源'})['total']==0
    assert fragment(c,path,**{'c.name':'医疗'})['total']==13
    assert fragment(c,path)['total']==13
    assert fragment(c,path,direction='desc')['total']==13
    response=c.get(path,params={'q':'医疗','f.source':'国家基金','direction':'desc'})
    assert response.status_code==200 and response.history[0].status_code==303
    params=parse_qs(urlsplit(str(response.url)).query)
    assert 's' in params and 'q' not in params and '%E' not in str(response.url)
    assert str(response.url).isascii() and stream(response.text)['data-total']=='13'

@pytest.mark.parametrize('extra',[{'enabled':0},{'visibility':'hidden'},{'visibility':'authenticated'},{'visibility':'staff'}])
def test_unavailable_navigation_fails_closed(fixture,extra):
    c,r=fixture;entry(r,**extra);add(r,'projects','普通公开项目');c.cookies.clear()
    assert c.get('/en/n/ai-projects').status_code==404
    assert fragment(c,'/en/projects')['total']==1
    assert 'SCOPED_NAV' not in c.get('/en').text

def test_auth_visibility_and_private_fields_use_current_identity(fixture):
    c,r=fixture;entry(r,visibility='authenticated');add(r,'projects','人工智能',amount='87654',principal='ADMIN_ONLY_PI')
    assert 'ADMIN_ONLY_PI' in c.get('/en/n/ai-projects').text
    u=user(r);token=run(r.auth.login(u['username'],'Synthetic-only-password-035','test'));c.cookies.set(r.config.name('session'),token)
    response=c.get('/en/n/ai-projects');assert response.status_code==200 and 'ADMIN_ONLY_PI' not in response.text and '87654' not in response.text
    c.cookies.clear();assert c.get('/en/n/ai-projects').status_code==404

def test_live_scope_change_invalidates_continuations_and_facets(fixture):
    c,r=fixture;uid=entry(r)
    for n in range(12):add(r,'projects','人工智能 '+str(n),source='国家基金')
    first=fragment(c);nxt=first['next_url'];stamp=first['nav_stamp']
    assert c.get('/api/public/people/projects/facets/source',params={'nav':'ai-projects','nv':stamp}).json()['values']==['国家基金']
    add(r,'projects','材料研究',source='其它来源')
    update(r,uid,path=build_public_path('projects',[{'field':'name','operator':'contains','value':'材料'}]))
    assert c.get(nxt,headers=H).status_code==409
    assert c.get('/api/public/people/projects/facets/source',params={'nav':'ai-projects','nv':stamp}).status_code==409
    assert fragment(c)['total']==1
    update(r,uid,enabled=0);assert c.get('/en/n/ai-projects',headers=H).status_code==404
    update(r,uid,enabled=1,path='/en/projects');assert c.get('/en/n/ai-projects').status_code==404

@pytest.mark.parametrize('query',['s=!','s=e30&q=x','q=a&q=b','s=bnVsbA','home=1','nf=abc','nav=other','f.principal=x','c.amount=100','nv=bad','direction=wrong','page=9999999999'])
def test_invalid_or_override_query_is_rejected(fixture,query):
    c,r=fixture;entry(r)
    assert c.get('/en/n/ai-projects?'+query,headers=H).status_code==422

def test_decoded_state_is_validated_not_trusted(fixture):
    c,r=fixture;entry(r)
    for state in ({'f.amount':'1'},{'nf':'evil'},{'q':['bad']},{'q':'x'*201},{'c.name':'\x00'}):
        assert c.get('/en/n/ai-projects',params={'s':encode_state(state)},headers=H).status_code==422
    assert c.get('/en/projects',params={'q':'中文'},follow_redirects=False).headers['location'].isascii()

@pytest.mark.parametrize('table,field',[('profiles','bio'),('courses','summary'),('news','content')])
def test_details_and_backlinks_stay_scoped(fixture,table,field):
    c,r=fixture;titlefield='title' if table=='news' else 'name';entry(r,table,titlefield,slug='detail-scope')
    extra={'is_active':1} if table=='profiles' else {}
    inside=add(r,table,'人工智能入选',**{field:'正文内容',**extra});outside=add(r,table,'其它内容',**extra)
    page=c.get('/en/n/detail-scope');assert page.status_code==200
    links=[a['href'] for _,a in DOM(page.text).tags if 'data-person-link' in a]
    assert links and all(link.startswith('/en/n/detail-scope/'+inside) for link in links)
    detail=c.get(links[0]);assert detail.status_code==200
    assert next(a for _,a in DOM(detail.text).tags if 'data-person-back' in a)['href']=='/en/n/detail-scope'
    assert c.get('/en/n/detail-scope/'+outside).status_code==404

@pytest.mark.parametrize('table,field',[('students','bio'),('courses','summary')])
def test_description_api_enforces_scope_and_module(fixture,table,field):
    c,r=fixture;entry(r,table,slug='descriptions')
    yes=add(r,table,'人工智能学生',**{field:'长文本'*1000});no=add(r,table,'其它',**{field:'OUTSIDE_DESCRIPTION'})
    for uid,status in [(yes,200),(no,404)]:
        assert c.get(f'/api/public/en/{table}/{uid}/description',params={'nav':'descriptions'}).status_code==status
    assert c.get('/api/public/people/projects/facets/source',params={'nav':'descriptions'}).status_code==404

def test_citations_and_more_facets_are_scoped(fixture):
    c,r=fixture;entry(r,'publications','title',slug='papers')
    yes=add(r,'publications','人工智能论文',venue='目标期刊');no=add(r,'publications','其它论文',venue='其它期刊')
    run(r.sql.batch([('UPDATE publications SET citation_apa=? WHERE uid=?',('IN_SCOPE',yes)),('UPDATE publications SET citation_apa=? WHERE uid=?',('OUTSIDE',no))]))
    response=c.get('/api/public/publications/citations',params=[('nav','papers'),('format','apa'),('uid',yes),('uid',no)])
    assert response.status_code==200 and response.json()['rows']==[{'uid':yes,'text':'IN_SCOPE'}]
    assert c.get('/api/public/people/publications/facets/venue',params={'nav':'papers'}).json()['values']==['目标期刊']
    assert c.get('/api/public/people/publications/facets/venue',params=[('nav','papers'),('nav','papers')]).status_code==422
