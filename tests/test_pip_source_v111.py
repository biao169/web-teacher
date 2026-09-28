"""Mirror persistence, isolated pip configuration and pre-activation install recovery."""
import os
from types import SimpleNamespace
import pytest
if os.name!='posix':pytest.skip('Linux deployment manager',allow_module_level=True)
from deploy.linux import tweb
from test_linux_manager_v76 import managed,update_args


def test_default_source_and_saved_official_selection(managed):
    m,events,_=managed
    assert m.load()['pip_source']=='tuna'
    assert m.pip_source()==tweb.PIP_SOURCES['tuna']
    m.pip_source('pypi')
    assert m.pip_source()==tweb.PIP_SOURCES['pypi']
    with pytest.raises(ValueError):m.pip_source('http://untrusted')


def test_old_install_defaults_to_tuna(managed):
    m,events,_=managed;state=m.load();state.pop('pip_source');m.save(state)
    assert m.pip_source()==tweb.PIP_SOURCES['tuna']


def test_dependency_command_drops_conflicting_pip_configuration(managed,monkeypatch):
    m,events,_=managed;captured=[]
    monkeypatch.setenv('PIP_INDEX_URL','https://wrong.example/simple')
    monkeypatch.setenv('PIP_EXTRA_INDEX_URL','https://other.example/simple')
    monkeypatch.setenv('PIP_TRUSTED_HOST','files.pythonhosted.org')
    monkeypatch.setenv('PIP_CERT','/configured/ca.pem')
    monkeypatch.setenv('HTTPS_PROXY','http://local-proxy:8080')
    monkeypatch.setattr(m,'run',lambda args,**kw:captured.append((list(map(str,args)),kw)))
    m.install_dependencies(m.release());cmd,kw=captured[0]
    assert cmd[cmd.index('--index-url')+1]==tweb.PIP_SOURCES['tuna']
    assert '--trusted-host' not in cmd and '--retries' in cmd
    env=kw['env'];assert env['PIP_CONFIG_FILE']==os.devnull
    assert not {'PIP_INDEX_URL','PIP_EXTRA_INDEX_URL','PIP_TRUSTED_HOST'} & env.keys()
    assert env['PIP_CERT']=='/configured/ca.pem' and env['HTTPS_PROXY']=='http://local-proxy:8080'
    assert os.environ['PIP_TRUSTED_HOST']=='files.pythonhosted.org'


def test_dependency_update_reuses_shared_installer(managed,monkeypatch):
    m,events,_=managed;seen=[]
    monkeypatch.setattr(m,'install_dependencies',lambda p:seen.append(p))
    m.dependencies();assert seen==[m.release()]


def staged(m):
    release=m.release();m.l.current.unlink();m.l.unit.unlink()
    (release/'data').unlink();(release/'transfer-data').unlink()
    state=m.load();state['phase']='preparing';m.save(state)
    return release


def test_resume_dependency_failure_preserves_data_and_activates(managed):
    m,events,_=managed;release=staged(m);events.clear()
    keep=m.l.data/'media/sentinel';keep.write_text('keep')
    m.resume_install()
    assert m.release()==release and m.load()['phase']=='ready' and keep.read_text()=='keep'
    assert any('pip' in e for e in events) and ['systemctl','enable',tweb.SERVICE] in events
    assert not any('useradd' in e or 'reset-data' in e or 'git' in e for e in events)


def test_resume_retry_failure_does_not_activate(managed,monkeypatch):
    m,events,_=managed;release=staged(m)
    monkeypatch.setattr(m,'install_dependencies',lambda p:(_ for _ in ()).throw(RuntimeError('network failed')))
    with pytest.raises(RuntimeError):m.resume_install()
    assert m.load()['phase']=='preparing' and not m.l.current.exists() and release.exists()


def test_resume_refuses_running_install_and_ambiguous_stage(managed):
    m,events,_=managed;events.clear()
    with pytest.raises(ValueError):m.resume_install()
    assert not events
    staged(m);(m.l.base/'releases/other').mkdir()
    with pytest.raises(ValueError,match='single staged release'):m.resume_install()
    assert not events


def test_install_parser_source_selection():
    parser=tweb.parser()
    assert parser.parse_args(['install','--domain','example.org']).pip_source=='tuna'
    assert parser.parse_args(['install','--domain','example.org','--pip-source','pypi']).pip_source=='pypi'
    assert parser.parse_args(['pip-source','tuna']).name=='tuna'
