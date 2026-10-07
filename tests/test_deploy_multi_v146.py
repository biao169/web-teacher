"""Multi-instance lifecycle: temporary files and fake host commands only."""
import json
import shlex
import socket
from pathlib import Path
from types import SimpleNamespace as NS
import pytest
from deploy.linux import tweb
from deploy.vps.release import render


def make_manager(tmp_path,monkeypatch,name):
    base=tmp_path/name
    layout=tweb.Layout(base=base,config=tmp_path/('etc-'+name),data=base/'data',
        unit=tmp_path/'units'/('teacher-site-'+name+'.service'),command=tmp_path/'bin'/name,
        instance=name,user='teacher-'+name)
    layout.unit.parent.mkdir(exist_ok=True);layout.command.parent.mkdir(exist_ok=True)
    events=[]
    def runner(argv,**kw):
        a=list(map(str,argv));events.append(a)
        if 'deploy.vps.release' in a:
            out=Path(a[a.index('--output')+1]);out.mkdir()
            (out/layout.unit.name).write_text(f'User={layout.user}\nGroup={layout.user}\nEnvironmentFile={layout.config}/teacher-site.env\nExecStart={layout.current}/.venv/bin/python -m deploy.shared.service backend.entrypoints.vps:app --port 8003\n')
        return NS(stdout='not-found' if 'show' in a else '',returncode=1 if a[0]=='pgrep' else 0)
    def absent(*a):raise KeyError()
    import grp
    monkeypatch.setattr(tweb.pwd,'getpwnam',absent);monkeypatch.setattr(grp,'getgrnam',absent)
    m=tweb.Manager(layout,runner)
    monkeypatch.setattr(m,'active',lambda:True);monkeypatch.setattr(m,'healthy',lambda:None)
    def fetch(*a):
        p=base/'releases'/str(len(list((base/'releases').iterdir()))+1);p.mkdir()
        for name,text in [('deploy/linux/tweb.py','MULTI_LAYOUT_VERSION = 1'),('frontend/a.css','a'),('backend/a.py','x=1'),('database/schema.sql','sql'),('pyproject.toml','project')]:
            f=p/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(text)
        return p,'commit'
    monkeypatch.setattr(m,'fetch',fetch)
    args=NS(repo=tweb.DEFAULT_REPOSITORY,branch='web-py',domain=name+'.example.org',python='/usr/bin/python3',port=free_port(),pip_source='tuna')
    m.install(args)
    return m,events


def free_port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]


def test_two_install_update_remove_are_isolated(tmp_path,monkeypatch):
    a,events=make_manager(tmp_path,monkeypatch,'alpha')
    b,other_events=make_manager(tmp_path,monkeypatch,'beta')
    keep=b.l.data/'keep';keep.write_text('keep')
    wrapper=a.l.command.read_text()
    assert '--instance alpha' in wrapper and '--command alpha' in wrapper
    assert shlex.quote(str(a.l.base)) in wrapper
    assert a.service!=b.service and a.user!=b.user
    assert str(a.l.config) in a.l.unit.read_text()
    assert a.load()['layout']==tweb.layout_identity(a.l)
    a.update(NS(repo=None,branch=None,scope='all',reset=False,confirm=None))
    assert '--instance alpha' in a.l.command.read_text()
    assert ['systemctl','stop',a.service] in events
    a.remove('all','DELETE')
    assert not a.l.base.exists() and not a.l.command.exists() and not a.l.unit.exists()
    assert keep.read_text()=='keep' and b.load()['phase']=='ready'
    assert not any(b.service in e or b.user in e for e in events)


def test_render_custom_config_and_account(tmp_path):
    render(tmp_path/'out','/srv/teachers/alpha','a.example.org',None,'/srv/teachers/alpha/current/.venv/bin/python',8019,
           'teacher-site-alpha.service','teacher-alpha','/etc/teacher-site-alpha')
    unit=(tmp_path/'out/teacher-site-alpha.service').read_text()
    assert 'User=teacher-alpha' in unit and 'Group=teacher-alpha' in unit
    assert 'EnvironmentFile=/etc/teacher-site-alpha/teacher-site.env' in unit
    assert '--port 8019' in unit and '/srv/teachers/alpha/data' in unit
    assert 'TEACHER_CONFIG=/etc/teacher-site-alpha/storage.toml' in (tmp_path/'out/teacher-site.env').read_text()


def test_identity_mismatch_and_missing_marker_prevent_deletion(tmp_path,monkeypatch):
    m,events=make_manager(tmp_path,monkeypatch,'alpha');events.clear()
    (m.l.base/'.tweb-instance.json').write_text(json.dumps({'instance':'beta'}))
    with pytest.raises(ValueError,match='身份'):m.uninstall('DELETE')
    assert m.l.data.exists() and not any('disable' in e for e in events)
    (m.l.base/'.tweb-instance.json').unlink();(m.l.config/'.tweb-instance.json').unlink();m.l.state.unlink()
    with pytest.raises(ValueError,match='无法确认'):m.uninstall('DELETE')
    assert m.l.data.exists()


