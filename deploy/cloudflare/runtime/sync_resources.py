"""Per-invocation sync services; storage is resolved only on first use.

The scheduler retains its normal authorization, leases and transactional guards.
No web application, renderer, password hasher or external-provider client is built.
"""
from functools import cached_property
from types import SimpleNamespace
from backend.app.native.audit_log import audit

class SyncResources:
    kind='r2'
    passwords=None
    sync_services_only=True

    def __init__(self,sql,bindings):
        self.sql=sql
        self._bindings=bindings
        self.content=SimpleNamespace(audit=audit)

    @cached_property
    def settings(self):
        from pathlib import Path
        from backend.app.config import Settings
        names={'media_binding':'TEACHER_MEDIA_BINDING','cache_binding':'TEACHER_CACHE_BINDING',
               'media_prefix':'TEACHER_MEDIA_PREFIX','cache_prefix':'TEACHER_CACHE_PREFIX'}
        values={key:str(getattr(self._bindings,var)) for key,var in names.items() if hasattr(self._bindings,var)}
        return Settings(Path('/runtime-data'),**values)

    def _store(self,name):
        from backend.app.native.storage import R2Store
        s=self.settings
        return R2Store(getattr(self._bindings,getattr(s,name+'_binding')),getattr(s,name+'_prefix'))

    @cached_property
    def media_store(self):
        return self._store('media')

    @cached_property
    def cache_store(self):
        return self._store('cache')

def resource_factory(sql,bindings):
    return SyncResources(sql,bindings)
