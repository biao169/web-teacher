"""Exercise shared web routes on two HTTPS hosts with separate browser cookie jars."""
import asyncio
import re
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from backend.app.config import Settings, PROJECT_ROOT
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from backend.app.native.runtime import local
from backend.app.native.web import create_app
from backend.app.native.media_links import MediaLinks
from backend.app.security.http import AuthConfig
from list_fixture import client_at
from test_media_regression import PNG

run = asyncio.run
A, B = 'https://teacher.example.org', 'https://lab.example.org'


@pytest.fixture
def site(tmp_path):
    seed, r = client_at(tmp_path, A)
    seed.close()
    r.config = AuthConfig.from_origin(A, B)
    app = create_app(lambda request: r, PROJECT_ROOT)
    # Route tests do not start the unrelated background sync/maintenance lifespans.
    a, b = TestClient(app, base_url=A), TestClient(app, base_url=B)
    try:
        yield a, b, r
    finally:
        a.close()
        b.close()


def challenge(client, path='/auth/login'):
    response = client.get(path)
    assert response.status_code == 200
    return re.search('name="challenge" value="([^"]+)"', response.text)[1]


def login(client, origin, **extra):
    return client.post('/auth/login', data=dict(challenge=challenge(client), username='list-test-admin', password='Synthetic-test-only-032', **extra), headers={'Origin': origin, 'Accept': 'application/json'})


def test_independent_login_logout_and_cookie_domains(site):
    a, b, r = site
    for client, origin in [(a, A), (b, B)]:
        response = login(client, origin, next='/en/students')
        assert response.status_code == 200 and response.json()['redirect'] == '/en/students'
        assert 'Domain=' not in response.headers['set-cookie']
        assert client.get('/admin').status_code == 200
    sa, sb = [c.cookies.get('__Host-ts_session') for c in (a, b)]
    assert sa != sb
    auth = Auth(r.sql, r.passwords)
    principal = run(auth.principal(sb))
    response = b.post('/auth/logout', data={'_csrf': principal['csrf']}, headers={'Origin': B}, follow_redirects=False)
    assert response.status_code == 303 and response.headers['location'] == '/auth/login'
    assert run(auth.principal(sb)) is None and run(auth.principal(sa)) is not None
    assert a.get(B + '/admin', follow_redirects=False).status_code in (303, 401)


@pytest.mark.parametrize('headers', [{'Origin': A}, {'Origin': 'null'}, {}, {'Origin': B, 'Sec-Fetch-Site': 'same-site'}, {'Origin': B, 'Sec-Fetch-Site': 'cross-site'}])
def test_alias_login_rejects_wrong_origin(site, headers):
    a, b, r = site
    response = b.post('/auth/login', data=dict(challenge=challenge(b), username='list-test-admin', password='Synthetic-test-only-032'), headers={**headers, 'Accept': 'application/json'})
    assert response.status_code == 403
    assert not b.cookies.get('__Host-ts_session')


def test_alias_registration_and_contact(site):
    a, b, r = site
    run(r.sql.batch([('UPDATE global_settings SET allow_public_registration=1', ())]))
    response = b.post('/auth/register', data=dict(challenge=challenge(b, '/auth/register'), username='alias-user', password='Synthetic-only-157'), headers={'Origin': B, 'Accept': 'application/json'})
    assert response.status_code == 200 and response.json()['registered']
    assert run(r.sql.query("SELECT uid FROM auth_users WHERE username='alias-user'"))
    assert login(b, B).status_code == 200
    for origin, status in [(A, 403), (B, 200)]:
        response = b.post('/en/contact', data=dict(challenge=challenge(b, '/en/contact'), name='Alias', content='Origin test'), headers={'Origin': origin, 'Accept': 'application/json'})
        assert response.status_code == status
    assert len(run(r.sql.query("SELECT uid FROM messages WHERE content='Origin test'"))) == 1


def test_media_upload_csrf_and_all_alias_links(site):
    a, b, r = site
    assert login(b, B).status_code == 200
    auth = Auth(r.sql, r.passwords)
    principal = run(auth.principal(b.cookies.get('__Host-ts_session')))
    for origin, csrf, status in [(A, principal['csrf'], 403), (B, 'wrong', 403), (B, principal['csrf'], 200)]:
        response = b.post('/api/admin/media/upload/file', content=PNG, headers={'Origin': origin, 'X-CSRF-Token': csrf, 'X-Filename': 'alias.png', 'Accept': 'application/json'})
        assert response.status_code == status, response.text
    rows = run(r.sql.query('SELECT * FROM media_assets'))
    assert len(rows) == 1
    row = rows[0]
    r.auth, r.p, r.content = auth, principal, Content(r.sql, auth)
    links = MediaLinks(r)
    for origin in (A, B):
        assert run(links.resolve(origin + '/media/' + row['uid'], ('image/png',)))['object_key'] == row['object_key']
    assert links.pending == {}
    assert b.get('/api/admin/media/' + row['uid'] + '/content').content == PNG


def test_alias_seo_keeps_primary_and_unlisted_host_fails(site):
    a, b, r = site
    page = b.get('/en')
    assert page.status_code == 200
    assert 'href="' + A + '/en"' in page.text
    assert B not in b.get('/sitemap-home.xml').text
    assert A in b.get('/sitemap-home.xml').text
    assert b.get('/en', headers={'Host': 'evil.example.org', 'X-Forwarded-Host': 'lab.example.org'}).status_code == 400
    assert r.config.origin == A


def test_worker_setup_on_alias_preserves_token_and_origin_checks(tmp_path):
    from deploy.cloudflare.runtime.setup import install
    r = local(Settings(tmp_path))
    r.config = AuthConfig.from_origin(A, B)
    app = create_app(lambda request: r, PROJECT_ROOT)
    install(app, lambda request: r)

    @app.middleware('http')
    async def environment(request, call_next):
        request.scope['env'] = SimpleNamespace(TEACHER_SETUP_TOKEN='s' * 32)
        return await call_next(request)

    client = TestClient(app, base_url=B)
    try:
        data = dict(token='s' * 32, username='alias-admin', password='Synthetic-only-157', confirm='Synthetic-only-157')
        assert client.post('/setup', data=data, headers={'Origin': A}).status_code == 403
        assert client.post('/setup', data={**data, 'token': 'wrong'}, headers={'Origin': B}).status_code == 403
        assert not run(r.sql.query('SELECT uid FROM auth_users'))
        assert client.post('/setup', data=data, headers={'Origin': B}).status_code == 200
        assert len(run(r.sql.query('SELECT uid FROM auth_users'))) == 1
        assert client.get('/setup').status_code == 404

    finally:
        client.close()
