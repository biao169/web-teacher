"""Isolated manager controls: no real systemd/account/package mutations."""
import hashlib
import os
from pathlib import Path
from types import SimpleNamespace
import socket
import subprocess
import sys
import pytest
if os.name!='posix':pytest.skip('Linux deployment controls',allow_module_level=True)
from deploy.linux import tweb
from deploy.vps.release import render
from test_linux_manager_v76 import managed,update_args


@pytest.mark.parametrize('value',['0','80','1023','65536','-1','1;id','9003\n',True])
def test_invalid_ports(value):
    with pytest.raises(ValueError):tweb.port_number(value)


def test_render_custom_port_consistent(tmp_path):
    render(tmp_path/'render','/opt/test-site','test.example.org',None,'/opt/python/bin/python',9103)
    unit=(tmp_path/'render/teacher-site.service').read_text()
    assert '--port 9103 ' in unit
    assert '127.0.0.1:9103' in (tmp_path/'render/Caddyfile.fragment').read_text()
    assert '127.0.0.1:8003' not in (tmp_path/'render/Caddyfile.fragment').read_text()


def unit_with_port(m):
    text=f'ExecStart={m.l.current}/.venv/bin/python -m deploy.shared.service backend.entrypoints.vps:app --host 127.0.0.1 --port 8003\nMemoryMax=300M\n'
    m.l.unit.write_text(text)
    state=m.load();state['owned_files'][str(m.l.unit)]=hashlib.sha256(text.encode()).hexdigest();m.save(state)
    return text


def free_port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]


def test_port_change_updates_health_state_and_proxy_preserves_environment(managed,monkeypatch):
    m,events,_=managed;unit_with_port(m);port=free_port();seen=[]
    env=m.l.config/'teacher-site.env';env.write_text(env.read_text()+'EXTRA=keep\n')
    storage=(m.l.config/'storage.toml').read_bytes()
    monkeypatch.setattr(m,'healthy',lambda:seen.append(m.load()['port']))
    m.configure(port)
    assert seen==[port] and m.load()['port']==port
    assert f'--port {port}' in m.l.unit.read_text() and 'MemoryMax=300M' in m.l.unit.read_text()
    for name in ('Caddyfile.fragment','nginx-location.conf'):
        assert f'127.0.0.1:{port}' in (m.l.config/'generated'/name).read_text()
    assert 'EXTRA=keep' in env.read_text() and (m.l.config/'storage.toml').read_bytes()==storage


def test_port_collision_refuses_before_stop(managed):
    m,events,_=managed;unit_with_port(m);events.clear()
    with socket.socket() as s:
        s.bind(('127.0.0.1',0));s.listen()
        with pytest.raises(OSError):m.configure(s.getsockname()[1])
    assert not events


def test_port_health_failure_restores_state_and_files(managed,monkeypatch):
    m,events,_=managed;old=unit_with_port(m);state=m.load();seen=[]
    proxy=(m.l.config/'generated/Caddyfile.fragment').read_bytes()
    def health():
        seen.append(m.load()['port'])
        if len(seen)==1:raise RuntimeError('unhealthy')
    monkeypatch.setattr(m,'healthy',health)
    with pytest.raises(RuntimeError):m.configure(free_port())
    assert m.l.unit.read_text()==old and m.load()==state and seen[-1]==8003
    assert (m.l.config/'generated/Caddyfile.fragment').read_bytes()==proxy


def test_source_only_keeps_venv_and_database_without_pip(managed,monkeypatch):
    m,events,_=managed;old=m.release();venv=old/'.venv';venv.mkdir();(venv/'sentinel').write_text('keep')
    (m.l.data/'database').mkdir();db=m.l.data/'database/site.sqlite3';db.write_text('keep')
    original=m.fetch
    def fetch(*a):
        p,c=original(*a);(p/'backend/test.py').write_text('changed');return p,c
    monkeypatch.setattr(m,'fetch',fetch);events.clear()
    m.update(update_args(scope='source'))
    assert m.release()==old and (venv/'sentinel').read_text()=='keep' and db.read_text()=='keep'
    assert (old/'backend/test.py').read_text()=='changed'
    assert not any('pip' in e or 'init' in e or 'migrate' in e for e in events)
    assert len(list((m.l.base/'releases').iterdir()))==1


