"""Commit relay, entrypoint scope, and provider failure isolation; no live cache."""
import asyncio,json,sys
from types import SimpleNamespace as NS,ModuleType
from unittest.mock import AsyncMock
import pytest
from test_startup_lazy import entry
from backend.app.native.public_cache_tags import Plan,CommittedChanges,record_commit,HEADER

class Headers(dict):
 def get(self,key,default=None):return super().get(key.lower(),default)
 def set(self,key,value):self[key.lower()]=value
 def delete(self,key):self.pop(key.lower(),None)

class Response:
 def __init__(self,status=303,headers=None):self.status=status;self.headers=Headers(headers or {});self.body=NS(locked=False,cancel=AsyncMock())

def ffi(monkeypatch):
 js=ModuleType('js');js.Object=NS(fromEntries=lambda value:value)
 module=ModuleType('pyodide.ffi');module.to_js=lambda value,**kw:value
 monkeypatch.setitem(sys.modules,'js',js);monkeypatch.setitem(sys.modules,'pyodide.ffi',module)

def copies(monkeypatch):
 import worker_runtime.public_invalidation as module
 def copy(response):
  result=Response(response.status,dict(response.headers));result.body=response.body;return result
 monkeypatch.setattr(module,'copy_response',copy);return module

@pytest.mark.parametrize('name',['PublicPage','PublicData'])
def test_cache_control_runs_in_own_entrypoint_only(entry,monkeypatch,name):
 ffi(monkeypatch);ctx=NS(cache=NS(invalidate=AsyncMock(return_value={'success':True}),purge=AsyncMock(return_value={'success':True})))
 worker=getattr(entry,name)();worker.ctx=ctx
 result=asyncio.run(worker.update_public_cache(json.dumps({'invalidate':['public-projects','public-layout'],'purge':['public-profiles','profile-'+'a'*32]})))
 assert result is True
 if name=='PublicData':
  assert ctx.cache.invalidate.call_args.args[0]=={'tags':['public-projects']}
  assert ctx.cache.purge.call_args.args[0]=={'tags':['public-profiles']}
 else:assert 'public-layout' in ctx.cache.invalidate.call_args.args[0]['tags']

@pytest.mark.parametrize('success',[True,False])
def test_relay_checks_platform_acceptance_and_preserves_body(entry,monkeypatch,success):
 module=copies(monkeypatch);plan=Plan(invalidate={'public-projects'},purge=set())
 original=Response(headers={HEADER:module.encode(plan),'location':'/admin/projects','set-cookie':'PRIVATE'})
 ctx=NS(exports=NS(PublicPage=NS(update_public_cache=AsyncMock(return_value=success)),PublicData=NS(update_public_cache=AsyncMock(return_value=True))))
 result=asyncio.run(module.relay(original,ctx))
 assert result.status==303 and result.body is original.body and result.headers.get('location')=='/admin/projects'
 assert result.headers.get('set-cookie')=='PRIVATE' and result.headers.get(HEADER) is None
 assert result.headers.get('X-Teacher-Cache-Update')==('accepted' if success else 'pending')
 assert len(ctx.exports.PublicPage.update_public_cache.call_args.args)==1
 assert json.loads(ctx.exports.PublicPage.update_public_cache.call_args.args[0])==plan.payload()

@pytest.mark.parametrize('failure',['exception','malformed'])
def test_failed_notify_never_purges_everything_or_changes_saved_response(entry,monkeypatch,failure):
 module=copies(monkeypatch);plan=Plan(invalidate={'public-projects'},purge=set())
 original=Response(headers={HEADER:module.encode(plan) if failure=='exception' else 'INVALID!'})
 page=AsyncMock(side_effect=RuntimeError('unavailable'));data=AsyncMock(return_value=True)
 result=asyncio.run(module.relay(original,NS(exports=NS(PublicPage=NS(update_public_cache=page),PublicData=NS(update_public_cache=data)))))
 assert result.status==303 and result.headers.get('X-Teacher-Cache-Update')=='pending'
 assert result.headers.get(HEADER) is None
 if failure=='malformed':assert page.await_count==data.await_count==0

