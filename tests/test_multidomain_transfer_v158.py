"""Two hosts share transfer state, with real HTTP/session checks on both adapters."""
import pytest
from fastapi.testclient import TestClient
from backend.app.config import PROJECT_ROOT
from backend.app.native.auth import Auth
from backend.app.native.storage import LocalStore
from backend.app.native.web import create_app
from backend.app.security.http import AuthConfig
from list_fixture import client_at
from test_multidomain_web_v157 import A, B, login, run
from test_transfer_lan_v68 import KEY, RECEIVE


@pytest.fixture(params=['local', 'worker'])
def hosts(tmp_path, request):
    seed, r = client_at(tmp_path, A)
    seed.close()
    r.config = AuthConfig.from_origin(A, B)
    app = create_app(lambda req: r, PROJECT_ROOT if request.param == 'local' else None)
    if request.param == 'worker':
        from deploy.cloudflare.runtime.transfer import install
        source = PROJECT_ROOT / 'transfer/frontend/native'
        templates = {p.name: p.read_text() for p in source.glob('*.html')}
        store, cache = LocalStore(tmp_path/'objects'), LocalStore(tmp_path/'cache')
        install(app, lambda req: r, templates, (source/'transfer-i18n-catalog.js').read_text(), lambda main: (store, cache))
    a, b = TestClient(app, base_url=A), TestClient(app, base_url=B)
    headers = []
    for client, origin in [(a, A), (b, B)]:
        assert login(client, origin).status_code == 200
        p = run(Auth(r.sql, r.passwords).principal(client.cookies.get('__Host-ts_session')))
        headers.append({'Origin': origin, 'X-CSRF-Token': p['csrf']})
    assert a.get('/transfer/').status_code == 200
    reply = a.post('/transfer/api/settings', json={'revision': 0, 'enabled': True, 'vpnGuard': False, 'temporaryShare': True, 'temporaryMaxDownloads': 3, 'relayEnabled': True}, headers=headers[0])
    assert reply.status_code == 200, reply.text
    try:
        yield a, b, r, *headers
    finally:
        a.close()
        b.close()


def test_alias_upload_primary_receive_and_code(hosts):
    a, b, r, ha, hb = hosts
    reply = b.post('/transfer/api/tasks', json={'name': 'alias.txt', 'size': 4}, headers=hb)
    assert reply.status_code == 200, reply.text
    task = reply.json()
    assert b.post('/transfer/api/tasks/'+task['id']+'/chunk', content=b'test', headers={**hb, 'X-Offset': '0'}).status_code == 200
    assert a.get('/transfer/s/'+task['token']).content == b'test'
    issued = b.post('/transfer/api/codes/issue', json={'mode': 'offline', 'target': task['id']}, headers=hb)
    assert issued.status_code == 200, issued.text
    code = issued.json()['code']
    reply = a.post('/transfer/api/codes/resolve', json={'code': code}, headers=ha)
    assert reply.status_code == 200, reply.text
    assert a.get('/transfer/s/'+reply.json()['token']).content == b'test'
    assert b.post('/transfer/api/share-info', json={'token': task['token']}, headers=hb).status_code == 200
    assert b.get('/transfer/').status_code == 200
    assert 'transfer-origins' in b.get('/transfer/').text
    assert r.config.origin == A


@pytest.mark.parametrize('mode', ['lan', 'relay'])
def test_live_codes_pair_across_hosts(hosts, mode):
    a, b, r, ha, hb = hosts
    reply = b.post('/transfer/api/'+mode+'/create', json={'key': KEY, 'name': 'live.bin', 'size': 12}, headers=hb)
    assert reply.status_code == 200, reply.text
    target = reply.json()['code']
    issued = b.post('/transfer/api/codes/issue', json={'mode': mode, 'target': target, 'key': KEY}, headers=hb)
    assert issued.status_code == 200, issued.text
    reply = a.post('/transfer/api/codes/resolve', json={'code': issued.json()['code'], 'key': RECEIVE}, headers=ha)
    assert reply.status_code == 200, reply.text
    assert reply.json()['session']['role'] == 'receive'


@pytest.mark.parametrize('path', ['tasks', 'lan/create', 'relay/create', 'codes/resolve', 'share-info', 'receive'])
def test_wrong_origin_and_csrf_never_pass(hosts, path):
    a, b, r, ha, hb = hosts
    url = '/transfer/api/' + path
    for headers in [{**hb, 'Origin': A}, {**hb, 'X-CSRF-Token': 'wrong'}, {**hb, 'Sec-Fetch-Site': 'same-site'}]:
        assert b.post(url, json={}, headers=headers).status_code == 403
    b.cookies.clear()
    if path != 'tasks':
        assert b.post(url, json={}, headers={'Origin': A}).status_code == 403
    assert not run(r.sql.query('SELECT id FROM temporary_shares'))


def test_alias_login_redirect_and_unknown_host(hosts):
    a, b, r, ha, hb = hosts
    b.cookies.clear()
    assert b.get('/transfer/login', follow_redirects=False).headers['location'].startswith('/auth/login?')
    assert b.get('/transfer/', headers={'Host': 'evil.example.org', 'X-Forwarded-Host': 'lab.example.org'}).status_code == 400
