"""Persistent adjustment, acknowledgement loss and interrupted-owner recovery."""
import asyncio,json
from pathlib import Path
import pytest
from site_sync.core import adaptive
from site_sync.adapters.sqlite import SQLite
from site_sync.adapters.d1 import D1
from site_sync.adapters.tasks import Tasks
from site_sync.deploy.schema import ensure
from site_sync.tests.schema_fixture import core_plan
from site_sync.tests.test_database import Binding
run=asyncio.run

@pytest.fixture(params=['sqlite','d1'])
def system(request):
    raw=SQLite();run(ensure(raw,core_plan(Path(__file__).resolve().parents[2]/'database/schema.sql')))
    raw.connection.execute("INSERT INTO sync_peers VALUES('p','https://peer.invalid','env:KEY','p1',1)")
    binding=Binding(raw);db=D1(binding) if request.param=='d1' else raw
    repo=Tasks(db,lease_seconds=10,platform='worker')
    run(repo.put_grant(grant_id='g',principal_id='admin',scope=['news'],can_write=True,can_delete=True))
    t=run(repo.create(peer_id='p',grant_id='g',scope=['news'],operation_id='test',now=100,mode='scheduled',settings={'slice_bytes':32768}))
    yield raw,db,repo,binding,t
    raw.close()

def pressure():return {'error_category':'resource','causes':[{'platform_code':1102}]}

def test_error_evidence_distinguishes_credentials_cpu_memory_and_unknown():
    assert adaptive.classify({'error_category':'credential'},resource=True)=='credential'
    for outcome,kind in [('exceededCpu','cpu'),('exceededMemory','memory')]:
        assert adaptive.classify({'platform_outcome':outcome,'evidence_source':'cloudflare-telemetry'})==kind
        assert adaptive.classify({'platform_outcome':outcome})=='none'
    assert adaptive.classify(pressure())=='resource_unknown'
    assert adaptive.classify({'causes':[{'platform_code':1101}],'error_category':'http'},resource=True)=='exception'
    assert adaptive.classify({'error_category':'http','causes':[{'http_status':503}]},resource=True)=='http'
    assert adaptive.classify({'causes':[{'code':'SYNC_RPC_FAILED'}]})=='rpc_unknown'

def test_shrink_is_atomic_and_replayed_finish_cannot_shrink_twice(system):
    raw,db,repo,binding,t=system;claimed=run(repo.claim(100))
    run(repo.finish(claimed,100,error='ResourceError',resource=True,diagnostic=pressure()))
    after=run(repo.read(t['task_id']));assert after['slice_bytes']==16384
    state=run(adaptive.read(db,t['task_id']));assert state['last_pressure_kind']=='resource_unknown'
    assert run(repo.finish(claimed,101,error='ResourceError',resource=True,diagnostic=pressure())) is False
    assert run(adaptive.read(db,t['task_id']))==state
    event=run(db.query("SELECT detail FROM sync_events WHERE kind='error'"))[0]
    assert json.loads(event['detail'])['adaptation']['after_bytes']==16384

def test_progress_before_interruption_survives_reconstruction(system):
    raw,db,repo,binding,t=system;owner=run(repo.claim(100))
    run(repo.add_item(owner,item_id='one',module='news',record_id='one',source_version='v1',now=100))
    fresh=Tasks(db,lease_seconds=10,platform='worker')
    assert run(fresh.reconcile_one(110));assert not run(fresh.reconcile_one(110))
    after=run(fresh.read(t['task_id']))
    assert after['progress_seq']==1 and after['no_progress_count']==0 and after['slice_bytes']==16384
    assert len(run(db.query('SELECT * FROM sync_items WHERE task_id=?',(t['task_id'],))))==1
    assert run(adaptive.read(db,t['task_id']))['classification']=='interrupted'

def test_network_and_credentials_do_not_shrink_and_retry_is_bounded(system):
    raw,db,repo,binding,t=system;now=100
    for i in range(9):
        owner=run(repo.claim(now));run(repo.finish(owner,now,error='CredentialRetryError',diagnostic={'error_category':'credential'}))
        after=run(repo.read(t['task_id']));delay=after['next_run_at']-now
        assert 10<=delay<=1800 and after['slice_bytes']==32768
        if i>=3:assert delay>=60
        now=after['next_run_at']
    owner=run(repo.claim(now));run(repo.finish(owner,now,error='ResourceError',resource=True,diagnostic={'error_category':'http','causes':[{'http_status':503}]}))
    assert run(repo.read(t['task_id']))['slice_bytes']==32768

