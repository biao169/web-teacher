"""Success-only PublicPage: real HTML, visibility and cache boundary checks."""
import asyncio
from unittest.mock import patch

import pytest
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.testclient import TestClient
from starlette.requests import Request
from test_accounts_regression import fixture
from backend.app.public_performance import page_request, PUBLIC_EDGE_POLICY
from backend.app.native.public_http_cache import finish
from backend.app.native.web_common import create_base


def request(path='/en', method='GET', headers=()):
    from urllib.parse import urlsplit
    url=urlsplit(path)
    return Request({'type':'http','method':method,'scheme':'https','server':('site.example',443),
                    'path':url.path,'query_string':url.query.encode(),'headers':list(headers)})


@pytest.mark.parametrize('path', ['/en','/zh','/en/profiles','/zh/projects','/en/publications',
                                  '/zh/students','/en/news','/en/courses/id-123','/zh/profiles/uid_123',
                                  '/en/profiles/id?from=%2Fen%2Fprofiles'])
def test_static_allowlist(path):
    assert page_request(request(path))
    assert page_request(request(path, 'HEAD'))


@pytest.mark.parametrize('path', ['/en/','/en/projects?sort=name','/zh/profiles?page=2','/en?x=1',
                                  '/en/n/custom?q=x','/en/news/id','/en/projects/id','/en/profiles/..',
                                  '/admin','/auth/login','/api/public/session-summary','/sync/v1/read',
                                  '/transfer','/en/contact','/en/profiles/id?from=%2Fen%2Fprofiles%3Fpage%3D2'])
def test_dynamic_routes_excluded(path):
    assert not page_request(request(path))


@pytest.mark.parametrize('headers', [[(b'x-public-fragment',b'1')],[(b'range',b'bytes=0-2')],
                                     [(b'if-match',b'*')],[(b'if-unmodified-since',b'old')],
                                     [(b'accept',b'APPLICATION/JSON')]])
def test_unsafe_representations_excluded(headers):
    assert not page_request(request(headers=headers))


@pytest.mark.parametrize('path', ['/en','/zh/profiles','/en/projects','/zh/publications'])
def test_success_and_conditional_response(fixture,path):
    c,r=fixture
    first=c.get(path)
    assert first.status_code==200 and first.headers['x-teacher-render-ok']=='1'
    assert first.headers['cache-control']=='public, max-age=1800'
    assert first.headers['cloudflare-cdn-cache-control']==PUBLIC_EDGE_POLICY
    assert 'Cookie' not in first.headers['vary']
    assert c.get(path,headers={'If-None-Match':first.headers['etag']}).status_code==304
    assert c.get(path,headers={'If-None-Match':'"different"'}).status_code==200
    head=c.head(path)
    assert head.status_code==200 and not head.content and head.headers['etag']==first.headers['etag']
    assert head.headers['content-length']==first.headers['content-length']


@pytest.mark.parametrize('status', [200,400,404,500,503])
def test_unmarked_html_error_never_cached(status):
    result=finish(request(),HTMLResponse('<h1>Error template</h1>',status_code=status))
    assert result.headers['cache-control']==result.headers['cloudflare-cdn-cache-control']=='no-store'
    assert 'etag' not in result.headers and 'x-teacher-render-ok' not in result.headers


def test_wrong_type_cookie_or_dynamic_url_never_cached():
    for req,response in [(request(),JSONResponse({'error':'not HTML'})),
                         (request('/en?sort=x'),HTMLResponse('result')),
                         (request(method='POST'),HTMLResponse('result'))]:
        result=finish(req,response,public_ok=True)
        assert result.headers['cache-control']=='no-store'
    response=HTMLResponse('private');response.set_cookie('session','secret')
    assert finish(request(),response,public_ok=True).headers['cache-control']=='no-store'


def test_middleware_refuses_unmarked_200_error_template(fixture):
    _,r=fixture
    app,resources,_,_=create_base(lambda request:r)
    @app.get('/en')
    async def error_page(req:Request):
        await resources(req)
        return HTMLResponse('<h1>Operation failed</h1>',headers={'Cache-Control':'public, max-age=1800'})
    with TestClient(app,base_url=r.config.origin) as c:
        response=c.get('/en')
    assert response.status_code==200 and response.headers['cache-control']=='no-store'
    assert response.headers['cloudflare-cdn-cache-control']=='no-store'


def test_detail_visibility_precedes_conditional_304(fixture):
    c,r=fixture
    asyncio.run(r.sql.batch([("INSERT INTO profiles(uid,name,visibility,is_active) VALUES('page102','Public name','public',1)",())]))
    first=c.get('/en/profiles/page102')
    assert first.status_code==200 and first.headers['x-teacher-render-ok']=='1'
    linked=c.get('/en/profiles/page102?from=%2Fen%2Fprofiles')
    assert linked.status_code==200 and linked.headers['x-teacher-render-ok']=='1'
    assert linked.content==first.content
    asyncio.run(r.sql.batch([("UPDATE profiles SET visibility='hidden' WHERE uid='page102'",())]))
    gone=c.get('/en/profiles/page102',headers={'If-None-Match':first.headers['etag']})
    assert gone.status_code==404 and gone.headers['cache-control']=='no-store'
    assert 'x-teacher-render-ok' not in gone.headers


def test_query_fragment_form_and_news_details_no_store(fixture):
    c,r=fixture
    asyncio.run(r.sql.batch([("INSERT INTO news(uid,title,slug,visibility,allow_comments,published_at) VALUES('form102','News','form102','public',1,'2020-01-01T00:00:00.000Z')",())]))
    for path,headers in [('/en/projects?page=2',{}),('/en/projects',{'X-Public-Fragment':'1'}),
                         ('/en/contact',{}),('/en/news/form102',{})]:
        response=c.get(path,headers=headers)
        assert response.headers['cache-control']=='no-store'
        assert response.headers['cloudflare-cdn-cache-control']=='no-store'
        assert 'x-teacher-render-ok' not in response.headers
