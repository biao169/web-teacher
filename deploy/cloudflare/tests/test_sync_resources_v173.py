"""Lazy storage and existing recovery execution through the narrow resource graph."""
import asyncio,builtins,copy
from types import SimpleNamespace
import pytest
from test_startup_lazy import entry
from tests.test_sync_platform_v131 import pair,local_pair
from tests import test_sync_endurance_v169 as endurance


def test_storage_is_lazy_and_uses_canonical_validation(entry):
 from worker_runtime.sync_resources import resource_factory
 media=object();cache=object()
 base=resource_factory(object(),SimpleNamespace(TEACHER_MEDIA_BINDING='FILES',TEACHER_CACHE_BINDING='CACHE',FILES=media,CACHE=cache))
 assert 'settings' not in vars(base) and 'media_store' not in vars(base)
 r=copy.copy(base)
 assert r.media_store.bucket is media and r.media_store.prefix=='media/'
 assert r.media_store is r.media_store and 'cache_store' not in vars(r)
 assert r.cache_store.bucket is cache and r.cache_store.prefix=='cache/'
 bad=resource_factory(None,SimpleNamespace(TEACHER_MEDIA_PREFIX='cache/sub'))
 with pytest.raises(ValueError,match='overlap'):_=bad.media_store
 # Missing R2 does not prevent SQL-only business phases.
 empty=resource_factory(None,object())
 assert callable(empty.content.audit)
 with pytest.raises(AttributeError):_=empty.cache_store


def test_audit_contract_is_shared(entry):
 from backend.app.native.content import Content
 from backend.app.native.audit_log import audit
 from worker_runtime.sync_resources import resource_factory
 assert Content.audit is audit
 assert resource_factory(None,object()).content.audit is audit


def test_narrow_resources_recover_media_and_content(pair,entry,monkeypatch):
 from worker_runtime.sync_resources import SyncResources
 from backend.app.native import site_sync_schedule as schedule
 api,_,r,*_=pair
 original=schedule.context
 async def context(base,*args,**kwargs):
  if base.kind!='r2':return await original(base,*args,**kwargs)
  # Use real R2 doubles and custom bindings; no web factory or Content/Media service.
  env=SimpleNamespace(TEACHER_MEDIA_BINDING='FILES',TEACHER_CACHE_BINDING='CACHE',
      TEACHER_MEDIA_PREFIX=base.media_store.prefix,TEACHER_CACHE_PREFIX=base.cache_store.prefix,
      FILES=base.media_store.bucket,CACHE=base.cache_store.bucket)
  return await original(SyncResources(base.sql,env),*args,**kwargs)
 monkeypatch.setattr(schedule,'context',context)
 # Manual dispatch imports the shared context through schedule at runtime.
 from backend.app.native import site_sync_manual
 if hasattr(site_sync_manual,'context'):monkeypatch.setattr(site_sync_manual,'context',context)
 endurance.test_pull_keeps_advancing_through_repeated_interruptions(pair,monkeypatch)


def test_cron_runs_without_web_factory_or_storage_bindings(local_pair,entry,monkeypatch):
 from worker_runtime.sync_schedule import run as cron
 from worker_runtime import sync_resources
 from tests.test_sync_grant_errors_v169 import seed
 api,_,r,*_=local_pair
 seed(api,r)
 original=sync_resources.resource_factory;created=[]
 def factory(sql,bindings):
  base=original(sql,bindings);created.append(base);return base
 monkeypatch.setattr(sync_resources,'resource_factory',factory)
 importer=builtins.__import__
 def guarded(name,*args,**kwargs):
  if name=='worker_runtime.resources':raise AssertionError('web factory imported')
  return importer(name,*args,**kwargs)
 monkeypatch.setattr(builtins,'__import__',guarded)
 result=asyncio.run(cron(r.sql,object()))
 assert result['status']=='ok' and len(created)==1
 assert 'settings' not in vars(created[0])
 assert entry.application.application is None
