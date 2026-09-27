"""Real SQLite/routes/templates, with disposable fixture accounts and no external APIs."""
import asyncio
from html.parser import HTMLParser
import pytest
from list_fixture import client_at
from backend.app.native.catalog import MODULES, TABLES
from backend.app.native.auth import Auth


class Rows(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.uids = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'tr' and 'data-uid' in attrs:
            self.uids.append(attrs['data-uid'])


@pytest.fixture(scope='module')
def fixture(tmp_path_factory):
    client, r = client_at(tmp_path_factory.mktemp('list-regression'))
    yield client, r
    client.close()


@pytest.mark.parametrize('table', [t for t in MODULES if t in TABLES])
def test_all_module_lists_and_fragments(fixture, table):
    client, _ = fixture
    page = client.get('/admin/' + table)
    assert page.status_code == 200, page.text
    assert 'data-list-load-status' in page.text
    assert 'native-table-headers.js?v=0.15.38' in page.text
    assert 'quill.js' not in page.text
    fragment = client.get('/admin/' + table, headers={'X-Native-List': '1'})
    assert fragment.status_code == 200
    assert 'data-table="' + table + '"' in fragment.json()['html']
    assert fragment.json()['session']


@pytest.mark.parametrize('size', [10, 20, 50, 100])
def test_sort_filter_and_pagination(fixture, size):
    client, r = fixture
    base = '/admin/profiles?size=' + str(size)
    a = Rows(client.get(base + '&sort=name&direction=asc').text).uids
    b = Rows(client.get(base + '&sort=name&direction=desc').text).uids
    assert len(a) == 3 and a == list(reversed(b))
    selected = Rows(client.get(base + '&c.name=Bravo').text).uids
    assert selected == [a[1]]
    filtered = client.get(base + '&f.is_active=0&q=Alpha')
    assert filtered.status_code == 200
    assert Rows(filtered.text).uids == []
    assert len(Rows(client.get(base + '&c.name=missing').text).uids) == 0
    page = client.get(base + '&page=999', headers={'X-Native-List': '1'}).json()
    assert 'page=1' in page['url']


def test_static_modules_correct_mime_and_cache(fixture):
    client, _ = fixture
    for filename in ('native.js', 'native-list.js', 'native-table-headers.js', 'native-columns.js'):
        response = client.get('/assets/admin/js/' + filename + '?v=0.15.32')
        assert response.status_code == 200
        assert response.headers['content-type'].startswith('text/javascript')
        assert response.headers['cache-control'] == 'no-cache'


def test_toggle_guards_and_fragment(fixture):
    client, r = fixture
    p = asyncio.run(Auth(r.sql, r.passwords).principal(client.cookies.get('ts_session')))
    row = asyncio.run(r.sql.query('SELECT * FROM profiles ORDER BY id LIMIT 1'))[0]
    payload = {'_csrf': p['csrf'], 'stamp': row['updated_at'], 'action': 'toggle', 'field': 'is_featured', 'value': 1}
    url = '/api/admin/profiles/' + row['uid']
    assert client.post(url, json=payload).status_code == 403
    assert client.post(url, json={**payload, '_csrf': 'invalid-test-token'}, headers={'Origin': r.config.origin}).status_code == 403
    response = client.post(url, json=payload, headers={'Origin': r.config.origin})
    assert response.status_code == 200, response.text
    assert response.json()['row']['value'] == 1
    assert response.json()['row']['updated_at'] != row['updated_at']
    assert client.post(url, json=payload, headers={'Origin': r.config.origin}).status_code == 409
    assert client.get('/admin/profiles?sort=name', headers={'X-Native-List': '1'}).status_code == 200


def test_no_script_and_news_editor_assets(fixture):
    client, _ = fixture
    page = client.get('/admin/profiles').text
    assert '<noscript>' in page and 'method="get"' in page
    assert 'quill.js' in client.get('/admin/news/new').text
