"""Independent three-hour route, shared durable gates, separate observable receipts."""
import asyncio,json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from test_startup_lazy import entry
from tests.test_site_sync_v121 import pair
from tests.test_sync_grant_errors_v169 import seed
from backend.app.native import site_sync_dispatch as dispatch,site_sync_work as work
from backend.app.native.site_sync_gate import load
run=asyncio.run


def test_watchdog_uses_explicit_cron_at_transfer_slot_and_separate_heartbeat(pair,entry,monkeypatch):
    from worker_runtime import maintenance,watchdog,cron_health
    from backend.app.adapters.d1 import sql as d1
    sql=pair[2].sql;monkeypatch.setattr(d1,'D1SQL',lambda _:sql)
    normal=AsyncMock(side_effect=AssertionError('minute path must not run'))
    monkeypatch.setattr(maintenance,'run',normal)
    async def patrol(sql,bindings):
        value=await load(sql,cron_health.WATCHDOG_KEY)
        assert value['status']=='running' and value['job']=='watchdog'
        assert not await load(sql,cron_health.KEY)
        return {'status':'prepared'}
    monkeypatch.setattr(watchdog,'run',patrol)
    worker=entry.Default()
    assert run(worker.scheduled(SimpleNamespace(cron=cron_health.WATCHDOG_CRON,scheduledTime=0),SimpleNamespace(DB=object())))=={'status':'prepared'}
    saved=run(load(sql,cron_health.WATCHDOG_KEY))
    assert saved['status']=='finished' and saved['result']=='prepared'
    normal.assert_not_awaited()
    assert not run(load(sql,cron_health.KEY))
    monitor=pair[0]('monitor');assert monitor['watchdog']['result']=='prepared'


def test_watchdog_failure_does_not_overwrite_minute_receipt(pair,entry,monkeypatch):
    from worker_runtime import watchdog,cron_health
    from backend.app.adapters.d1 import sql as d1
    sql=pair[2].sql;monkeypatch.setattr(d1,'D1SQL',lambda _:sql)
    minute=run(cron_health.start(sql,'sync'));run(cron_health.finish(sql,minute,result={'status':'ok'}))
    before=run(load(sql,cron_health.KEY))
    monkeypatch.setattr(watchdog,'run',AsyncMock(side_effect=RuntimeError('PRIVATE')))
    with pytest.raises(RuntimeError):run(entry.Default().scheduled(SimpleNamespace(cron=cron_health.WATCHDOG_CRON),SimpleNamespace(DB=object())))
    saved=run(load(sql,cron_health.WATCHDOG_KEY))
    assert saved['status']=='failed' and saved['error_type']=='RuntimeError' and 'PRIVATE' not in str(saved)
    assert run(load(sql,cron_health.KEY))==before


def test_watchdog_alone_can_preflight_then_advance_without_minute_events(pair,entry,monkeypatch):
    from worker_runtime.watchdog import run as patrol
    import builtins
    api,_,r,*_=pair;uid=seed(api,r);before=run(work.position(r.sql,uid))['checkpoint']
    original=builtins.__import__
    def light(name,*args,**kwargs):
        if name in ('worker_runtime.sync_resources','backend.app.native.site_sync_schedule','backend.app.native.site_sync_latest_runtime'):
            raise AssertionError('business imported in preflight')
        return original(name,*args,**kwargs)
    with monkeypatch.context() as m:
        m.setattr(builtins,'__import__',light)
        assert run(patrol(r.sql,object()))['status']=='prepared'
    assert run(work.position(r.sql,uid))['checkpoint']==before
    assert run(patrol(r.sql,object()))['status']=='ok'
    assert run(work.position(r.sql,uid))['checkpoint']!=before
    assert run(load(r.sql,dispatch.KEY))['source']=='worker-watchdog'


def test_watchdog_reconciles_expired_running_receipt_without_business(pair,entry):
    from worker_runtime.watchdog import run as patrol
    api,_,r,*_=pair;uid=seed(api,r,'running')
    assert run(patrol(r.sql,object()))['status']=='reconciled'
    saved=run(work.position(r.sql,uid))['work']
    assert saved['status']=='paused' and saved['error_code']=='sync_unconfirmed' and saved['retryable']
    assert run(patrol(r.sql,object()))['skipped']=='interval'
    assert run(work.position(r.sql,uid))['work']==saved


