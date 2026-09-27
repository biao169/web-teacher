"""Platform layout, disposable development startup and packaging boundaries."""
import asyncio,os,sqlite3,subprocess,sys,json
from pathlib import Path
from contextlib import closing
import pytest
from backend.app.native.database import Database
from deploy.shared import launcher,development
from deploy.vps.release import inventory
ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture
def isolated_env(monkeypatch,tmp_path):
    env=os.environ.copy()
    for key in list(env):
        if key.startswith(('TEACHER_','TRANSFER_')):env.pop(key)
    monkeypatch.setattr(os,'environ',env)
    env['TEACHER_DEV_ROOT']=str(tmp_path/'development with spaces')
    env['TEACHER_DEV_ADMIN_PASSWORD']='Synthetic-test-password-075'
    monkeypatch.setattr(launcher,'check_ports',lambda ports:None)
    return env


def test_rebuild_uses_own_paths_and_no_backup_preserves_other_site(isolated_env,tmp_path):
    env=isolated_env;normal=tmp_path/'normal.sqlite';Database(normal).initialize()
    with closing(sqlite3.connect(normal)) as c,c:c.execute("INSERT INTO students(uid,name) VALUES ('normal','Keep normal')")
    env['TEACHER_DATABASE_PATH']=str(normal);env['TEACHER_CONFIG']=str(tmp_path/'does-not-exist.toml')
    env['TEACHER_DEV_DATABASE_PATH']='custom db/site.sqlite'
    launcher.main(['rebuild','--profile','demo','--ready'])
    path=Path(env['TEACHER_DATABASE_PATH']);assert path==Path(env['TEACHER_DEV_ROOT'])/'custom db/site.sqlite'
    assert 'TEACHER_DEV_ADMIN_PASSWORD' not in env
    assert 'TEACHER_CONFIG' not in env
    with closing(sqlite3.connect(path)) as c,c:
        assert c.execute('SELECT count(*) FROM auth_users').fetchone()[0]==1
        assert c.execute('SELECT count(*) FROM students').fetchone()[0]==10
        c.execute("INSERT INTO students(uid,name) VALUES ('discard','Old development')")
    env['TEACHER_DEV_ADMIN_PASSWORD']='Synthetic-test-password-075'
    launcher.main(['rebuild','--profile','demo','--ready'])
    with closing(sqlite3.connect(path)) as c:assert c.execute("SELECT count(*) FROM students WHERE uid='discard'").fetchone()[0]==0
    with closing(sqlite3.connect(normal)) as c:assert c.execute('SELECT name FROM students').fetchone()[0]=='Keep normal'
    assert not list(tmp_path.rglob('*.before-*'))


def test_fresh_starts_same_service_and_existing_mode_does_not_reset(isolated_env,monkeypatch):
    calls=[];monkeypatch.setattr(launcher,'serve',lambda s,**kw:calls.append((s,kw)))
    launcher.main(['fresh','--profile','demo','--ready','--no-browser'])
    assert len(calls)==1 and calls[0][1]['open_browser'] is False
    path=calls[0][0].database_path
    with closing(sqlite3.connect(path)) as c,c:c.execute("INSERT INTO students(uid,name) VALUES ('keep','Continue debugging')")
    # Existing mode uses positional compatibility arguments in serve().
    monkeypatch.setattr(launcher,'serve',lambda *args,**kw:None)
    launcher.main(['start','--profile','demo','--ready','--no-browser'])
    with closing(sqlite3.connect(path)) as c:assert c.execute("SELECT name FROM students WHERE uid='keep'").fetchone()[0]=='Continue debugging'


def test_dev_path_escape_unmarked_dir_and_normal_fresh_rejected(isolated_env,tmp_path):
    env=isolated_env
    with pytest.raises(ValueError,match='requires --profile demo'):launcher.main(['fresh','--ready'])
    env['TEACHER_DEV_DATABASE_PATH']=str(tmp_path/'outside.sqlite')
    with pytest.raises(ValueError,match='inside TEACHER_DEV_ROOT'):launcher.configure('demo')
    env.pop('TEACHER_DEV_DATABASE_PATH')
    root=Path(env['TEACHER_DEV_ROOT']);root.mkdir();(root/'keep.txt').write_text('user content')
    with pytest.raises(ValueError,match='unmarked'):launcher.configure('demo')
    assert (root/'keep.txt').read_text()=='user content'


def test_dev_symbolic_path_is_rejected(isolated_env,tmp_path):
    outside=tmp_path/'outside';outside.mkdir();root=Path(isolated_env['TEACHER_DEV_ROOT']);root.symlink_to(outside,target_is_directory=True)
    with pytest.raises(ValueError,match='symbolic links'):launcher.configure('demo')
    assert not list(outside.iterdir())


def test_root_layout_platform_entrypoints_and_private_config_exclusion(tmp_path):
    assert all(p.is_relative_to(ROOT/'deploy') for p in ROOT.rglob('*.cmd'))
    assert all(p.parent==ROOT for p in ROOT.rglob('*.sh'))
    assert not list(ROOT.glob('*.cmd')) and not list(ROOT.glob('requirements*.lock'))
    assert not (ROOT/'start.py').exists() and not (ROOT/'demo.py').exists()
    assert (ROOT/'deploy/shared/launcher.py').is_file()
    assert not (ROOT/'deploy/windows/launcher.py').exists()
    assert (ROOT/'deploy/shared/config/storage.example.toml').is_file()
    scripts={p.name:p.read_text() for p in (ROOT/'deploy/windows').glob('*.cmd')}
    assert 'fresh --profile demo' in scripts['start.cmd']
    assert 'start --profile demo' in scripts['start-existing.cmd']
    assert 'TEACHER_VENV' in scripts['launch.cmd'] and 'Miniconda' not in scripts['launch.cmd']
    assert all(p.read_bytes().count(b'\n')==p.read_bytes().count(b'\r\n') for p in (ROOT/'deploy/windows').glob('*.cmd'))
    (tmp_path/'local.cmd').write_text('secret');(tmp_path/'local.example.cmd').write_text('example')
    assert 'local.cmd' not in inventory(tmp_path) and 'local.example.cmd' in inventory(tmp_path)


@pytest.mark.skipif(os.name!='posix',reason='Linux shell entrypoint; not a Windows requirement')
def test_linux_entry_forwards_configured_interpreter_without_mutation(tmp_path):
    fake=tmp_path/'fake python';output=tmp_path/'args.json'
    fake.write_text('#!/usr/bin/env python3\nimport json,sys,os\nfrom pathlib import Path\nPath(os.environ["CAPTURE_PATH"]).write_text(json.dumps(sys.argv[1:]))\n');fake.chmod(0o700)
    env=os.environ|{'TEACHER_PYTHON':str(fake),'CAPTURE_PATH':str(output)}
    subprocess.run(['bash',str(ROOT/'start.sh'),'--ready'],env=env,check=True)
    args=json.loads(output.read_text())
    assert args==['deploy/shared/launcher.py','start','--profile','normal','--no-browser','--ready']
