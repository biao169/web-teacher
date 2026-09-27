"""Shared root storage, live idempotent seeding and explicit English entrypoint."""
import asyncio
from pathlib import Path
import socket
import sqlite3
from contextlib import closing
from unittest.mock import patch
from backend.app import config
from backend.app.native.database import Database
from backend.app.native.demo import seed
from deploy.shared import launcher
from deploy.vps.release import inventory,render
from list_fixture import client_at


def test_default_normal_and_development_use_same_project_database(tmp_path,monkeypatch):
    import os
    monkeypatch.setattr(os,'environ',{k:v for k,v in os.environ.items() if not k.startswith(('TEACHER_','TRANSFER_'))})
    project=tmp_path/'project';project.mkdir()
    monkeypatch.setattr(config,'PROJECT_ROOT',project);monkeypatch.setattr(launcher,'ROOT',project)
    normal=launcher.configure();development=launcher.configure('demo')
    assert normal.database_path==development.database_path==project/'data/database/site.sqlite3'
    assert normal.media_dir==development.media_dir==project/'data/media'
    assert normal.transfer_media_dir==development.transfer_media_dir==project/'data/transfer-data/files'


def test_seed_appends_while_port_busy_and_visible_without_restart(tmp_path,monkeypatch):
    c,r=client_at(tmp_path/'site')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));sock.listen()
        monkeypatch.setenv('TEACHER_PORT',str(sock.getsockname()[1]))
        monkeypatch.setattr(launcher,'configure',lambda profile:r.settings)
        with patch.object(launcher,'check_ports',side_effect=AssertionError('Seed must not require a stopped service')):
            launcher.main(['seed','--ready','--profile','demo'])
            launcher.main(['seed','--ready','--profile','demo'])
    with closing(sqlite3.connect(r.settings.database_path)) as con:
        assert con.execute("SELECT count(*) FROM profiles WHERE uid LIKE 'demo-%'").fetchone()[0]==10
    assert '示例教师' in c.get('/zh').text
    assert 'Example publication' in c.get('/en').text
    c.close()


def test_english_root_and_auth_defaults_chinese_still_explicit(tmp_path):
    c,r=client_at(tmp_path)
    assert c.get('/',follow_redirects=False).headers['location']=='/en'
    assert 'lang="en"' in c.get('/auth/login').text
    assert 'lang="zh"' in c.get('/zh').text
    c.close()


def test_runtime_directories_excluded_and_production_render_uses_root(tmp_path):
    project=tmp_path/'source';(project/'data/media').mkdir(parents=True)
    (project/'data/private.sqlite3').write_bytes(b'private');(project/'data/media/private.jpg').write_bytes(b'private')
    (project/'app.py').write_text('pass')
    assert list(inventory(project))==['app.py']
    output=tmp_path/'render';render(output,'/opt/teacher-site','teacher.example.org',None,'/opt/teacher-site/current/.venv/bin/python')
    assert '/opt/teacher-site/data/database/site.sqlite3' in (output/'storage.toml').read_text()
    assert '/var/lib/teacher-site' not in (output/'teacher-site.service').read_text()