def test_source_only_schema_change_rejected_before_stop(managed,monkeypatch):
    m,events,_=managed;original=m.fetch
    def fetch(*a):
        p,c=original(*a);(p/'database/schema.sql').write_text('changed');return p,c
    monkeypatch.setattr(m,'fetch',fetch);events.clear()
    with pytest.raises(ValueError):m.update(update_args(scope='source'))
    assert ['systemctl','stop',tweb.SERVICE] not in events


def test_dependencies_do_not_fetch_or_initialize_database(managed,monkeypatch):
    m,events,_=managed;events.clear()
    monkeypatch.setattr(m,'fetch',lambda *a:pytest.fail('downloaded source'))
    m.update(update_args(scope='dependencies'))
    assert any('pip' in e for e in events)
    assert not any('init' in e or 'migrate' in e or 'reset-data' in e for e in events)


def test_database_update_reuses_existing_upgrade_without_reset(managed):
    m,events,_=managed;events.clear();m.database(update=True)
    assert any('migrate' in e for e in events) and not any('reset-data' in e for e in events)


@pytest.mark.parametrize('scope,relative',[('cache','cache'),('logs','logs'),('media','media'),('database','database')])
def test_scoped_removal_preserves_other_objects(managed,scope,relative):
    m,events,_=managed;target=m.l.data/relative;target.mkdir(exist_ok=True);(target/'delete').write_text('delete')
    keep=m.l.data/'unrelated';keep.write_text('keep');events.clear()
    with pytest.raises(ValueError):m.remove(scope,'wrong')
    assert (target/'delete').exists() and not events
    m.remove(scope,'DELETE-'+scope.upper())
    assert not (target/'delete').exists() and target.is_dir() and keep.read_text()=='keep'
    assert target.stat().st_mode & 0o777==0o700
    assert (['systemctl','start',tweb.SERVICE] in events)==(scope!='database')


def test_transfer_removal_preserves_site_media_and_records(managed):
    m,events,_=managed
    payload=m.l.base/'transfer-data/files/file';payload.write_text('remove')
    media=m.l.data/'media/image';media.write_text('keep')
    m.remove('transfer','DELETE-TRANSFER')
    assert not payload.exists() and media.read_text()=='keep'


def test_source_removal_and_restore_keep_data(managed):
    m,events,_=managed;media=m.l.data/'media/image';media.write_text('keep')
    m.remove('source','DELETE-SOURCE')
    assert not m.l.current.exists() and m.l.command.exists() and m.load()['phase']=='source-removed'
    m.update(update_args())
    assert m.release().is_dir() and media.read_text()=='keep' and m.load()['phase']=='ready'


def test_custom_storage_refused_before_deletion(managed):
    m,events,_=managed;p=m.l.config/'storage.toml';p.write_text(p.read_text().replace(str(m.l.data/'media'),'/elsewhere'))
    events.clear()
    with pytest.raises(ValueError,match='Custom'):m.remove('media','DELETE-MEDIA')
    assert not events


def test_symlink_root_refused_but_nested_link_target_preserved(managed,tmp_path):
    m,events,_=managed;external=tmp_path/'outside';external.mkdir();(external/'keep').write_text('keep')
    media=m.l.data/'media';(media/'link').symlink_to(external,target_is_directory=True)
    m.remove('media','DELETE-MEDIA');assert (external/'keep').read_text()=='keep'
    media.rmdir();media.symlink_to(external,target_is_directory=True);events.clear()
    with pytest.raises(ValueError):m.remove('media','DELETE-MEDIA')
    assert not events


