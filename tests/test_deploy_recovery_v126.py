"""Recovery under a temporary layout; never uses host services or user database mutations."""
import json,subprocess,sys
from pathlib import Path
from types import SimpleNamespace as NS
import pytest
from deploy.linux import tweb
from deploy.vps.release import write_manifest,verify

@pytest.fixture
def manager(tmp_path,monkeypatch):
 base=tmp_path/'site';config=tmp_path/'config'
 layout=tweb.Layout(base=base,config=config,data=base/'data',unit=tmp_path/'system/teacher-site.service',command=tmp_path/'bin/tweb')
 events=[]
 def runner(argv,**kw):
  argv=list(map(str,argv));events.append(argv)
  return NS(stdout='not-found' if 'show' in argv else '',returncode=1 if argv[0]=='pgrep' else 0)
 def missing(*a):raise KeyError()
 monkeypatch.setattr(tweb.pwd,'getpwnam',missing)
 import grp
 monkeypatch.setattr(grp,'getgrnam',missing)
 return tweb.Manager(layout,runner),events

def put(p,s):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)

def test_manifest_failure_reports_exact_differences(tmp_path):
 put(tmp_path/'changed.py','old');put(tmp_path/'missing.py','old');write_manifest(tmp_path)
 put(tmp_path/'changed.py','new');(tmp_path/'missing.py').unlink();put(tmp_path/'extra.py','new')
 with pytest.raises(ValueError) as caught:verify(tmp_path)
 assert all(x in str(caught.value) for x in ('changed.py','missing.py','extra.py','--refresh'))

def test_empty_install_runs_directly(manager,monkeypatch):
 m,_=manager;called=[];monkeypatch.setattr(m,'install',lambda a:called.append(a))
 m.install_entry('args');assert called==['args']

def test_residue_menu_blank_exits_without_mutation(manager,monkeypatch):
 m,events=manager;m.l.base.mkdir()
 monkeypatch.setattr(sys.stdin,'isatty',lambda:True);monkeypatch.setattr('builtins.input',lambda q:'')
 m.install_entry(None);assert m.l.base.exists() and len(events)==1

def test_noninteractive_residue_does_not_delete(manager,monkeypatch):
 m,_=manager;put(m.l.data/'media/keep.jpg','keep');monkeypatch.setattr(sys.stdin,'isatty',lambda:False)
 with pytest.raises(ValueError,match='交互'):m.install_entry(None)
 assert (m.l.data/'media/keep.jpg').read_text()=='keep'

def test_clean_without_state_removes_only_scoped_files(manager):
 m,events=manager;put(m.l.data/'media/a.jpg','x');put(m.l.config/'unmarked','x')
 outside=m.l.base.parent/'unrelated.txt';put(outside,'keep')
 put(m.l.command,'exec python '+str(m.l.base/'tweb.py'))
 m.clean_remnants('DELETE')
 assert not m.l.base.exists() and not m.l.config.exists() and not m.l.command.exists()
 assert outside.read_text()=='keep'
 assert any('daemon-reload' in e for e in events)

def test_wrong_confirmation_leaves_data(manager):
 m,_=manager;put(m.l.data/'a','keep')
 with pytest.raises(ValueError):m.clean_remnants('YES')
 assert (m.l.data/'a').exists()

def test_foreign_entry_and_account_rejected(manager):
 m,_=manager;put(m.l.command,'exec other-service')
 with pytest.raises(ValueError,match='不属于'):m.clean_remnants('DELETE')
 m.l.command.unlink()
 with pytest.raises(ValueError,match='账号'):m.recovery_guard(NS(pw_uid=1000,pw_dir='/home/user',pw_shell='/bin/bash'),None)

def test_external_symlink_is_not_traversed(manager):
 m,_=manager;outside=m.l.base.parent/'outside';outside.mkdir();put(outside/'keep','x')
 m.l.base.symlink_to(outside)
 with pytest.raises(ValueError,match='符号链接'):m.clean_remnants('DELETE')
 assert (outside/'keep').exists()

def test_repair_missing_state_preserves_data(manager):
 m,_=manager;put(m.l.data/'a','keep')
 with pytest.raises(ValueError,match='安装记录'):m.repair_install()
 assert (m.l.data/'a').exists()

def test_repair_restores_deleted_deployment_preserves_data(manager,monkeypatch):
 m,events=manager
 state={'repo':tweb.DEFAULT_REPOSITORY,'branch':'web-py','domain':'example.org','port':8008,'python':sys.executable,'phase':'preparing','owned_files':{}}
 put(m.l.state,json.dumps(state));put(m.l.data/'media/a.jpg','keep')
 def fetch(*a):
  fresh=m.l.base/'releases/new';put(fresh/'deploy/linux/tweb.py','# new manager');return fresh,'new-commit'
 monkeypatch.setattr(m,'fetch',fetch);monkeypatch.setattr(m,'prepare',lambda *a:None)
 def generate(*a):
  put(m.l.unit,'WorkingDirectory='+str(m.l.current));put(m.l.config/'storage.toml','defaults')
 monkeypatch.setattr(m,'generate',generate);monkeypatch.setattr(m,'permissions',lambda **k:None)
 monkeypatch.setattr(m,'db',lambda *a:None);monkeypatch.setattr(m,'start',lambda:None)
 m.repair_install()
 assert (m.l.data/'media/a.jpg').read_text()=='keep'
 assert m.l.command.exists() and m.l.current.is_symlink()
 assert json.loads(m.l.state.read_text())['phase']=='ready'
 assert (m.l.data/'.tweb-owned').read_text()==tweb.MARKER
 assert any(e[0]=='useradd' for e in events)

def test_manifest_fetch_failure_does_not_stop_service(manager,monkeypatch):
 m,events=manager;put(m.l.state,json.dumps({'repo':tweb.DEFAULT_REPOSITORY,'branch':'web-py','domain':'example.org','python':sys.executable}))
 def failed(*a):raise ValueError('manifest mismatch')
 monkeypatch.setattr(m,'fetch',failed)
 with pytest.raises(ValueError,match='manifest'):m.repair_install()
 assert not any('stop' in e for e in events)


def test_live_process_prevents_account_and_data_deletion(manager,monkeypatch):
 m,events=manager;put(m.l.data/'media/a.jpg','keep')
 account=NS(pw_uid=12345,pw_dir=str(m.l.data),pw_shell='/usr/sbin/nologin')
 monkeypatch.setattr(m,'remnants',lambda:([m.l.base],account,None,False))
 original=m.runner
 def runner(argv,**kw):
  if argv[0]=='pgrep':return NS(returncode=0,stdout='1234')
  return original(argv,**kw)
 m.runner=runner
 with pytest.raises(ValueError,match='仍有进程'):m.clean_remnants('DELETE')
 assert (m.l.data/'media/a.jpg').read_text()=='keep'
 assert not any(e[0]=='userdel' for e in events)


def test_nested_symlink_does_not_delete_target(manager):
 m,_=manager;outside=m.l.base.parent/'outside';put(outside/'keep','value')
 m.l.base.mkdir();(m.l.base/'link').symlink_to(outside,target_is_directory=True)
 m.clean_remnants('DELETE')
 assert (outside/'keep').read_text()=='value'
