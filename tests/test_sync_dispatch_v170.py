"""Recovery is independent of heavy initialization and durable across restarts."""
import asyncio,json,subprocess,sys
from unittest.mock import AsyncMock
import pytest
from backend.app.native import site_sync_dispatch as dispatch,site_sync_recovery as recovery,site_sync_work as work
from backend.app.native.site_sync_gate import load
from tests.test_site_sync_v121 import pair
from tests.test_sync_grant_errors_v169 import seed
run=asyncio.run

def saved(r,uid):return run(load(r.sql,dispatch.PREFIX+uid))
def expire(r,uid):
 run(r.sql.batch([("UPDATE service_meta SET value=json_set(value,'$.retry_after','2000-01-01T00:00:00.000Z') WHERE key=?",(dispatch.PREFIX+uid,))]))

def test_light_import_does_not_load_business_graph():
 subprocess.run([sys.executable,'-c',"import sys; from backend.app.native import site_sync_dispatch; assert not any(x in sys.modules for x in ('fastapi','backend.app.native.catalog','backend.app.native.site_sync_work','backend.app.native.site_sync_schedule','backend.app.native.site_sync_tasks'))"],check=True)

@pytest.mark.parametrize('progress',[False,True])
def test_recovery_never_initializes_or_replays_business(pair,progress):
 api,_,r,*_=pair;uid=seed(api,r,'running')
 row=run(work.position(r.sql,uid));prior=row['work']
 prior.update(checkpoint=row['checkpoint'],checkpoint_version=3,retry_count=40)
 run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?)) WHERE uid=?",(json.dumps(prior),uid))]))
 if progress:run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.count',99) WHERE uid=?",(uid,))]))
 execute=AsyncMock(side_effect=AssertionError('business runtime must not load'))
 result=run(dispatch.run(r.sql,execute,kind='worker'))
 assert result['status']=='reconciled';execute.assert_not_awaited()
 w=run(work.position(r.sql,uid))['work']
 assert w['retryable'] and w['retry_count']==(0 if progress else 41)
 assert w['slow_retry']==(not progress) and w['uncertain_attempts']==1
 assert run(dispatch.run(r.sql,execute,kind='worker'))['skipped']=='interval'
 assert run(work.position(r.sql,uid))['work']==w
 assert saved(r,uid)['result']=='reconciled'

@pytest.mark.parametrize('change',['role','permission','peer','binding','password','pause'])
def test_light_recovery_never_bypasses_authorization(pair,change):
 api,_,r,*_=pair;uid=seed(api,r,'running');selection=run(recovery.selected(r.sql));owner=selection[2]['owner']
 query,args={
  'role':('UPDATE auth_roles SET is_active=0 WHERE uid=?',(owner['role_uid'],)),
  'permission':("UPDATE auth_permissions SET can_export=0 WHERE role_uid=? AND module='students'",(owner['role_uid'],)),
  'peer':("UPDATE sync_peers SET revision='changed'",()),
  'binding':("UPDATE sync_tasks SET state=json_set(state,'$.scopes',json('[]')) WHERE uid=?",(uid,)),
  'password':('UPDATE auth_users SET must_change_password=1 WHERE uid=?',(owner['uid'],)),
  'pause':("UPDATE service_meta SET value=json_set(value,'$.enabled',0) WHERE key=?",(selection[1],)),
 }[change]
 run(r.sql.batch([(query,args)]));before=run(work.position(r.sql,uid))
 with pytest.raises(PermissionError):run(recovery.reconcile(r.sql,selection,r))
 assert run(work.position(r.sql,uid))==before

@pytest.mark.parametrize('key',['site-sync:run','site-sync:schedule-run','task'])
def test_live_lease_blocks_light_recovery(pair,key):
 api,_,r,*_=pair;uid=seed(api,r,'running');at=recovery.now()
 key='site-sync:task:'+uid if key=='task' else key
 choice=run(recovery.selected(r.sql))
 run(r.sql.batch([('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES(?,?,?,?,?)',(key,'media_assets','owner',at,at))]))
 assert run(recovery.reconcile(r.sql,choice,r))=={'skipped':'busy'}
 assert run(work.position(r.sql,uid))['work']['status']=='running'

