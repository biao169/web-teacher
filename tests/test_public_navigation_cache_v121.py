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

@pytest.mark.parametrize('lang',['zh','en'])
def test_configured_navigation_links_and_reset_keep_bare_cacheable_entry(fixture,lang):
    """Header/hero/footer must not manufacture default query combinations."""
    from urllib.parse import urlsplit
    c,r=fixture
    slugs={'header':'probe-header','hero':'probe-hero','footer':'probe-footer'}
    for location,slug in slugs.items():entry(r,slug=slug,location=location)
    add(r,'projects','人工智能');c.cookies.clear()
    response=c.get('/'+lang);assert response.status_code==200
    doc=JustHTML(response.text,sanitize=False)
    targets={a.attrs.get('href') for a in doc.query('a[href]')}
    for slug in slugs.values():
        target='/'+lang+'/n/'+slug;assert target in targets
        parts=urlsplit(target);assert not parts.query and not parts.fragment
        assert page_request(SimpleNamespace(method='GET',url='https://site.test'+target,headers={}))
    for slug in slugs.values():
        html=c.get('/'+lang+'/n/'+slug);assert html.status_code==200
        nodes=JustHTML(html.text,sanitize=False).query('[data-person-reset]')
        assert nodes and nodes[0].attrs['href']=='/'+lang+'/n/'+slug
        assert html.headers['cache-control']=='public, max-age=60'

@pytest.mark.parametrize('lang',['zh','en'])
@pytest.mark.parametrize('query',['page=1','direction=asc','size=10','direction=asc&size=10'])
def test_default_control_queries_still_bypass_shared_entry_cache(fixture,lang,query):
    """Measure the boundary; don't silently fold query requests into the shared object."""
    c,r=fixture;entry(r);add(r,'projects','人工智能');c.cookies.clear()
    response=c.get('/'+lang+'/n/ai-projects?'+query)
    assert response.status_code==200
    assert response.headers['cache-control']=='no-store'
    assert response.headers['cloudflare-cdn-cache-control']=='no-store'
    assert 'x-teacher-render-ok' not in response.headers


def test_request_navigation_reuses_rows_but_separates_language_and_visible_scopes(fixture):
    from backend.app.native.public_footer import navigation
    c,r=fixture
    entry(r,slug='memo-public',title='PUBLIC_TITLE',title_en='Public English')
    entry(r,slug='memo-private',visibility='authenticated',title='PRIVATE_TITLE',title_en='Private English')
    r.public_render_reads={};r.p=None;queries=[];old=r.sql.query
    async def query(sql,args=()):queries.append(sql);return await old(sql,args)
    r.sql.query=query
    try:
        en=run(navigation(r,'en'));assert 'Public English' in str(en) and 'Private English' not in str(en)
        # Caller mutation must not poison the cached display or original language.
        target=next(item for item in en['header'] if item['title']=='Public English');target['title']='MUTATED'
        again=run(navigation(r,'en'));assert 'MUTATED' not in str(again) and 'Public English' in str(again)
        zh=run(navigation(r,'zh'));assert 'PUBLIC_TITLE' in str(zh) and 'Public English' not in str(zh)
        assert sum('FROM navigation_items WHERE enabled=1' in sql for sql in queries)==1
        r.p={'scopes':['public']}
        auth=run(navigation(r,'en'));assert 'Private English' in str(auth)
        assert sum('FROM navigation_items WHERE enabled=1' in sql for sql in queries)==2
        r.p=None;assert 'Private English' not in str(run(navigation(r,'en')))
    finally:r.sql.query=old
