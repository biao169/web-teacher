from concurrent.futures import ThreadPoolExecutor
from dataclasses import FrozenInstanceError
from types import SimpleNamespace

import pytest
from starlette.datastructures import Headers
from starlette.responses import Response
from backend.app.security.http import AuthConfig, AuthError
from backend.app.security.origins import OriginPolicy, normalize_origin, parse_origins


def request(host='a.example', origin='https://a.example', extra=()):
    pairs = [('host', host), ('origin', origin), *extra]
    return SimpleNamespace(headers=Headers(raw=[(k.encode(), v.encode()) for k, v in pairs if v is not None]))


def test_normalize_and_deduplicate():
    assert parse_origins('https://A.example:443/', 'https://b.example, https://a.example') == ('https://a.example', 'https://b.example')
    assert normalize_origin('http://[::1]:8003/') == 'http://[::1]:8003'
    assert normalize_origin('https://例子.中国') == 'https://xn--fsqu00a.xn--fiqs8s'


@pytest.mark.parametrize('value', [None, '', 'null', 'ftp://a.example', 'http://a.example', 'https://user@a.example', 'https://a.example/x', 'https://a.example?', 'https://a.example#', 'https://*.example', 'https://a.example,b.example', 'https://a.example:0', 'https://a.example:65536', 'https://a.example:', 'https://a.example\\evil', ' https://a.example', 'https://a.example\n', 'https://[fe80::1%eth0]'])
def test_invalid_config(value):
    with pytest.raises(ValueError):
        normalize_origin(value)


def test_reject_mixed_scheme_and_empty_entries():
    for allowed in ['http://localhost', 'https://b.example,', [''], ['https://b.example'] * 101]:
        with pytest.raises(ValueError):
            parse_origins('https://a.example', allowed)


def test_request_domain_and_forwarded_headers():
    p = OriginPolicy('https://a.example', ('https://b.example',))
    assert p.require_same_origin(request('B.example:443', 'https://b.example')) == 'https://b.example'
    assert p.request_origin(request(extra=[('x-forwarded-host', 'evil.example'), ('x-forwarded-proto', 'http')])) == 'https://a.example'
    with pytest.raises(ValueError):
        p.request_origin(request('evil.example', extra=[('x-forwarded-host', 'a.example')]))
    with pytest.raises(ValueError):
        p.require_same_origin(request('b.example', 'https://a.example'))


@pytest.mark.parametrize('host,origin,extra', [(None, 'https://a.example', []), ('a.example', None, []), ('a.example', 'null', []), ('a.example', 'https://a.example/', []), ('a.example', 'https://a.example', [('host', 'a.example')]), ('a.example', 'https://a.example', [('origin', 'https://a.example')]), ('a.example', 'https://a.example', [('sec-fetch-site', 'cross-site')]), ('a.example', 'https://a.example', [('sec-fetch-site', 'same-site')]), ('a.example', 'https://a.example', [('sec-fetch-site', 'none'), ('sec-fetch-site', 'none')])])
def test_invalid_request_headers(host, origin, extra):
    with pytest.raises(ValueError):
        OriginPolicy('https://a.example').require_same_origin(request(host, origin, extra))


def test_config_concurrency_and_immutability():
    config = AuthConfig.from_origin('https://a.example', 'https://b.example')
    domains = ['a.example', 'b.example'] * 100
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda host: config.same_origin(request(host, 'https://' + host)), domains))
    assert results == ['https://' + host for host in domains]
    assert config.origin == 'https://a.example'
    with pytest.raises(FrozenInstanceError):
        config.origin = 'https://b.example'
    with pytest.raises(TypeError):
        config._origins._hosts['evil.example'] = 'https://evil.example'


def test_adapter_errors_cookie_and_env_compatibility(monkeypatch):
    c = AuthConfig.from_origin('https://a.example', 'https://b.example')
    for req, status in [(request('evil.example'), 400), (request('b.example'), 403)]:
        with pytest.raises(AuthError) as error:
            c.same_origin(req)
        assert error.value.status == status
    response = Response()
    c.set_cookie(response, 'session', 'test', 60)
    cookie = response.headers['set-cookie']
    assert '__Host-ts_session=' in cookie and 'Secure' in cookie and 'HttpOnly' in cookie
    assert 'Path=/' in cookie and 'SameSite=strict' in cookie and 'Domain=' not in cookie
    monkeypatch.setenv('TEACHER_ORIGIN', 'https://a.example')
    monkeypatch.setenv('TEACHER_ALLOWED_ORIGINS', 'https://b.example')
    assert AuthConfig.from_env().allowed_origins == ('https://a.example', 'https://b.example')


def test_site_urls():
    c = AuthConfig.from_origin('https://a.example', 'https://b.example')
    assert c.is_site_url('https://b.example/files/abc?download=1#part')
    for url in ['/files/a', '//a.example/files/a', 'https://user@a.example/files/a', 'https://evil.example/', 'http://a.example/', 'https://a.example.evil.test/']:
        assert not c.is_site_url(url)
