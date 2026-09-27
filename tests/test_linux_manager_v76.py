"""Deployment lifecycle against isolated directories and fake host commands only."""
import argparse
import json
import os
from pathlib import Path
import shutil
from types import SimpleNamespace
import pytest
if os.name!='posix':pytest.skip('Linux deployment manager',allow_module_level=True)
from deploy.linux import tweb

ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture
def managed(tmp_path,monkeypatch):
    l=tweb.Layout(tmp_path/'opt/site',tmp_path/'etc/site',tmp_path/'opt/site/data',tmp_path/'units/site.service',tmp_path/'bin/tweb')
    l.unit.parent.mkdir();l.command.parent.mkdir()
    events=[]
    def runner(args,**kw):
        args=list(map(str,args));events.append(args)
        if args[:2]==['systemctl','show']:return SimpleNamespace(stdout='not-found\n')
        if args[0]=='useradd':return SimpleNamespace(stdout='')
        if args[0]=='chown':return SimpleNamespace(stdout='')
        if '-m' in args and 'deploy.vps.release' in args:
            out=Path(args[args.index('--output')+1]);out.mkdir()
            (out/tweb.SERVICE).write_text(f'ExecStart={l.current}/.venv/bin/python -m uvicorn\nRestart=on-failure\nReadWritePaths=/var/lib/teacher-site {l.base}/current/transfer-data\n')
        return SimpleNamespace(stdout='')
    m=tweb.Manager(l,runner)
    monkeypatch.setattr(tweb.pwd,'getpwnam',lambda n:(_ for _ in ()).throw(KeyError(n)))
    monkeypatch.setattr(m,'active',lambda:True)
    monkeypatch.setattr(m,'healthy',lambda:events.append(['healthy']))
    count=[0]
    def fetch(repo,branch):
        count[0]+=1
        target=l.base/'releases'/str(count[0]);target.mkdir(parents=True)
        for name in ('deploy/linux/tweb.py','frontend/test.css','backend/test.py','database/schema.sql','pyproject.toml'):
            p=target/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('source')
        return target,'commit-'+str(count[0])
    monkeypatch.setattr(m,'fetch',fetch)
    args=SimpleNamespace(repo='https://github.com/example/teacher',branch='main',domain='teacher.example.org',python='/usr/bin/python3')
    m.install(args)
    return m,events,args


def update_args(**kw):
    return SimpleNamespace(**(dict(repo=None,branch=None,scope='all',reset=False,confirm=None)|kw))


def test_install_permissions_paths_and_no_second_service(managed):
    m,events,args=managed
    assert m.load()['phase']=='ready'
    assert m.l.command.stat().st_mode & 0o777==0o755
    assert m.l.data.stat().st_mode & 0o777==0o700
    assert m.l.state.stat().st_mode & 0o777==0o600
    storage=(m.l.config/'storage.toml').read_text()
    assert f'{m.l.base}/transfer-data/files' in storage
    assert (m.release()/'data').resolve()==m.l.data
    assert (m.release()/'transfer-data').resolve()==m.l.base/'transfer-data'
    assert sum(e[:2]==['systemctl','enable'] for e in events)==1
    assert ['systemctl','start',tweb.SERVICE] in events
    assert 'proxy_request_buffering off' in (m.l.config/'generated/nginx-location.conf').read_text()
    assert 'https://teacher.example.org' in (m.l.config/'teacher-site.env').read_text()


def test_update_prepares_before_stop_then_removes_previous_without_backup(managed):
    m,events,_=managed;old=m.release();events.clear()
    (m.l.data/'retained.db').write_text('keep')
    m.update(update_args())
    assert m.release()!=old and not old.exists()
    assert (m.l.data/'retained.db').read_text()=='keep'
    stop=events.index(['systemctl','stop',tweb.SERVICE])
    assert next(i for i,e in enumerate(events) if 'pip' in e)<stop
    assert m.load()['commit']=='commit-2'
    assert not any('migrate' in e or 'backup' in e for e in events)


def test_partial_update_refuses_backend_changes_before_stop(managed,monkeypatch):
    m,events,_=managed;old=m.release();original=m.fetch;events.clear()
    def changed(*args):
        release,commit=original(*args);(release/'backend/test.py').write_text('changed');return release,commit
    monkeypatch.setattr(m,'fetch',changed)
    with pytest.raises(ValueError,match='后端'):m.update(update_args(scope='frontend'))
    assert m.release()==old
    assert ['systemctl','stop',tweb.SERVICE] not in events
    assert len(list((m.l.base/'releases').iterdir()))==1


