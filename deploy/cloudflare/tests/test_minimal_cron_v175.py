"""Actual Cron separates SQL preflight from execution, preserving saved grants."""
import asyncio,json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from test_startup_lazy import entry
from tests.test_site_sync_v121 import pair
from tests.test_sync_grant_errors_v169 import seed
from tests.test_sync_dispatch_v170 import saved,expire
from backend.app.native import site_sync_dispatch as dispatch,site_sync_work as work
run=asyncio.run


def test_preflight_never_imports_business_resources_then_next_round_executes(pair,entry,monkeypatch):
 import builtins
 from worker_runtime.sync_schedule import run as cron
 api,_,r,*_=pair;uid=seed(api,r);before=run(work.position(r.sql,uid))
 original=builtins.__import__
 def guard(name,*args,**kwargs):
  if name in ('worker_runtime.sync_resources','backend.app.native.site_sync_schedule','backend.app.native.site_sync_latest_runtime'):
   raise AssertionError('business module imported in preflight')
  return original(name,*args,**kwargs)
 with monkeypatch.context() as m:
  m.setattr(builtins,'__import__',guard)
  assert run(cron(r.sql,object(),staged=True))['status']=='prepared'
 assert run(work.position(r.sql,uid))==before
 receipt=saved(r,uid)
 assert receipt['business_ready'] and receipt['finished_at'] and receipt['result']=='prepared'
 assert [s['phase'] for s in receipt['initialization']['stages']]==['receipt_reconcile']
 assert run(cron(r.sql,object(),staged=True))['status']=='ok'
 assert run(work.position(r.sql,uid))['checkpoint']!=before['checkpoint']
 assert not saved(r,uid).get('business_ready')
 # Every new business round has a separate preflight; no task progress is invented.
 assert run(cron(r.sql,object(),staged=True))['status']=='prepared'

@pytest.mark.parametrize('mutation',['pause','role','peer','revision'])
def test_prepared_receipt_never_bypasses_new_authorization(pair,mutation):
 api,_,r,*_=pair;uid=seed(api,r)
 from backend.app.native.site_sync_gate import load
 from backend.app.native.site_sync_schedule import tick
 execute=AsyncMock(side_effect=lambda selected:tick(r,prune_history=False,dispatch_uid=selected))
 assert run(dispatch.run(r.sql,execute,kind='worker',staged=True))['status']=='prepared'
 grant=run(load(r.sql,'site-sync:manual:'+uid));before=run(work.position(r.sql,uid))
 if mutation=='pause':api('manual-pause',{'uid':uid})
 elif mutation=='role':run(r.sql.batch([('UPDATE auth_roles SET is_active=0 WHERE uid=?',(grant['owner']['role_uid'],))]))
 elif mutation=='peer':run(r.sql.batch([("UPDATE sync_peers SET revision='changed'",())]))
 else:run(r.sql.batch([("UPDATE service_meta SET value=json_set(value,'$.revision','changed') WHERE key=?",('site-sync:manual:'+uid,))]))
 async def execute_real(selected):return await tick(r,prune_history=False,dispatch_uid=selected)
 result=run(dispatch.run(r.sql,execute_real,kind='worker',staged=True))
 assert run(work.position(r.sql,uid))==before
 if mutation=='revision':assert result['status']=='prepared'


def test_interrupted_business_returns_to_preflight_after_cooldown(pair):
 class Killed(BaseException):pass
 api,_,r,*_=pair;uid=seed(api,r)
 execute=AsyncMock(side_effect=Killed())
 assert run(dispatch.run(r.sql,execute,kind='worker',staged=True))['status']=='prepared'
 execute.assert_not_awaited()
 with pytest.raises(Killed):run(dispatch.run(r.sql,execute,kind='worker',staged=True))
 assert not saved(r,uid).get('finished_at')
 assert run(dispatch.run(r.sql,execute,kind='worker',staged=True))['skipped']=='interval'
 expire(r,uid)
 assert run(dispatch.run(r.sql,execute,kind='worker',staged=True))['status']=='prepared'
 assert execute.await_count==1
 execute.side_effect=None;execute.return_value={'status':'ok'}
 assert run(dispatch.run(r.sql,execute,kind='worker',staged=True))['status']=='ok'


def test_platform_env_and_default_binding_are_used_without_media(pair,entry,monkeypatch):
 from backend.app.adapters.d1 import sql as d1
 from worker_runtime import maintenance
 from backend.app.native.site_sync_gate import load
 env=SimpleNamespace(DB=object())
 monkeypatch.setattr(d1,'D1SQL',lambda binding:pair[2].sql)
 async def maintain(sql,bindings,controller):
  assert bindings.native is env and bindings.bindings.keys()=={'DB'}
  # The generic heartbeat precedes maintenance imports and business selection.
  assert (await load(sql,'site-sync:cron-health'))['status']=='running'
  return 'sync',{'status':'prepared'}
 monkeypatch.setattr(maintenance,'run',maintain)
 worker=entry.Default();worker.env=object()
 result=run(worker.scheduled(SimpleNamespace(scheduledTime=120000),env,None))
 assert result['status']=='prepared'
 assert run(load(pair[2].sql,'site-sync:cron-health'))['job']=='sync'


def test_error_identity_is_unchanged():
 from backend.app.native.catalog import Error
 from backend.app.native.errors import Error as Minimal
 from backend.app.adapters.d1.sql import Error as Adapter
 assert Error is Minimal is Adapter