def test_permission_probe_runs_as_service_account_and_uses_real_write(managed):
    m,events,_=managed
    folder=m.l.data/'database';folder.mkdir();db=folder/'site.sqlite3';db.write_text('untouched')
    events.clear();m.permissions()
    probe=next(e for e in events if 'tempfile.mkstemp' in ' '.join(e))
    assert probe[:4]==['runuser','-u',tweb.USER,'--']
    assert not any('chmod' in e for e in events)
    assert any('os.O_RDWR|os.O_NOFOLLOW' in ' '.join(e) and str(db) in e for e in events)
    assert db.read_text()=='untouched'


def test_permission_repair_refuses_linked_config_before_chown(managed,tmp_path):
    m,events,_=managed;env=m.l.config/'teacher-site.env';external=tmp_path/'other.env';external.write_text('keep')
    env.unlink();env.symlink_to(external);events.clear()
    with pytest.raises(ValueError):m.permissions(repair=True)
    assert not events and external.read_text()=='keep'


def test_permission_repair_stops_before_touching_data_and_restarts(managed,monkeypatch):
    m,events,_=managed
    monkeypatch.setattr(tweb.pwd,'getpwnam',lambda _:SimpleNamespace(pw_uid=os.getuid(),pw_gid=os.getgid()))
    media=m.l.data/'media/image';media.write_text('keep');media.chmod(0o666);events.clear()
    m.permissions(repair=True)
    assert events[0]==['systemctl','stop',tweb.SERVICE]
    assert events[-1]==['healthy'] and media.stat().st_mode & 0o777==0o600
    assert m.l.data.stat().st_mode & 0o777==0o700


def test_health_uses_saved_port(managed,monkeypatch):
    m,events,_=managed;state=m.load();state['port']=9123;m.save(state);seen=[]
    class Reply:
        status=200
        def __enter__(self):return self
        def __exit__(self,*args):pass
    monkeypatch.setattr(tweb,'build_opener',lambda *a:SimpleNamespace(open=lambda url,**kw:(seen.append(url) or Reply())))
    tweb.Manager.healthy(m)
    assert seen==['http://127.0.0.1:9123/health/ready']


def test_bilingual_menu_loop_color_and_no_color(monkeypatch,capsys):
    monkeypatch.setattr(sys.stdin,'isatty',lambda:True);monkeypatch.setattr(sys.stdout,'isatty',lambda:True)
    monkeypatch.setenv('TERM','xterm');monkeypatch.delenv('NO_COLOR',raising=False)
    choices=iter(['6','2','0']);monkeypatch.setattr('builtins.input',lambda _:next(choices));seen=[]
    monkeypatch.setattr(tweb,'execute',lambda a:seen.append(a))
    assert tweb.main([])==0
    assert seen[0].scope=='source'
    text=capsys.readouterr().out
    assert '仅源码 / Source only' in text and '不装依赖' in text and '\x1b[' in text
    monkeypatch.setenv('NO_COLOR','1');assert tweb.color('hello')=='hello'


def test_start_shell_port_forwarded_without_starting_website(tmp_path):
    root=Path(__file__).resolve().parents[1];fake=tmp_path/'python';fake.write_text('#!/bin/sh\nprintf "%s\\n" "$TEACHER_PORT" "$@"\n');fake.chmod(0o755)
    r=subprocess.run(['bash',str(root/'start.sh'),'--port','9103','--ready'],env=os.environ|{'TEACHER_PYTHON':str(fake)},capture_output=True,text=True)
    assert r.returncode==0 and r.stdout.splitlines()[0]=='9103' and '--ready' in r.stdout
    assert '--port' not in r.stdout


def test_old_manager_wrapper_reuses_configured_interpreter(monkeypatch):
    seen=[]
    monkeypatch.setattr(tweb.sys,'version_info',(3,10))
    monkeypatch.setattr(tweb.Manager,'load',lambda _:dict(python='/opt/python312/bin/python'))
    monkeypatch.setattr(tweb,'run',lambda args:seen.append(args))
    def execute(executable,args):
        seen.append((executable,args));raise RuntimeError('reexecuted')
    monkeypatch.setattr(tweb.os,'execvp',execute)
    with pytest.raises(RuntimeError,match='reexecuted'):tweb.main(['status'])
    assert seen[0][0]=='/opt/python312/bin/python' and seen[1][1][-1]=='status'
