"""Private scheduled sync executor; no website HTTP application is created."""
from workers import WorkerEntrypoint

class Default(WorkerEntrypoint):
    async def fetch(self,request):
        from js import Response,Object
        from pyodide.ffi import to_js
        return Response.new('Not found',to_js({'status':404},dict_converter=Object.fromEntries))

    async def scheduled(self,controller,env=None,ctx=None):
        from worker_runtime.bridge import Environment
        from backend.app.adapters.d1.sql import D1SQL
        from site_sync.integration.worker_schedule import run
        bindings=Environment(self.env)
        sql=D1SQL(getattr(bindings,str(bindings.TEACHER_DATABASE_BINDING)))
        # Each cron delivery is independent. The durable task lease reconciles
        # a previous invocation killed by CPU/memory limits before retrying.
        await run(sql,bindings)