@pytest.mark.parametrize('change',['pause','cooldown','lease','permission'])
def test_watchdog_does_not_bypass_task_controls(pair,entry,change):
    from worker_runtime.watchdog import run as patrol
    from backend.app.native.site_sync_recovery import now
    api,_,r,*_=pair;uid=seed(api,r)
    if change=='pause':api('manual-pause',{'uid':uid})
    elif change=='cooldown':run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work.retry_after','2999') WHERE uid=?",(uid,))]))
    elif change=='lease':
        at=now();run(r.sql.batch([('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES(?,?,?,?,?)',('site-sync:task:'+uid,'media_assets','owner',at,at))]))
    else:
        grant=run(load(r.sql,'site-sync:manual:'+uid))
        run(r.sql.batch([('UPDATE auth_roles SET is_active=0 WHERE uid=?',(grant['owner']['role_uid'],))]))
    before=run(work.position(r.sql,uid))['checkpoint']
    run(patrol(r.sql,object()));run(patrol(r.sql,object()))
    assert run(work.position(r.sql,uid))['checkpoint']==before
    if change=='pause':assert not run(load(r.sql,'site-sync:manual:'+uid))['enabled']
    if change=='lease':assert run(r.sql.query('SELECT uid FROM admin_mutation_guards WHERE uid=?',('site-sync:task:'+uid,)))


def test_minute_and_watchdog_share_single_dispatch_ownership(pair,entry,monkeypatch):
    from worker_runtime.watchdog import run as patrol
    api,_,r,*_=pair;seed(api,r)
    original=dispatch.run
    async def scenario():
        started=asyncio.Event();release=asyncio.Event();calls=[]
        async def execute(uid):
            calls.append(uid);started.set();await release.wait();return {'status':'ok'}
        async def inject(sql,unused,**kwargs):return await original(sql,execute,**kwargs)
        monkeypatch.setattr(dispatch,'run',inject)
        assert (await patrol(r.sql,object()))['status']=='prepared'
        minute=asyncio.create_task(original(r.sql,execute,kind='worker',staged=True))
        await started.wait()
        result=await patrol(r.sql,object())
        assert result.get('skipped') in ('busy','interval','recovery-backoff')
        assert len(calls)==1
        release.set();assert (await minute)['status']=='ok'
    run(scenario())


def test_same_millisecond_heartbeat_and_late_return_do_not_clobber(pair,entry,monkeypatch):
    from worker_runtime import cron_health as h
    monkeypatch.setattr(h,'stamp',lambda:'2026-10-05T00:00:00.000Z')
    async def scenario():
        sql=pair[2].sql;a=await h.start(sql,'watchdog',key=h.WATCHDOG_KEY);b=await h.start(sql,'watchdog',key=h.WATCHDOG_KEY)
        assert a!=b
        await h.finish(sql,a,error=RuntimeError(),key=h.WATCHDOG_KEY)
        assert (await load(sql,h.WATCHDOG_KEY))['status']=='running'
        await h.finish(sql,b,result={'status':'prepared'},key=h.WATCHDOG_KEY)
        assert (await load(sql,h.WATCHDOG_KEY))['result']=='prepared'
    run(scenario())


def test_both_crons_are_packaged_and_missing_watchdog_is_rejected(tmp_path,monkeypatch):
    import shutil
    from pathlib import Path
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1]))
    import integration_package,pipeline
    from deploy.shared.worker_package import prepare
    root=Path(__file__).resolve().parents[3];out=tmp_path/'worker'
    prepare(False,['--output',str(out),'--worker-name','test-site','--database-id','12345678-1234-1234-1234-123456789abc','--origin','https://test-site.workers.dev','--bucket','teacher-media'])
    (out/'src').mkdir()
    for name in ('main.py','backend','generated_resources.py'):shutil.move(str(out/name),str(out/'src'/name))
    cfg=json.loads((out/'wrangler.json').read_text());cfg['main']='src/main.py'
    integration_package.extend(root,out,cfg)
    (out/'src/main.py').write_text('from worker_runtime.entrypoint import Default, TransferCoordinator\n')
    (out/'wrangler.jsonc').write_text(json.dumps(cfg))
    assert pipeline.verify_stage(out)['name']=='test-site'
    assert cfg['triggers']['crons']==['* * * * *','0 */3 * * *']
    cfg['triggers']['crons'].remove('0 */3 * * *')
    (out/'wrangler.jsonc').write_text(json.dumps(cfg))
    with pytest.raises(ValueError,match='three-hour'):pipeline.verify_stage(out)


def test_watchdog_can_reconcile_after_lease_expiry_without_force_unlock(pair,entry):
    from worker_runtime.watchdog import run as patrol
    api,_,r,*_=pair;uid=seed(api,r,'running')
    key='site-sync:task:'+uid;old='2000-01-01T00:00:00.000Z'
    run(r.sql.batch([('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES(?,?,?,?,?)',(key,'media_assets','old-owner',old,old))]))
    assert run(patrol(r.sql,object()))['status']=='reconciled'
    assert run(work.position(r.sql,uid))['work']['retryable']
    # Recovery doesn't delete lease rows blindly; the normal lease acquisition owns reclamation.
    assert run(r.sql.query('SELECT target_uid FROM admin_mutation_guards WHERE uid=?',(key,)))[0]['target_uid']=='old-owner'
