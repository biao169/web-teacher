"""Private sync executor: cold startup has no HTTP/catalog resources.

Cron and RPC use the sync D1 adapter; the signed peer HTTP handler is imported
only for fetch. Bundled website/template/transfer modules are forbidden.
"""
from worker_runtime.request_diagnostics import traced
from workers import WorkerEntrypoint
from worker_runtime.diagnostics import phase

class Default(WorkerEntrypoint):
    @traced('sync-executor',http=True)
    async def fetch(self,request):
        from urllib.parse import urlsplit
        if urlsplit(str(request.url)).path=='/sync/v1/read' and request.headers.get('x-sync-stream')=='1':
            return await self.env.SYNC_NATIVE.fetch(request)
        from workers import asgi
        from worker_runtime.sync_resources import application as peer_application
        with phase('SYNC-EXPORT',progress=False,component='sync-executor'):
            return await asgi.fetch(peer_application,request,self.env,self.ctx)

    @traced('sync-executor')
    async def sync_tick(self):
        import json
        from worker_runtime.bridge import Environment
        from site_sync.adapters.d1 import D1
        from site_sync.integration.worker_schedule import run
        bindings=Environment(self.env)
        sql=D1(getattr(bindings,str(bindings.TEACHER_DATABASE_BINDING)))
        with phase('SYNC-TICK',progress=False,component='sync-executor'):
            return json.dumps(await run(sql,bindings,wake=False))

    @traced('sync-executor')
    async def scheduled(self,controller,env=None,ctx=None):
        from worker_runtime.bridge import Environment
        from site_sync.adapters.d1 import D1
        from site_sync.integration.worker_schedule import run
        bindings=Environment(self.env)
        sql=D1(getattr(bindings,str(bindings.TEACHER_DATABASE_BINDING)))
        # Each cron delivery is independent. The durable task lease reconciles
        # a previous invocation killed by CPU/memory limits before retrying.
        with phase('SYNC-CRON',progress=False,component='sync-executor'):
            await run(sql,bindings)