@pytest.mark.parametrize('status',[303,503])
def test_admin_recovery_retains_already_committed_notification(entry,monkeypatch,status):
 import workers,worker_runtime.admin_entrypoint as admin
 module=copies(monkeypatch)
 monkeypatch.setattr(workers,'Response',lambda body,**kw:Response(kw.get('status',200),kw.get('headers')),raising=False)
 async def committed(*args):
  await record_commit([('UPDATE profiles SET sort_order=? WHERE uid=?',(3,'p'))]);return Response(status)
 monkeypatch.setattr(admin,'dispatch_upload',committed)
 worker=admin.Default();worker.env=NS();worker.ctx=NS();request=NS(method='POST',url='https://site.test/admin/profiles/p',headers={})
 result=asyncio.run(admin.Default.fetch.__wrapped__(worker,request))
 assert result.headers.get(HEADER) is not None and module.decode(result.headers.get(HEADER)).invalidate


def test_failed_mutation_and_read_have_no_control_header(entry,monkeypatch):
 import workers,worker_runtime.admin_entrypoint as admin
 copies(monkeypatch);monkeypatch.setattr(workers,'Response',lambda body,**kw:Response(kw.get('status',200),kw.get('headers')),raising=False)
 monkeypatch.setattr(admin,'dispatch_upload',AsyncMock(side_effect=RuntimeError('write rolled back')))
 worker=admin.Default();worker.env=NS();worker.ctx=NS()
 result=asyncio.run(admin.Default.fetch.__wrapped__(worker,NS(method='POST',url='https://site.test/admin/profiles/p',headers={})))
 assert result.headers.get(HEADER) is None


def test_scope_collectors_do_not_mix_concurrent_admin_requests(entry):
 async def run(table):
  with CommittedChanges() as changes:
   await asyncio.sleep(0);await record_commit([(f'UPDATE {table} SET sort_order=? WHERE uid=?',(3,'p'))]);await asyncio.sleep(0)
   return changes.plan.payload()
 async def both():return await asyncio.gather(run('profiles'),run('projects'))
 a,b=asyncio.run(both());assert 'public-profiles' in a['invalidate'] and 'public-projects' not in a['invalidate'];assert 'public-projects' in b['invalidate'] and 'public-profiles' not in b['invalidate']

def test_commit_relay_does_not_buffer_or_replay_saved_response(entry,monkeypatch):
 import worker_runtime.admin_recovery as recovery
 module=copies(monkeypatch)
 async def forward(binding,request):return await binding.fetch(request)
 monkeypatch.setattr(recovery,'forward',forward)
 original=Response(headers={HEADER:module.encode(Plan(invalidate={'public-projects'}))})
 page=AsyncMock(return_value=True);data=AsyncMock(return_value=True)
 worker=entry.Default();worker.env=NS(SITE_ADMIN=NS(fetch=AsyncMock(return_value=original)));worker.ctx=NS(exports=NS(PublicPage=NS(update_public_cache=page),PublicData=NS(update_public_cache=data)))
 result=asyncio.run(entry.Default._dynamic_fetch.__wrapped__(worker,NS(method='POST',url='https://site.test/admin/projects/p',headers={})))
 assert result.status==303 and result.body is original.body and result.headers.get(HEADER) is None
 assert page.await_count==data.await_count==1 and worker.env.SITE_ADMIN.fetch.await_count==1
 original.body.cancel.assert_not_awaited()

def test_provider_rejection_is_not_treated_as_purge_success(entry,monkeypatch):
 ffi(monkeypatch);worker=entry.PublicPage();worker.ctx=NS(cache=NS(invalidate=AsyncMock(return_value={'success':False}),purge=AsyncMock()))
 assert asyncio.run(worker.update_public_cache({'invalidate':['public-profiles'],'purge':[]})) is False
 worker.ctx.cache.purge.assert_not_awaited()

def test_layout_only_write_does_not_invoke_data_entrypoint(entry,monkeypatch):
 module=copies(monkeypatch);page=AsyncMock(return_value=True);data=AsyncMock(return_value=True)
 response=Response(headers={HEADER:module.encode(Plan(invalidate={'public-layout'}))})
 result=asyncio.run(module.relay(response,NS(exports=NS(PublicPage=NS(update_public_cache=page),PublicData=NS(update_public_cache=data)))))
 assert result.headers.get('X-Teacher-Cache-Update')=='accepted';page.assert_awaited_once();data.assert_not_awaited()
