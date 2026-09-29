from xml.etree.ElementTree import fromstring
from urllib.parse import urlsplit
from test_accounts_regression import fixture,run
from test_public_home_step2 import add
from backend.app.native.public_data import PUBLIC_FIELDS
from backend.app.native import public_seo
from backend.app.native.catalog import TABLES


def urls(response):
    assert response.status_code==200,response.text
    assert 'application/xml' in response.headers['content-type']
    return [e.text for e in fromstring(response.content).iter('{'+public_seo.NS+'}loc')]

def test_index_and_all_public_routes(fixture):
    c,r=fixture
    for table in PUBLIC_FIELDS:add(r,table,'PublicSEO',**({'is_active':1} if 'is_active' in TABLES[table]['columns'] else {}))
    maps=urls(c.get('/sitemap.xml'))
    assert len(maps)==len(PUBLIC_FIELDS)+1
    for sitemap in maps:
        for url in urls(c.get(sitemap)):
            assert url.startswith(r.config.origin+'/')
            page=c.get(url)
            assert page.status_code==200,(url,page.text)
            assert 'rel="canonical"' in page.text

def test_visibility_independent_of_admin_cookie_and_fresh(fixture):
    c,r=fixture
    good=add(r,'profiles','PublicSEO',is_active=1)
    hidden=add(r,'profiles','HiddenSEO',visibility='hidden',is_active=1)
    inactive=add(r,'profiles','InactiveSEO',is_active=0)
    future=add(r,'news','FutureSEO')
    run(r.sql.batch([('UPDATE news SET published_at=? WHERE uid=?',('2999-01-01T00:00:00.000Z',future))]))
    before=c.get('/sitemap-profiles-1.xml').text
    assert good in before and hidden not in before and inactive not in before
    assert future not in c.get('/sitemap-news-1.xml').text
    c.cookies.clear()
    assert c.get('/sitemap-profiles-1.xml').text==before
    run(r.sql.batch([('UPDATE profiles SET visibility=? WHERE uid=?',('hidden',good))]))
    assert good not in c.get('/sitemap-profiles-1.xml').text

def test_paged_cards_without_new_detail_pages_and_sharding(fixture,monkeypatch):
    c,r=fixture
    for i in range(23):add(r,'projects','SeoProject'+str(i))
    monkeypatch.setattr(public_seo,'SLICE',2)
    maps=urls(c.get('/sitemap.xml'))
    selected=[u for u in maps if '/sitemap-projects-' in u]
    assert len(selected)==2
    pages=[u for part in selected for u in urls(c.get(part))]
    assert r.config.origin+'/en/projects?page=3' in pages
    assert not any('/projects/' in u for u in pages)
    assert len(pages)==len(set(pages))
    for u in pages:
        p=c.get(u)
        assert p.status_code==200
        assert 'href="'+u+'"' in p.text
    assert c.get('/sitemap-projects-3.xml').status_code==404
    assert c.get('/sitemap-auth_users-1.xml').status_code==404

def test_robots_origin_and_no_source_exposure(fixture):
    c,r=fixture
    response=c.get('/robots.txt',headers={'X-Forwarded-Host':'evil.example'})
    assert response.status_code==200
    assert 'Sitemap: '+r.config.origin+'/sitemap.xml' in response.text
    assert 'evil.example' not in response.text
    assert 'Disallow: /assets/' not in response.text
    assert 'Disallow: /admin' in response.text
    for path in ('/backend/app/native/web.py','/deploy/linux/tweb.py','/.env','/data/database/site.sqlite3','/install.sh'):
        assert c.get(path).status_code==404
    assert c.get('/admin').headers['x-robots-tag']=='noindex, nofollow'
    assert c.get('/assets/shared/css/base.css').status_code==200
    from backend.app.security.http import AuthConfig
    r.config=AuthConfig.from_origin('https://school.example')
    response=c.get('/robots.txt',headers={'Host':'school.example'})
    assert 'Sitemap: https://school.example/sitemap.xml' in response.text
    assert all(u.startswith('https://school.example/') for u in urls(c.get('/sitemap.xml',headers={'Host':'school.example'})))

def test_detail_shards_have_no_gaps_or_duplicates(fixture,monkeypatch):
    c,r=fixture
    keys={add(r,'profiles','FacultySEO'+str(i),is_active=1) for i in range(7)}
    monkeypatch.setattr(public_seo,'SLICE',2)
    maps=[u for u in urls(c.get('/sitemap.xml')) if '/sitemap-profiles-' in u]
    found=[u for m in maps for u in urls(c.get(m))]
    assert len(found)==len(set(found))
    assert all(r.config.origin+'/en/profiles/'+key in found and r.config.origin+'/zh/profiles/'+key in found for key in keys)
    assert all(len(urls(c.get(m)))<=4 for m in maps)
