"""Step 1 platform selection, signed peer bounds and unchanged wire format."""
import ast,asyncio,subprocess,sys
from pathlib import Path
from types import SimpleNamespace as NS
import pytest
from backend.app.native import site_sync_limits as limits,site_sync_work as work
from backend.app.native import site_sync as core,site_sync_tasks as tasks,site_sync_transport as transport
from tests.test_sync_platform_v131 import pair,local_pair
run=asyncio.run
ROOT=Path(__file__).resolve().parents[1]

def test_profiles_are_immutable_and_isolated():
    local=NS(kind='local');worker=NS(kind='r2')
    assert limits.for_resource(local) is limits.STANDARD
    assert limits.for_resource(worker) is limits.WORKER
    assert limits.for_kind('unknown') is limits.WORKER
    with pytest.raises(TypeError):limits.WORKER['content_rows']=99
    first=work.policy(local);first['content_rows']=99
    assert work.policy(local)['content_rows']==5 and work.policy(worker)['content_rows']==1
    assert work.policy(local)['mode']=='standard' and work.policy(worker)['mode']=='ultra_low'
    assert work.PROTOCOL==7 and work.TASK_FORMAT==8
    assert work.policy(worker)['media_chunk_bytes']==65536
    assert limits.WORKER['media_chunk_bytes']==4096  # v174 minimum default for new negotiated files
    assert limits.AUTO_PULL_CANDIDATES==500
    assert limits.AUTO_PULL_ORDER==('updated_at DESC','id DESC','module DESC')

@pytest.mark.parametrize('hint',[None,{},'wrong',{'content_rows':True,'version_rows':-1},{'content_rows':999999,'version_rows':999999}])
def test_peer_hints_cannot_increase_worker_budget(hint):
    p=work.policy(NS(kind='r2'),hint)
    assert p['content_rows']==1 and p['version_rows']==1
    p=work.policy(NS(kind='local'),work.policy(NS(kind='r2')))
    assert p['content_rows']==1 and p['version_rows']==1 and p['brief_rows']==1

def test_limits_import_has_no_application_or_database_cost():
    script="import sys; from backend.app.native import site_sync_limits; assert not any(n in sys.modules for n in ('sqlite3','fastapi','js','backend.app.native.catalog','backend.app.native.site_sync_tasks'))"
    subprocess.run([sys.executable,'-B','-c',script],cwd=ROOT,check=True)

def test_worker_resource_factory_attaches_profile_without_io():
    from backend.app.config import Settings
    from backend.app.security.http import AuthConfig
    tree=ast.parse((ROOT/'backend/entrypoints/worker.py').read_text())
    factory=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='resource_factory')
    ns=dict(Settings=Settings,Path=Path,SimpleNamespace=NS,for_kind=limits.for_kind,
        credentials=lambda e:{},ENV_KEYS={},DEPLOY_VARS=(),allowed_hosts=lambda e:[],
        translation_credentials=lambda e:{},D1SQL=lambda b:b,Passwords=lambda k:k,derive=None,
        renderer=None,AuthConfig=AuthConfig,R2Store=lambda b,p:(b,p),
        CrossrefTransport=lambda:None,TranslationTransport=lambda h:None)
    exec(compile(ast.Module(body=[factory],type_ignores=[]),'worker-factory','exec'),ns)
    env=NS(DB=object(),MEDIA=object(),CACHE=object(),TEACHER_ORIGIN='https://worker.example.org',TEACHER_ALLOWED_ORIGINS='https://alias.example.org')
    resource=ns['resource_factory'](NS(scope={'env':env}))
    assert resource.kind=='r2' and resource.sync_limits is limits.WORKER
    assert resource.config.allowed_origins==('https://worker.example.org','https://alias.example.org')

def test_new_tasks_negotiate_and_persist_existing_page_knobs(pair):
    api,_,a,b,*_=pair
    local_policy=work.policy(a);peer_policy=api('test')['policy']
    uid=api('start',{'direction':'pull','scopes':['students']})['uid']
    state=run(tasks.get(a.sql,uid))['state']
    assert state['policy']['mode']==local_policy['mode']
    for field in ('content_rows','version_rows','brief_rows'):
        assert state['policy'][field]==min(local_policy[field],peer_policy[field])
    assert state['policy']['media_chunk_bytes']==65536
    assert api('get',{'uid':uid})['policy']==state['policy']

def test_worker_peer_caps_old_client_paging_requests(pair):
    _,_,a,b,*_=pair
    for source,target in ((a,b),(b,a)):
        peer=run(tasks.peer(source.sql));budget=limits.for_resource(target)
        for op,field,maximum in [('brief-page','brief_rows',20),('revision-page','version_rows',20),('page','content_rows',5)]:
            after='';seen=[]
            for _ in range(20):
                result=run(transport.call(source,peer,{'op':op,'schema':core.schema(),'protocol':core.PROTOCOL,'table':'students','after':after,'limit':maximum}))
                assert len(result['rows'])<=budget[field]
                seen.extend(row['uid'] for row in result['rows'])
                if result['next'] is None:break
                after=result['next']
            else:pytest.fail('Cursor did not finish')
            actual=run(target.sql.query('SELECT uid FROM students ORDER BY uid'))
            assert seen==[row['uid'] for row in actual]

def test_brief_preview_reads_one_row_with_worker_on_either_side(pair):
    api,_,a,b,*_=pair
    uid=api('start',{'direction':'pull','scopes':['students'],'preview_mode':'brief'})['uid']
    state=run(tasks.get(a.sql,uid))['state'];assert state['policy']['brief_rows']==1
    for _ in range(2):
        before=state['count'];api('advance',{'uid':uid});state=run(tasks.get(a.sql,uid))['state']
        assert state['count']-before<=1
    assert state['preview_format']==8