def test_partial_update_accepts_compatible_frontend(managed,monkeypatch):
    m,events,_=managed;original=m.fetch
    def changed(*args):
        release,commit=original(*args);(release/'frontend/test.css').write_text('new front');return release,commit
    monkeypatch.setattr(m,'fetch',changed)
    m.update(update_args(scope='frontend'))
    assert (m.release()/'frontend/test.css').read_text()=='new front'


def test_failed_health_reverts_source_without_reset_and_restores_state(managed,monkeypatch):
    m,events,_=managed;old=m.release();state=m.load();calls=[]
    def health():
        calls.append(1)
        if len(calls)==1:raise RuntimeError('unhealthy')
    monkeypatch.setattr(m,'healthy',health)
    with pytest.raises(RuntimeError,match='unhealthy'):m.update(update_args())
    assert m.release()==old and m.load()==state
    assert len(calls)==2


def test_failed_reset_stays_stopped_on_new_source(managed,monkeypatch):
    m,events,_=managed;old=m.release();events.clear()
    monkeypatch.setattr(m,'healthy',lambda:(_ for _ in ()).throw(RuntimeError('unhealthy')))
    with pytest.raises(RuntimeError,match='unhealthy'):m.update(update_args(reset=True,confirm='RESET'))
    assert m.release()!=old and m.load()['phase']=='reset-failed'
    assert events[-1]==['systemctl','stop',tweb.SERVICE]
    assert any('reset-data' in e for e in events)


def test_db_reset_confirmation_before_stop_and_reuses_native_cli(managed):
    m,events,_=managed;events.clear()
    with pytest.raises(ValueError):m.database(True,'wrong')
    assert not events
    m.database(True,'RESET')
    assert events[0]==['systemctl','stop',tweb.SERVICE]
    reset=next(e for e in events if 'reset-data' in e)
    assert reset[:4]==['runuser','-u','teacher-site','--']
    assert 'env' in reset and '-i' in reset and '--include-transfer' in reset
    assert any('init' in e and '--ready' in e for e in events)


def test_uninstall_removes_owned_payload_keeps_other_files_and_symlink_target(managed,tmp_path):
    m,events,_=managed
    outside=tmp_path/'unrelated';outside.mkdir();(outside/'keep').write_text('keep')
    (m.l.data/'outside-link').symlink_to(outside,target_is_directory=True)
    (m.l.base/'transfer-data/files/payload').write_text('file')
    m.uninstall('DELETE')
    assert all(not p.exists() for p in (m.l.base,m.l.config,m.l.data,m.l.command,m.l.unit))
    assert (outside/'keep').read_text()=='keep'
    assert ['userdel','teacher-site'] in events


def test_uninstall_refuses_modified_external_unit_before_any_action(managed):
    m,events,_=managed;events.clear();m.l.unit.write_text('someone changed this')
    with pytest.raises(ValueError,match='已修改'):m.uninstall('DELETE')
    assert not events and m.l.data.exists()


def test_claim_and_owned_reject_foreign_dirs_symlinks(tmp_path):
    root=tmp_path/'existing';root.mkdir();(root/'keep').write_text('keep')
    with pytest.raises(ValueError):tweb.claim(root)
    with pytest.raises(ValueError):tweb.owned(root)
    link=tmp_path/'link';link.symlink_to(root,target_is_directory=True)
    with pytest.raises(ValueError):tweb.claim(link)
    assert (root/'keep').read_text()=='keep'

@pytest.mark.parametrize('repo',['http://github.com/a/b','https://name:password@github.com/a/b','https://github.com/a/b;id','--upload-pack=bad','file:///tmp/repo'])
def test_repository_validation(repo):
    with pytest.raises(ValueError):tweb.repository(repo)

@pytest.mark.parametrize('value',['../main','--evil','main\nhello','a;whoami','branch.lock'])
def test_branch_validation(value):
    with pytest.raises(ValueError):tweb.branch_name(value)


def test_download_rejects_symlink_source_and_cleans_stage(tmp_path):
    l=tweb.Layout(base=tmp_path/'site');(l.base/'releases').mkdir(parents=True)
    def runner(args,**kw):
        if 'clone' in args:
            path=Path(args[-1]);path.mkdir();(path/'pyproject.toml').symlink_to(ROOT/'pyproject.toml')
        return SimpleNamespace(stdout='hash')
    m=tweb.Manager(l,runner)
    with pytest.raises(ValueError):m.fetch('https://github.com/example/repo','main')
    assert not list((l.base/'releases').iterdir())


def test_real_source_and_bootstrap_syntax():
    tweb.check_source(ROOT)
    tweb.run(['bash','-n',ROOT/'install.sh'])
    result=tweb.run(['bash',ROOT/'install.sh','--help'],capture_output=True,text=True)
    assert '--python' in result.stdout