def test_growth_requires_committed_body_progress_and_time(system):
    raw,db,repo,binding,t=system;owner=run(repo.claim(100))
    run(repo.finish(owner,100,error='ResourceError',resource=True,diagnostic=pressure()))
    now=110
    for i in range(8):
        owner=run(repo.claim(now));run(repo.add_item(owner,item_id=str(i),module='news',record_id=str(i),source_version='v1',now=now))
        owner['_body_progress']=True
        run(repo.finish(owner,now));now=run(repo.read(t['task_id']))['next_run_at']
    assert run(repo.read(t['task_id']))['slice_bytes']==16384
    assert run(adaptive.read(db,t['task_id']))['success_streak']==8
    owner=run(repo.claim(400));run(repo.add_item(owner,item_id='later',module='news',record_id='later',source_version='v1',now=400));owner['_body_progress']=True
    run(repo.finish(owner,400))
    assert run(repo.read(t['task_id']))['slice_bytes']==20480
    assert run(adaptive.read(db,t['task_id']))['success_streak']==0

def test_lost_finish_ack_preserves_one_adjustment(system):
    raw,db,repo,binding,t=system
    if not isinstance(db,D1):pytest.skip('D1 lost acknowledgement contract')
    owner=run(repo.claim(100));binding.lose=True
    with pytest.raises(RuntimeError,match='response lost'):
        run(repo.finish(owner,100,error='ResourceError',resource=True,diagnostic=pressure()))
    assert run(repo.read(t['task_id']))['slice_bytes']==16384
    assert run(repo.finish(owner,101,error='ResourceError',resource=True,diagnostic=pressure())) is False
    assert len(run(db.query("SELECT * FROM sync_events WHERE kind='error'")))==1

def test_corrupt_policy_is_reconstructed_without_resetting_task(system):
    raw,db,repo,binding,t=system
    raw.connection.execute('INSERT INTO service_meta(key,value) VALUES(?,?)',(adaptive.PREFIX+t['task_id'],'{broken'))
    owner=run(repo.claim(100));run(repo.finish(owner,100))
    assert run(repo.read(t['task_id']))['status']=='waiting'
    event=json.loads(run(db.query("SELECT detail FROM sync_events WHERE kind='step'"))[0]['detail'])
    assert event['adaptation']['state_reset'] is True
    assert 'state_reset' not in run(adaptive.read(db,t['task_id']))

def test_policy_floor_ceiling_disabled_idle_and_error():
    t={'slice_bytes':4096,'min_slice_bytes':4096,'initial_slice_bytes':4*1024*1024,'auto_shrink':1}
    size,s=adaptive.adjust(t,adaptive.empty(),100,'resource_unknown',failed=True)
    assert size==4096 and s['action']=='floor'
    for _ in range(100):size,s=adaptive.adjust(t,s,1000,'none',progress=False,body_success=True)
    assert size==4096 and s['success_streak']==0
    size,s=adaptive.adjust(dict(t,auto_shrink=0),s,1001,'memory',failed=True)
    assert size==4096 and s['action']=='disabled'
    t.update(slice_bytes=4*1024*1024-1)
    s.update(success_streak=7,last_adjusted_at=0,last_pressure_at=0)
    size,s=adaptive.adjust(t,s,2000,'none',progress=True,body_success=True)
    assert size==4*1024*1024

def test_adjustment_write_failure_rolls_back_task_finish(system):
    raw,db,repo,binding,t=system;owner=run(repo.claim(100))
    raw.connection.execute("CREATE TRIGGER reject_policy BEFORE INSERT ON service_meta WHEN NEW.key LIKE 'sync:adaptive:%' BEGIN SELECT RAISE(ABORT,'policy write failed'); END")
    with pytest.raises(Exception,match='policy write failed'):
        run(repo.finish(owner,100,error='ResourceError',resource=True,diagnostic=pressure()))
    row=run(repo.read(t['task_id']))
    assert row['status']=='running' and row['slice_bytes']==32768 and row['total_errors']==0
    assert run(db.query("SELECT * FROM sync_events WHERE kind='error'"))==[]
    raw.connection.execute('DROP TRIGGER reject_policy')
    assert run(Tasks(db,lease_seconds=10).reconcile_one(110))
    assert run(repo.read(t['task_id']))['slice_bytes']==16384

def test_admin_reads_are_passive_and_manual_setting_resets_evidence(system):
    from site_sync.admin.service import Admin,Actor
    from site_sync.core.authority import ConflictError
    raw,db,repo,binding,t=system;owner=run(repo.claim(100))
    run(repo.finish(owner,100,error='ResourceError',resource=True,diagnostic=pressure()))
    admin=Admin(repo,lambda:110);actor=Actor('admin','g');before=run(repo.read(t['task_id']))
    detail=run(admin.detail(actor,t['task_id']));assert detail['adaptation']['action']=='shrink'
    assert run(repo.read(t['task_id']))==before
    values={'revision':before['revision'],'slice_bytes':65536,'min_slice_bytes':4096,'fast_retries':30,'slow_retry_seconds':900,'auto_shrink':True}
    with pytest.raises(ConflictError):run(admin.command(actor,t['task_id'],'settings',dict(values,revision=0)))
    assert run(adaptive.read(db,t['task_id']))['action']=='shrink'
    run(admin.command(actor,t['task_id'],'settings',values))
    assert run(adaptive.read(db,t['task_id']))==adaptive.empty()
    assert run(repo.read(t['task_id']))['slice_bytes']==65536
