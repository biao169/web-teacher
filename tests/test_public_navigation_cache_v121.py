"""Fixed entries: no-query, configured public scope and anonymous success only."""
import pytest
from justhtml import JustHTML
from test_public_navigation_v88 import fixture,entry,add,run
from backend.app.public_performance import navigation_target,page_request
from types import SimpleNamespace

@pytest.mark.parametrize('kind',['local','r2'])
@pytest.mark.parametrize('lang',['zh','en'])
def test_public_fixed_entry_success_anonymous_short_cache_and_single_resolution(fixture,kind,lang):
    c,r=fixture;r.kind=kind;entry(r);add(r,'projects','人工智能',amount='987654',principal='SECRET_PERSON')
    queries=[];old=r.sql.query
    async def query(sql,args=()):
        queries.append(sql);return await old(sql,args)
    r.sql.query=query
    path='/'+lang+'/n/ai-projects';response=c.get(path)
    assert response.status_code==200
    assert response.headers['cache-control']=='public, max-age=60'
    assert response.headers['cloudflare-cdn-cache-control']=='public, max-age=120, stale-while-revalidate=30, stale-if-error=300'
    assert response.headers['x-teacher-render-ok']=='1' and 'set-cookie' not in response.headers
    assert 'public-projects' in response.headers['cache-tag'] and 'public-layout' in response.headers['cache-tag']
    assert 'SECRET_PERSON' not in response.text and '987654' not in response.text
    doc=JustHTML(response.text,sanitize=False);assert doc.query('[data-public-session] [data-auth-open]')
    assert not doc.query('[data-public-session] .academic-username')
    assert sum('FROM navigation_items WHERE url_name=' in sql for sql in queries)==1
    assert not any('FROM auth_sessions' in sql for sql in queries)
    c.cookies.clear();anonymous=c.get(path)
    assert anonymous.text==response.text and anonymous.headers['etag']==response.headers['etag']
    head=c.head(path);assert head.status_code==200 and head.content==b'' and head.headers['cache-control']=='public, max-age=60'
    conditional=c.get(path,headers={'If-None-Match':response.headers['etag']});assert conditional.status_code==304 and conditional.content==b'' and conditional.headers['cache-control']=='public, max-age=60'

@pytest.mark.parametrize('query',['direction=asc&size=10','s=eyJmLnNvdXJjZSI6IuaXt-WutuWfuumHkSJ9','page=2','q=test','nv='+'a'*32,'x=1'])
def test_any_visitor_query_is_never_shared(fixture,query):
    c,r=fixture;entry(r);add(r,'projects','人工智能');response=c.get('/en/n/ai-projects?'+query)
    assert response.headers['cache-control']=='no-store' and response.headers['cloudflare-cdn-cache-control']=='no-store'
    assert 'x-teacher-render-ok' not in response.headers and 'cache-tag' not in response.headers

@pytest.mark.parametrize('extra',[{'enabled':0},{'visibility':'hidden'},{'visibility':'authenticated'},{'visibility':'staff'}])
def test_unavailable_entry_never_caches(fixture,extra):
    c,r=fixture;entry(r,**extra);c.cookies.clear();response=c.get('/en/n/ai-projects')
    assert response.status_code==404 and response.headers['cache-control']=='no-store' and response.headers['cloudflare-cdn-cache-control']=='no-store'
    assert 'x-teacher-render-ok' not in response.headers

def test_authenticated_private_entry_remains_dynamic(fixture):
    c,r=fixture;entry(r,visibility='authenticated');add(r,'projects','人工智能',principal='PRIVATE_PERSON');response=c.get('/en/n/ai-projects')
    assert response.status_code==200 and 'PRIVATE_PERSON' in response.text
    assert response.headers['cache-control']=='no-store' and 'x-teacher-render-ok' not in response.headers

def test_bad_configuration_and_missing_entry_are_not_success(fixture):
    c,r=fixture;uid=entry(r)
    run(r.sql.batch([('UPDATE navigation_items SET path=? WHERE uid=?',('/admin',uid))]))
    for path in ['/en/n/ai-projects','/en/n/missing']:
        response=c.get(path);assert response.status_code==404 and response.headers['cache-control']=='no-store'

@pytest.mark.parametrize('suffix',['?direction=asc','?s=x','/detail','/','?nv=x','?'])
def test_static_allowlist_never_collapses_queries_or_details(suffix):
    request=SimpleNamespace(method='GET',url='https://site.test/en/n/nav-generic'+suffix,headers={})
    # An empty query delimiter has no actual query values; frameworks normalize it.
    if suffix=='?':assert page_request(request)
    else:assert navigation_target(request) is None and not page_request(request)

@pytest.mark.parametrize('status',[400,404,500,503])
def test_fixed_entry_error_cannot_acquire_success_cache_headers(status):
    from test_public_page_v102 import request
    from fastapi.responses import HTMLResponse
    from backend.app.native.public_http_cache import finish
    req=request('/en/n/any');req.state.public_navigation_scope={'slug':'any','table':'projects','conditions':[{'field':'name','operator':'contains','value':'AI'}]}
    response=finish(req,HTMLResponse('error',status_code=status),public_ok=True)
    assert response.headers['cache-control']=='no-store' and response.headers['cloudflare-cdn-cache-control']=='no-store'
    assert 'x-teacher-render-ok' not in response.headers

def test_success_body_without_server_validated_navigation_scope_is_not_cacheable():
    from test_public_page_v102 import request
    from fastapi.responses import HTMLResponse
    from backend.app.native.public_http_cache import finish
    response=finish(request('/en/n/any'),HTMLResponse('not validated'),public_ok=True)
    assert response.headers['cache-control']=='no-store'