def test_initialization_error_has_independent_backoff_and_visible_diagnostics(pair):
 api,_,r,*_=pair;uid=seed(api,r)
 execute=AsyncMock(side_effect=RuntimeError('do not expose credentials'))
 assert run(dispatch.run(r.sql,execute,kind='worker'))['status']=='paused'
 health=saved(r,uid)
 assert health['stage']=='initialize' and health['retryable'] and health['failures']==1
 assert 'credentials' not in json.dumps(health)
 assert run(dispatch.run(r.sql,execute,kind='worker'))['skipped']=='interval'
 assert execute.await_count==1
 expire(r,uid)
 run(dispatch.run(r.sql,execute,kind='worker'));assert saved(r,uid)['failures']==2
 execute.side_effect=None;execute.return_value={'status':'ok'};expire(r,uid)
 assert run(dispatch.run(r.sql,execute,kind='worker'))['status']=='ok'
 assert saved(r,uid)['failures']==0 and not saved(r,uid).get('error')


def test_forced_termination_leaves_receipt_and_can_resume(pair):
 class Terminated(BaseException):pass
 api,_,r,*_=pair;uid=seed(api,r)
 execute=AsyncMock(side_effect=Terminated())
 with pytest.raises(Terminated):run(dispatch.run(r.sql,execute,kind='worker'))
 assert saved(r,uid)['stage']=='initialize' and not saved(r,uid).get('finished_at')
 assert run(dispatch.run(r.sql,execute,kind='worker'))['skipped']=='interval'
 expire(r,uid);execute.side_effect=None;execute.return_value={'status':'ok'}
 assert run(dispatch.run(r.sql,execute,kind='worker'))['status']=='ok'


def test_scheduled_recovery_and_terminal_reply_do_not_start_new_preview(pair):
 from tests.test_site_sync_v123 import enable
 api,_,r,*_=pair;enable(api)
 uid=api('start',{'direction':'pull','scopes':['students'],'preview_mode':'brief'})['uid']
 run(r.sql.batch([
  ("UPDATE service_meta SET value=json_set(value,'$.preview_uid',?,'$.task_uid',?) WHERE key='site-sync:schedule-state'",(uid,uid)),
  ("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?),'$.execution.phase','done') WHERE uid=?",(json.dumps({'status':'running','recover_after':'2000'}),uid)),
 ]))
 # enable() defaults to confirmed-only, terminal execution is nevertheless eligible.
 execute=AsyncMock(side_effect=AssertionError('no replay'))
 assert run(dispatch.run(r.sql,execute,kind='worker'))['status']=='reconciled'
 assert run(work.position(r.sql,uid))['work']['status']=='saved'
 execute.assert_not_awaited()

def test_backoff_does_not_starve_another_manual_task(pair):
 api,_,r,*_=pair;first=seed(api,r)
 execute=AsyncMock(side_effect=RuntimeError('init'))
 run(dispatch.run(r.sql,execute,kind='worker'))
 second=seed(api,r,'running')
 assert run(dispatch.run(r.sql,execute,kind='worker'))['task_uid']==second
 assert saved(r,first)['failures']==1 and execute.await_count==1


def test_concurrent_checkpoint_change_is_not_counted_or_permanently_paused(pair,monkeypatch):
 api,_,r,*_=pair;uid=seed(api,r,'running');choice=run(recovery.selected(r.sql));original=r.sql.batch
 async def race(statements):
  if statements[0][0].startswith('UPDATE sync_tasks SET state='):
   await original([("UPDATE sync_tasks SET state=json_set(state,'$.count',789) WHERE uid=?",(uid,))])
  return await original(statements)
 monkeypatch.setattr(r.sql,'batch',race)
 result=run(recovery.reconcile(r.sql,choice,r))
 assert result['skipped']=='checkpoint-changed'
 assert run(work.position(r.sql,uid))['work']['status']=='running'

def test_dispatch_receipt_does_not_block_its_own_business_step(pair):
 from backend.app.native import site_sync_schedule as schedule
 api,_,r,*_=pair;uid=seed(api,r)
 before=run(work.position(r.sql,uid))['work']['attempt']
 result=run(dispatch.run(r.sql,lambda selected:schedule.tick(r,prune_history=False,dispatch_uid=selected),kind=r.kind))
 assert result['status']=='ok'
 assert run(work.position(r.sql,uid))['work']['attempt']>before
 assert saved(r,uid)['stage']=='finished'
