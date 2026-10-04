"""Deployment changes are tested in disposable paths, never against host services."""
import json
from pathlib import Path
import pytest
from deploy.linux import tweb
from deploy.vps.release import render
from deploy.cloudflare.domains import settings, apply
from backend.app.security.http import AuthConfig
from test_deploy_multi_v146 import make_manager


def test_environment_runtime(monkeypatch):
    monkeypatch.setenv('TEACHER_ORIGIN', 'https://a.example.org')
    monkeypatch.setenv('TEACHER_ALLOWED_ORIGINS', 'https://b.example.org,https://a.example.org')
    config = AuthConfig.from_env()
    assert config.origin == 'https://a.example.org'
    assert config.allowed_origins == ('https://a.example.org', 'https://b.example.org')
    monkeypatch.delenv('TEACHER_ALLOWED_ORIGINS')
    assert AuthConfig.from_env().allowed_origins == ('https://a.example.org',)


def test_worker_existing_routes_and_custom_domains():
    values = settings({'TEACHER_ORIGIN': 'https://faculty.school.edu', 'TEACHER_ALLOWED_ORIGINS': 'https://lab.school.edu', 'TEACHER_CUSTOM_DOMAINS': 'lab.school.edu,staff.school.edu'}, 'teacher')
    original = {'pattern': 'school.edu/teacher/*', 'zone_name': 'school.edu'}
    cfg = {'routes': [original], 'vars': {'OTHER': 'keep'}}
    apply(cfg, values)
    apply(cfg, values)
    assert len(cfg['routes']) == 3 and cfg['routes'][0] == original
    assert cfg['vars']['OTHER'] == 'keep'
    assert cfg['vars']['TEACHER_ALLOWED_ORIGINS'] == 'https://faculty.school.edu,https://lab.school.edu,https://staff.school.edu'
    cfg = {}
    apply(cfg, settings({'TEACHER_ORIGIN': 'https://faculty.school.edu', 'TEACHER_ALLOWED_ORIGINS': 'https://lab.school.edu'}, 'teacher'))
    assert 'routes' not in cfg


@pytest.mark.parametrize('value', ['http://lab.school.edu', 'https://*.school.edu', 'https://user@lab.school.edu', 'https://lab.school.edu/path', 'https://lab.school.edu:8443', 'https://lab.school.edu,'])
def test_bad_worker_aliases_fail(value):
    with pytest.raises(ValueError):
        settings({'TEACHER_ORIGIN': 'https://faculty.school.edu', 'TEACHER_ALLOWED_ORIGINS': value}, 'teacher')


def test_render_multi_domain_service(tmp_path):
    output = tmp_path/'render'
    render(output, '/opt/teacher-site', 'a.example.org', None, '/usr/bin/python3', allowed_domains='b.example.org,a.example.org')
    env = (output/'teacher-site.env').read_text()
    assert 'TEACHER_ORIGIN=https://a.example.org\n' in env
    assert 'TEACHER_ALLOWED_ORIGINS=https://a.example.org,https://b.example.org\n' in env
    assert (output/'Caddyfile.fragment').read_text().startswith('a.example.org, b.example.org {')


def test_manager_domain_change_preservation_and_clear(tmp_path, monkeypatch):
    m, events = make_manager(tmp_path, monkeypatch, 'alpha')
    env = m.l.config/'teacher-site.env'
    env.write_text(env.read_text()+'CUSTOM_TOKEN=retain-me\n# keep comment\n')
    m.configure(allowed_domains='beta.example.org,alpha.example.org')
    assert 'CUSTOM_TOKEN=retain-me' in env.read_text()
    assert m.load()['allowed_domains'] == 'beta.example.org'
    assert 'alpha.example.org, beta.example.org {' in (m.l.config/'generated/Caddyfile.fragment').read_text()
    assert 'proxy_set_header Host $host;' in (m.l.config/'generated/nginx-location.conf').read_text()
    # Regeneration and port/config updates must keep the env allowlist and unrelated settings.
    m.generate(m.release(), m.load())
    assert 'https://beta.example.org' in env.read_text() and 'CUSTOM_TOKEN=retain-me' in env.read_text()
    m.configure()
    assert 'https://beta.example.org' in env.read_text()
    m.configure(allowed_domains='')
    assert 'beta.example.org' not in env.read_text()
    assert m.load()['allowed_domains'] == ''


def test_domain_configuration_rollback(tmp_path, monkeypatch):
    m, events = make_manager(tmp_path, monkeypatch, 'alpha')
    env = m.l.config/'teacher-site.env'
    before = env.read_bytes()
    state = m.l.state.read_bytes()
    original_start = m.start
    calls = []
    def fail_once():
        calls.append(1)
        if len(calls) == 1:raise RuntimeError('Synthetic restart failure')
        return original_start()
    monkeypatch.setattr(m, 'start', fail_once)
    with pytest.raises(RuntimeError, match='Synthetic'):
        m.configure(allowed_domains='beta.example.org')
    assert env.read_bytes() == before and m.l.state.read_bytes() == state
    assert env.stat().st_mode & 0o777 == 0o640
    assert 'beta.example.org' not in (m.l.config/'generated/Caddyfile.fragment').read_text()


@pytest.mark.parametrize('value', ['evil.example.org;stop', '*.example.org', 'https://b.example.org', 'b.example.org,', 'b.example.org\nother'])
def test_invalid_install_aliases(value):
    with pytest.raises(ValueError):tweb.domain_names('a.example.org', value)


def test_linux_cli_alias_option():
    args = tweb.parser().parse_args(['domains', '--allowed-domains', 'b.example.org'])
    assert args.allowed_domains == 'b.example.org'