def test_recovery_with_deleted_base_marker_uses_matching_state(tmp_path,monkeypatch):
    m,_=make_manager(tmp_path,monkeypatch,'alpha')
    (m.l.base/'.tweb-instance.json').unlink()
    m.uninstall('DELETE');assert not m.l.base.exists()


def test_unknown_command_is_not_overwritten(tmp_path,monkeypatch):
    m,_=make_manager(tmp_path,monkeypatch,'alpha');m.l.command.write_text('unrelated command')
    monkeypatch.setattr(tweb.shutil,'which',lambda n:str(m.l.command))
    with pytest.raises(ValueError,match='占用'):tweb.command_available(m.l)
    assert m.l.command.read_text()=='unrelated command'


def test_invalid_and_nested_paths():
    for p in ('/','/opt','/etc/a','/opt/../etc','/opt/a b','/opt/teacher-site/child'):
        with pytest.raises(ValueError):tweb.instance_layout('alpha',p,'alpha')
    for name in ('sudo','../bad','a;id','systemctl'):
        with pytest.raises(ValueError):tweb.instance_layout('alpha','/opt/alpha',name)


def test_port_collision_offers_next_port(monkeypatch):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));sock.listen();port=sock.getsockname()[1]
        monkeypatch.setattr(tweb.sys.stdin,'isatty',lambda:True)
        monkeypatch.setattr('builtins.input',lambda p:'')
        new=tweb.choose_port(port)
        assert new!=port and tweb.port_available(new)
        monkeypatch.setattr(tweb.sys.stdin,'isatty',lambda:False)
        with pytest.raises(ValueError,match='端口'):tweb.choose_port(port)


def test_blank_menu_and_menu_preserve_instance(monkeypatch):
    seen=[]
    monkeypatch.setattr(tweb.sys.stdin,'isatty',lambda:True)
    monkeypatch.setattr('builtins.input',lambda p:'')
    monkeypatch.setattr(tweb,'perform',lambda args:seen.append(args) or 0)
    options=['--instance','alpha','--base','/opt/alpha','--command','alpha']
    assert tweb.main(options)==0 and not seen
    monkeypatch.setattr('builtins.input',lambda p:'1')
    tweb.main(options)
    assert seen[0].instance=='alpha' and seen[0].base=='/opt/alpha' and seen[0].command_name=='alpha'


def test_occupied_unowned_directory_choose_new(tmp_path,monkeypatch):
    old=tmp_path/'old';old.mkdir();(old/'keep').write_text('keep')
    def layout(instance,base,command):
        return tweb.Layout(Path(base),tmp_path/'config',Path(base)/'data',tmp_path/'unit',tmp_path/'cmd',instance,'teacher-'+instance)
    monkeypatch.setattr(tweb,'instance_layout',layout)
    monkeypatch.setattr(tweb,'command_available',lambda l:None)
    monkeypatch.setattr(tweb.Manager,'remnants',lambda m:([m.l.base] if m.l.base.exists() else [],None,None,False))
    monkeypatch.setattr(tweb.sys.stdin,'isatty',lambda:True)
    answers=iter(['1','',''])
    monkeypatch.setattr('builtins.input',lambda p:next(answers))
    args=NS(command_name='alpha',instance='alpha',base=str(old),action='install',port=free_port())
    selected=tweb.select_install_layout(args)
    assert selected.base==Path(str(old)+'-2') and (old/'keep').read_text()=='keep'


def test_uninstall_deletes_only_own_account(tmp_path,monkeypatch):
    m,events=make_manager(tmp_path,monkeypatch,'alpha')
    monkeypatch.setattr(tweb.pwd,'getpwnam',lambda n:NS(pw_uid=1901,pw_dir=str(m.l.data),pw_shell='/usr/sbin/nologin'))
    m.uninstall('DELETE')
    assert ['userdel','teacher-alpha'] in events
    assert ['userdel','teacher-site'] not in events


def test_conflicting_identity_blocks_start(tmp_path,monkeypatch):
    m,events=make_manager(tmp_path,monkeypatch,'alpha')
    (m.l.config/'.tweb-instance.json').write_text(json.dumps({'instance':'other'}))
    with pytest.raises(ValueError,match='身份'):m.load()


def test_noninteractive_conflict_does_not_delete(tmp_path,monkeypatch):
    base=tmp_path/'occupied';base.mkdir();(base/'keep').write_text('keep')
    layout=tweb.Layout(base,tmp_path/'config',base/'data',tmp_path/'unit',tmp_path/'cmd','alpha','teacher-alpha')
    monkeypatch.setattr(tweb,'instance_layout',lambda *a:layout)
    monkeypatch.setattr(tweb,'command_available',lambda l:None)
    monkeypatch.setattr(tweb.Manager,'remnants',lambda m:([base],None,None,False))
    monkeypatch.setattr(tweb.sys.stdin,'isatty',lambda:False)
    with pytest.raises(ValueError,match='交互'):
        tweb.select_install_layout(NS(command_name='alpha',instance='alpha',base=str(base),action='install',port=8003))
    assert (base/'keep').read_text()=='keep'
