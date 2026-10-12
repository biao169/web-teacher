"""Public migration baseline: real routes, database and failure responses."""
import asyncio
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from test_accounts_regression import fixture
from backend.app.native.auth import Auth
from backend.app.native.web_public import create_public_app
from backend.app.public_performance import PublicPerformance, LEGACY_CACHE_KEYS
from runtime.cache_policy import policy, variables, edge_cache, entrypoint_cache
from runtime.public_page import eligible


@pytest.mark.parametrize('kind', ['local', 'r2'])
@pytest.mark.parametrize('path', ['/en', '/zh/profiles', '/en/projects', '/zh/publications'])
def test_successful_public_read_and_head(fixture, kind, path):
    client, r = fixture
    r.kind = kind
    assert not hasattr(r.sql, 'public_cache')
    with patch.object(Auth, 'principal', side_effect=AssertionError('public full auth')), patch.object(Auth, 'public_principal', side_effect=AssertionError('public light auth')):
        response = client.get(path, headers={'If-None-Match': '"not-current"', 'Authorization': 'Bearer ignored'})
        assert response.status_code == 200
        assert response.headers['cache-control'] == 'public, max-age=1800'
        assert response.headers['X-Teacher-Render-OK'] == '1'
        assert 'etag' in response.headers
        assert 'X-Public-Page-Cache' not in response.headers
        assert 'name="_csrf"' not in response.text
        assert 'public-prefetch.js' not in response.text
        assert 'public-recovery.js' not in response.text
        assert client.head(path).content == b''


def test_reads_observe_database_changes_without_cache(fixture):
    client, r = fixture
    asyncio.run(r.sql.batch([("INSERT INTO projects(uid,name,visibility) VALUES('baseline','Before','public')", ())]))
    assert 'Before' in client.get('/zh/projects').text
    asyncio.run(r.sql.batch([("UPDATE projects SET name='After' WHERE uid='baseline'", ())]))
    response = client.get('/zh/projects')
    assert 'After' in response.text and 'Before' not in response.text


def test_fragment_and_private_data_boundary(fixture):
    client, r = fixture
    asyncio.run(r.sql.batch([("INSERT INTO projects(uid,name,visibility,principal,members) VALUES('boundary','Public','public','PRIVATE-PI','PRIVATE-MEMBERS')", ())]))
    response = client.get('/zh/projects', headers={'X-Public-Fragment': '1'})
    assert response.status_code == 200 and isinstance(response.json()['html'], str)
    assert 'PRIVATE-PI' not in response.text and 'PRIVATE-MEMBERS' not in response.text
    assert response.headers['cache-control'] == 'no-store' and 'etag' not in response.headers
    client.cookies.clear()
    assert client.get('/admin', follow_redirects=False).status_code in (302, 303, 401)
    assert client.get('/api/public/session-summary').headers['cache-control'] == 'private, no-store'


@pytest.mark.parametrize('kind', ['local', 'r2'])
def test_render_failure_remains_uncached_500(fixture, kind):
    _, r = fixture
    r.kind = kind
    with TestClient(create_public_app(lambda request: r), base_url=r.config.origin, raise_server_exceptions=False) as client:
        with patch.object(r.renderer, 'render', side_effect=RuntimeError('synthetic render failure')):
            failed = client.get('/en/projects')
        assert failed.status_code == 500
        assert failed.headers['cache-control'] == failed.headers['cloudflare-cdn-cache-control'] == 'no-store'
        assert 'X-Public-Recovery' not in failed.headers
        assert client.get('/en/projects').status_code == 200


def test_legacy_settings_cannot_reenable_cache():
    env = dict.fromkeys(LEGACY_CACHE_KEYS, 'full')
    env['TEACHER_PUBLIC_STREAM_CONCURRENCY'] = '4'
    assert PublicPerformance.from_env(env).public_stream_concurrency == 4
    assert policy(env).public_stream_concurrency == 1
    assert not set(LEGACY_CACHE_KEYS).intersection(variables(env))
    assert edge_cache(env)['enabled'] is False
    assert not entrypoint_cache(env)['default']['cache']['enabled']
    assert entrypoint_cache(env)['PublicPage']['cache']['enabled']
    assert eligible(SimpleNamespace(method='GET', url='https://example.edu/en',headers={}), env) is True


@pytest.mark.parametrize('value', ['0', '5', 'bad', '1.0'])
def test_stream_concurrency_is_validated(value):
    with pytest.raises(ValueError):
        PublicPerformance.from_env({'TEACHER_PUBLIC_STREAM_CONCURRENCY': value})
