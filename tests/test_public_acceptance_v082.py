"""Fault regression against disposable SQLite; Worker uses the real resource branch,
not live Cloudflare D1, Cache or isolate limits."""
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from test_accounts_regression import fixture
from backend.app.native.web_public import create_public_app
from backend.app.public_performance import PublicPerformance

@pytest.mark.parametrize('platform', ['local', 'simple', 'off'])
@pytest.mark.parametrize('method', ['get', 'head'])
def test_cold_failure_then_fresh_success(fixture, platform, method):
    _, r = fixture
    if platform != 'local':
        r.kind = 'worker'
        r.worker_cache_mode = platform
        r.public_request_cache = False
    if platform == 'off':
        r.public_performance = PublicPerformance(public_cache_ttl_seconds=0, public_page_cache_ttl_seconds=0)
    with TestClient(create_public_app(lambda request: r), base_url=r.config.origin, raise_server_exceptions=False) as c:
        send = getattr(c, method)
        with patch.object(r.renderer, 'render', side_effect=RuntimeError('acceptance render outage')):
            failed = send('/en/projects')
        assert failed.status_code == 503
        assert failed.headers['cache-control'] == failed.headers['cloudflare-cdn-cache-control'] == 'no-store'
        assert failed.headers['retry-after'] == '1'
        recovered = send('/en/projects?__recover=1')
        assert recovered.status_code == 200
        assert recovered.headers['cache-control'] == recovered.headers['cloudflare-cdn-cache-control'] == 'no-store'
        assert 'etag' not in recovered.headers
        if method == 'get':
            assert 'data-public-recovery-success' in recovered.text
        else:
            assert failed.content == recovered.content == b''
        normal = send('/en/projects')
        assert normal.status_code == 200 and 'data-public-recovery-success' not in normal.text
        if platform == 'off':
            assert normal.headers['cache-control'] == 'no-store'
        else:
            assert 'max-age=1800' in normal.headers['cache-control']
            assert 'stale-while-revalidate=120' in normal.headers['cache-control']
            assert 'stale-if-error=86400' in normal.headers['cache-control']
            unchanged = send('/en/projects', headers={'If-None-Match': normal.headers['etag']})
            assert unchanged.status_code == 304 and not unchanged.content
        assert all('clear-site-data' not in a.headers for a in (failed, recovered, normal))
