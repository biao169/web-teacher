"""Finite scoped HTML caching, dependencies and post-commit scope revocation."""
import pytest
from test_accounts_regression import fixture,run
from test_public_navigation_v88 import entry,update
from test_public_home_step2 import add
from backend.app.public_performance import PUBLIC_NAV_EDGE_POLICY,page_request
from backend.app.native.public_cache_tags import navigation_tag,CommittedChanges,record_commit,validate_payload,statements_plan
from backend.app.native.navigation import build_public_path

@pytest.mark.parametrize('lang',['zh','en'])
@pytest.mark.parametrize('kind',['local','r2'])
def test_public_entry_short_cache_anonymous_even_with_session(fixture,monkeypatch,lang,kind):
    c,r=fixture;entry(r);add(r,'projects','人工智能',principal='PRIVATE_DATA_116');r.kind=kind
    original=r.sql.query;seen=[]
    async def query(sql,*args,**kwargs):
        seen.append(sql)
        assert 'FROM auth_sessions' not in sql
        return await original(sql,*args,**kwargs)
    monkeypatch.setattr(r.sql,'query',query)
    path='/'+lang+'/n/ai-projects';response=c.get(path)
    assert response.status_code==200 and 'PRIVATE_DATA_116' not in response.text
    assert response.headers['cache-control']=='public, max-age=60'
    assert response.headers['cloudflare-cdn-cache-control']==PUBLIC_NAV_EDGE_POLICY
    assert response.headers['x-teacher-render-ok']=='1'
    tags=set(response.headers['cache-tag'].split(','));assert {'public-projects',navigation_tag('ai-projects'),'public-layout'}<=tags
    assert 'set-cookie' not in response.headers and 'Checking identity' not in response.text
    assert sum('SELECT * FROM navigation_items WHERE url_name=?' in sql for sql in seen)==1
    conditional=c.get(path,headers={'If-None-Match':response.headers['etag']});assert conditional.status_code==304
    assert conditional.headers['cache-tag']==response.headers['cache-tag']
    head=c.head(path);assert head.status_code==200 and not head.content and head.headers['cache-control']=='public, max-age=60'

@pytest.mark.parametrize('path',['/en/n/ai-projects?page=2','/en/n/ai-projects?nv='+'a'*32,'/en/n/ai-projects?direction=desc','/en/n/ai-projects/detail'])
def test_scoped_query_and_detail_never_cached(fixture,path):
    c,r=fixture;entry(r);response=c.get(path)
    assert response.headers['cache-control']==response.headers['cloudflare-cdn-cache-control']=='no-store'
    assert 'cache-tag' not in response.headers and 'x-teacher-render-ok' not in response.headers

def test_fragment_and_restricted_entry_never_cached(fixture):
    c,r=fixture;entry(r)
    response=c.get('/en/n/ai-projects',headers={'X-Public-Fragment':'1'});assert response.status_code==200
    assert response.headers['cache-control']=='no-store' and 'cache-tag' not in response.headers
    entry(r,slug='private-entry',visibility='authenticated')
    response=c.get('/en/n/private-entry');assert response.status_code==200
    assert response.headers['cache-control']=='no-store' and 'cache-tag' not in response.headers
    c.cookies.clear();response=c.get('/en/n/private-entry');assert response.status_code==404
    assert response.headers['cloudflare-cdn-cache-control']=='no-store'

@pytest.mark.parametrize('edit',[{'enabled':0},{'visibility':'authenticated'},{'url_name':'renamed-entry'},{'path':'/en/projects'},{'path':build_public_path('publications',[{'field':'title','operator':'contains','value':'AI'}])}])
def test_scope_changes_purge_old_entry_after_commit(fixture,edit):
    c,r=fixture;uid=entry(r);r.sql.on_public_commit=record_commit
    with CommittedChanges() as changes:update(r,uid,**edit)
    assert navigation_tag('ai-projects') in changes.plan.purge
    if 'url_name' in edit:assert navigation_tag(edit['url_name']) in changes.plan.purge
    assert validate_payload(changes.plan.payload()).payload()==changes.plan.payload()

def test_label_change_invalidates_and_bulk_scope_change_purges_dependency(fixture):
    c,r=fixture;uid=entry(r);r.sql.on_public_commit=record_commit
    with CommittedChanges() as changes:update(r,uid,title='New label')
    assert navigation_tag('ai-projects') in changes.plan.invalidate and not changes.plan.purge
    assert 'public-layout' in statements_plan([('UPDATE navigation_items SET path=? WHERE uid=?',('/en/projects','uid'))]).purge

def test_generation_fault_never_produces_cache_object(fixture,monkeypatch):
    c,r=fixture;entry(r)
    import backend.app.native.public_data as data
    async def fail(*args,**kwargs):raise RuntimeError('Injected scoped render failure')
    monkeypatch.setattr(data,'public_listing',fail)
    c._transport.raise_server_exceptions=False
    response=c.get('/en/n/ai-projects');assert response.status_code==500
    assert response.headers['cache-control']==response.headers['cloudflare-cdn-cache-control']=='no-store'
    assert all(k not in response.headers for k in ('cache-tag','etag','x-teacher-render-ok'))

def test_unvalidated_fixed_entry_200_is_not_cacheable():
    from test_public_page_v102 import request
    from fastapi.responses import HTMLResponse
    from backend.app.native.public_http_cache import finish
    result=finish(request('/en/n/unconfigured'),HTMLResponse('Anonymous-looking error'),public_ok=True)
    assert result.headers['cache-control']=='no-store' and 'x-teacher-render-ok' not in result.headers

def test_deletion_purges_both_languages_and_module_changes_cover_fixed_html(fixture):
    c,r=fixture;uid=entry(r)
    row=run(r.sql.query('SELECT * FROM navigation_items WHERE uid=?',(uid,)))[0]
    r.sql.on_public_commit=record_commit
    with CommittedChanges() as changes:run(r.content.delete('navigation_items',r.p,uid,row['updated_at']))
    assert navigation_tag('ai-projects') in changes.plan.purge
    assert c.get('/en/n/ai-projects').status_code==404 and c.get('/zh/n/ai-projects').status_code==404
    from backend.app.native.public_cache_tags import change_plan
    plan=change_plan('projects','project-116',{'visibility':'public','name':'Old'},{'visibility':'public','name':'New'})
    assert 'public-projects' in plan.invalidate and 'public-projects' not in plan.purge
