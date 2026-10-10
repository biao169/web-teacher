"""Admin ownership, private publication, secrets, retries and no duplicate Cron."""
import json
from pathlib import Path
from types import SimpleNamespace
import pytest
from test_companion_artifacts import ArtifactTests
from test_companion_release import FakeAPI
from admin_release import AdminRelease
from companions import inspect_artifact

@pytest.fixture
def artifact(tmp_path):
    f=ArtifactTests();f.setUp()
    f.cfg.pop('durable_objects');f.cfg.pop('migrations')
    f.cfg.update(name='teacher-admin',triggers={'crons':[]})
    f.cfg['compatibility_flags'].append('python_workers');f.meta['compatibility_flags'].append('python_workers')
    f.meta['bindings']=[b for b in f.meta['bindings'] if b['name']!='SYNC_COORDINATOR']
    f.meta['main_module']='admin_main.py'
    f.parts=[(n,'text/x-python',b'pass') for n in ('admin_main.py','worker_runtime/admin_entrypoint.py','backend/app/native/web_admin.py','generated_admin_templates.py')]
    f.parts.append(('python_modules/workers_runtime_sdk/__init__.py','application/octet-stream',b'\x00\xff'))
    f.write();(tmp_path/'admin.multipart').write_bytes(f.path.read_bytes())
    (tmp_path/'wrangler.admin.jsonc').write_text(json.dumps(f.cfg))
    api=FakeAPI();base=SimpleNamespace(client=api,main='teacher',key='ab'*32,log=lambda *a,**k:None)
    from companion_release import Release
    base.sleep=lambda _:None
    base.confirm=Release.confirm.__get__(base)
    yield tmp_path,api,base,f
    f.doCleanups()

def test_private_admin_deploy_retry_and_secret_rotation(artifact):
    path,api,base,f=artifact
    release=AdminRelease(base,{'TEACHER_SETUP_TOKEN':'setup-token-'*4,'TEACHER_AUX_API_TOKEN':'must-not-escape'})
    release.prepare(path,path);release.prepare(path,path)
    assert sum(m=='PUT' and not suffix for m,_,suffix in api.calls)==1
    script=api.scripts['teacher-admin']
    assert script['schedules']=={'schedules':[]}
    assert script['subdomain']=={'enabled':False,'previews_enabled':False}
    bindings={b['name']:b for b in script['settings']['bindings']}
    assert bindings['TEACHER_SETUP_TOKEN']['type']=='secret_text'
    assert 'TEACHER_AUX_API_TOKEN' not in bindings
    AdminRelease(base,{'TEACHER_SETUP_TOKEN':'changed-'*8}).prepare(path,path)
    assert sum(m=='PUT' and not suffix for m,_,suffix in api.calls)==2

def test_admin_name_conflict_stops_before_mutation(artifact):
    path,api,base,f=artifact
    api.scripts['teacher-admin']={'settings':{'bindings':[]}}
    with pytest.raises(ValueError,match='ownership'):AdminRelease(base).prepare(path,path)
    assert all(m=='GET' for m,_,_ in api.calls)

def test_admin_rejects_cron_do_and_public_route_config(artifact):
    path,api,base,f=artifact
    for key,value in [('routes',[]),('durable_objects',{}),('assets',{}),('migrations',[])]:
        cfg={**f.cfg,key:value}
        with pytest.raises(ValueError):inspect_artifact(path/'admin.multipart',cfg,'teacher','admin')


def test_admin_stale_revision_uses_shared_confirmation(artifact):
    path,api,base,f=artifact
    original=api.request;remaining=[2];logs=[];base.log=lambda *a,**kw:logs.append((a,kw))
    def request(method,name,suffix='',*args,**kwargs):
        result=original(method,name,suffix,*args,**kwargs)
        if method=='GET' and suffix=='/settings' and result and remaining[0]:
            remaining[0]-=1
            for b in result['bindings']:
                if b['name']=='TEACHER_AUX_REVISION':b['text']='old'
        return result
    api.request=request;AdminRelease(base).prepare(path,path)
    checks=[kw for args,kw in logs if args[0]=='ADMIN-CONFIG-CHECK']
    assert len(checks)==3 and checks[-1]['confirmed']
