"""Platform variables, current-request adapters and transactional VPS domain updates."""
import ast,json,os
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import Mock
import pytest
if os.name!='posix':pytest.skip('Linux deployment integration checks',allow_module_level=True)
from backend.app.security.http import AuthConfig
from backend.app.config import Settings
from deploy.vps.release import render
from deploy.linux import tweb
from deploy.shared.worker_package import prepare
from deploy.cloudflare.domains import settings,apply
from test_linux_manager_v76 import managed
from test_deploy_controls_v108 import unit_with_port,free_port
from test_runtime_step3 import site as setup_site,TOKEN,PASSWORD
from test_transfer_step4 import fixture as worker_transfer

ROOT=Path(__file__).resolve().parents[1]
ALIAS='https://alias.example.test'

def test_worker_vars_packaging_and_multiple_custom_domains(tmp_path):
    values=settings({'TEACHER_ORIGIN':'https://primary.university.edu','TEACHER_ALLOWED_ORIGINS':'https://teacher.account.workers.dev','TEACHER_CUSTOM_DOMAINS':'primary.university.edu,alias.university.edu'},'teacher')
    cfg={};apply(cfg,values)
    assert [x['pattern'] for x in cfg['routes']]==['primary.university.edu','alias.university.edu']
    out=prepare(False,['--output',str(tmp_path/'worker'),'--database-id','12345678-1234-1234-1234-123456789abc','--origin',values['origin'],'--allowed-origins',','.join(values['allowed_origins']),'--bucket','media'],migration_plan=False)
    variables=json.loads((out/'wrangler.json').read_text())['vars']
    c=AuthConfig.from_env(variables)
    assert c.allowed_origins==values['allowed_origins'] and 'https://alias.university.edu' in c.allowed_origins
    assert (out/'site_sync/integration/web.py').exists()

def test_runtime_worker_reads_bindings_allowlist_without_global_env():
    tree=ast.parse((ROOT/'backend/entrypoints/worker.py').read_text())
    factory=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='resource_factory')
    ns=dict(Settings=Settings,Path=Path,SimpleNamespace=NS,credentials=lambda e:{},ENV_KEYS={},DEPLOY_VARS=(),allowed_hosts=lambda e:[],translation_credentials=lambda e:{},D1SQL=lambda b:b,Passwords=lambda k:k,derive=None,renderer=None,AuthConfig=AuthConfig,R2Store=lambda b,p:(b,p),CrossrefTransport=lambda:None,TranslationTransport=lambda h:None)
    exec(compile(ast.Module(body=[factory],type_ignores=[]),'worker-test','exec'),ns)
    env=NS(DB=object(),MEDIA=object(),TEACHER_ORIGIN='https://primary.example.test',TEACHER_ALLOWED_ORIGINS=ALIAS)
    resource=ns['resource_factory'](NS(scope={'env':env}))
    assert resource.config.request_origin(NS(headers={'host':'alias.example.test'}))==ALIAS


def test_setup_accepts_alias_but_rejects_another_allowed_origin(setup_site):
    c,r,_=setup_site;primary=r.config.origin;r.config=AuthConfig.from_origin(primary,ALIAS)
    data={'token':TOKEN,'username':'first-admin','password':PASSWORD,'confirm':PASSWORD}
    assert c.get(ALIAS+'/setup').status_code==200
    assert c.post(ALIAS+'/setup',data=data,headers={'Origin':primary}).status_code==403
    assert c.post(ALIAS+'/setup',data=data,headers={'Origin':ALIAS}).status_code==200

def test_worker_transfer_uses_current_allowed_domain(worker_transfer):
    c,r=worker_transfer;r.config=AuthConfig.from_origin(r.config.origin,ALIAS)
    headers={'Origin':ALIAS,'X-CSRF-Token':r.p['csrf']}
    # Fixture's synthetic session belongs to its mocked principal; test request adapter.
    assert c.get(ALIAS+'/transfer/').status_code==200
    reply=c.post(ALIAS+'/transfer/api/settings',json={'revision':0,'enabled':True,'vpnGuard':False,'temporaryShare':True},headers=headers)
    assert reply.status_code==200,reply.text
    assert c.post(ALIAS+'/transfer/api/tasks',json={'name':'alias.txt','size':1},headers=headers).status_code==200
    assert c.post(ALIAS+'/transfer/api/tasks',json={'name':'bad','size':1},headers={**headers,'Origin':r.config.origin}).status_code==403

def test_vps_renderer_outputs_aliases_and_canonical(tmp_path):
    render(tmp_path/'out','/opt/teacher-test','primary.example.test',None,'/opt/teacher-test/venv/bin/python',allowed_origins=ALIAS)
    env=(tmp_path/'out/teacher-site.env').read_text();proxy=(tmp_path/'out/Caddyfile.fragment').read_text()
    assert 'TEACHER_ORIGIN=https://primary.example.test\n' in env
    assert 'TEACHER_ALLOWED_ORIGINS=https://primary.example.test,'+ALIAS in env
    assert 'primary.example.test, alias.example.test {' in proxy


def test_manager_preserves_aliases_on_port_changes(managed):
    m,events,_=managed;unit_with_port(m)
    env=m.l.config/'teacher-site.env';env.write_text(env.read_text()+'EXTRA=keep\n')
    env.chmod(0o640);metadata=env.stat()
    m.configure(allowed_origins=ALIAS)
    assert (env.stat().st_mode,env.stat().st_uid,env.stat().st_gid)==(metadata.st_mode,metadata.st_uid,metadata.st_gid)
    assert ALIAS in m.load()['allowed_origins'] and ALIAS in env.read_text() and 'EXTRA=keep' in env.read_text()
    m.configure(free_port())
    for file in ['Caddyfile.fragment','nginx-location.conf']:
        assert 'alias.example.test' in (m.l.config/'generated'/file).read_text()
    assert ALIAS in env.read_text()
    args=tweb.parser().parse_args(['domains','--allowed-origins',ALIAS])
    assert args.action=='domains' and args.allowed_origins==ALIAS


def test_domain_update_rolls_back_when_restart_fails(managed,monkeypatch):
    m,events,_=managed;unit_with_port(m);old=m.load()
    env=m.l.config/'teacher-site.env';env.chmod(0o640);before=env.read_bytes();calls=[]
    def health():
        calls.append(1)
        if len(calls)==1:raise RuntimeError('health failed')
    monkeypatch.setattr(m,'healthy',health)
    with pytest.raises(RuntimeError):m.configure(allowed_origins=ALIAS)
    assert env.read_bytes()==before and m.load()==old
    assert env.stat().st_mode & 0o777==0o640

@pytest.mark.parametrize('value',['http://alias.test','https://*.test','https://alias.test/path','https://alias.test:8443','https://u:p@alias.test'])
def test_manager_rejects_alias_before_stopping(managed,value):
    m,events,_=managed;unit_with_port(m);events.clear()
    with pytest.raises(ValueError):m.configure(allowed_origins=value)
    assert not events
