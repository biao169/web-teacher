"""Earliest HTTP boundary: SDK only; application imports occur inside fetch."""
from workers import WorkerEntrypoint,DurableObject

class Default(WorkerEntrypoint):
    async def fetch(self,request):
        try:
            from worker_runtime.site_entrypoint import Default as Site
            return await Site.fetch(self,request)
        except Exception as exc:
            # No decorator, diagnostics package, database or template dependency here.
            from worker_runtime.early_recovery import recover
            return recover(request,exc)

    async def sync_tick(self):
        from worker_runtime.site_entrypoint import Default as Site
        return await Site.sync_tick(self)

    async def scheduled(self,controller,env=None,ctx=None):
        from worker_runtime.site_entrypoint import Default as Site
        return await Site.scheduled(self,controller,env,ctx)

class TransferCoordinator(DurableObject):
    async def fetch(self,request):
        from worker_runtime.site_entrypoint import TransferCoordinator as Coordinator
        return await Coordinator.fetch(self,request)
