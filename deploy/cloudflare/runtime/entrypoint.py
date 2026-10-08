from worker_runtime.request_diagnostics import traced
"""Create request applications after startup; never snapshot random identifiers."""
from workers import asgi, WorkerEntrypoint, DurableObject
from worker_runtime.routing import dispatch
from worker_runtime.diagnostics import phase, emit
from worker_runtime import snapshot  # deterministic imports enter the Python snapshot


def build_application(include_transfer=False):
    """Build a fresh app synchronously; a failed attempt cannot leave cached routes."""
    with phase('INIT-RESOURCES'):
        from worker_runtime.resources import resource_factory
        from backend.app.native.web import create_app
        from worker_runtime.bridge import BoundApplication
        from worker_runtime.setup import install as setup
    with phase('INIT-MAIN'):
        app = create_app(resource_factory,lazy_sync=True)
    with phase('INIT-SETUP'):
        setup(app, resource_factory)
    if include_transfer:
        with phase('INIT-TRANSFER'):
            from generated_resources import TRANSFER_TEMPLATES, TRANSFER_CATALOG
            from worker_runtime.transfer import install as transfer
            transfer(app, resource_factory, TRANSFER_TEMPLATES, TRANSFER_CATALOG)
    return BoundApplication(app)


class LazyApplication:
    def __init__(self, include_transfer=False):
        self.include_transfer = include_transfer
        self.application = None

    async def __call__(self, scope, receive, send):
        if self.application is None:
            # No await during construction: requests cannot interleave installation.
            # Publish the cached reference only after construction fully succeeds.
            with phase('INIT-COORDINATOR' if self.include_transfer else 'INIT-SITE'):
                self.application = build_application(include_transfer=True) if self.include_transfer else build_application()
        await self.application(scope, receive, send)


application = LazyApplication()


class TransferCoordinator(DurableObject):
    """Keep one request-created application per coordinator instance."""
    async def fetch(self, request):
        if not hasattr(self, '_application'):
            self._application = LazyApplication(include_transfer=True)
        with phase('COORDINATOR-FETCH', progress=False):
            return await asgi.fetch(self._application, request, self.env, self.ctx)


class Default(WorkerEntrypoint):
    @traced('main-site',http=True)
    async def fetch(self, request):
        import secrets,re
        from urllib.parse import urlsplit
        from site_sync.core.trace import current
        trace=current().get('request_id') or secrets.token_hex(16);path=urlsplit(str(request.url)).path
        if path=='/sync/v1/read' and str(getattr(self.env,'TEACHER_SYNC_PAUSED','0'))=='1':
            from js import Response,Object
            from pyodide.ffi import to_js
            return Response.new(None,to_js({'status':503,'headers':{'cache-control':'no-store','retry-after':'60','x-sync-error':'SYNC_PAUSED','x-sync-trace':trace,'x-sync-stage':'admission','x-sync-component':'peer-site','x-sync-release':'0.16.037'}},dict_converter=Object.fromEntries))
        ray=str(request.headers.get('cf-ray') or '')
        ray=ray if re.fullmatch('[a-fA-F0-9]{8,32}-[A-Z]{3}',ray) else ''
        route='sync-peer' if path=='/sync/v1/read' else 'sync-admin' if path.startswith(('/admin/site-sync','/api/admin/site-sync')) else 'admin' if path.startswith('/admin') else 'public'
        with phase('FETCH',progress=False,component='main-site',request_id=trace,ray_id=ray,route=route):
            if path=='/sync/v1/read' and str(getattr(self.env,'TEACHER_SYNC_EXECUTOR_MODE','inline'))=='separate':
                try:response=await self.env.SYNC_EXECUTOR.fetch(request)
                except Exception as exc:
                    from worker_runtime.diagnostics import failure
                    emit('SYNC-FORWARD','ERROR',component='main-site',request_id=trace,code='SYNC_EXECUTOR_UNAVAILABLE',exceptions=failure(exc))
                    from js import Response,Object
                    from pyodide.ffi import to_js
                    response=Response.new(None,to_js({'status':503,'headers':{'cache-control':'no-store','x-request-id':trace,'x-sync-error':'SYNC_EXECUTOR_UNAVAILABLE','x-sync-trace':trace,'x-sync-stage':'executor_forward','x-sync-component':'peer-site','x-sync-release':'0.16.037'}},dict_converter=Object.fromEntries))
            elif request.headers.get('x-sync-stream')=='1' and path=='/sync/v1/read':
                response=await self.env.SYNC_NATIVE.fetch(request)
            elif path=='/sync/v1/read':
                from worker_runtime.sync_resources import application as peer_application
                response=await asgi.fetch(peer_application,request,self.env,self.ctx)
            else:response=await dispatch(application,request,self.env,self.ctx,asgi.fetch)
            if int(response.status)>=500:emit('HTTP-RESPONSE','ERROR',component='main-site',request_id=trace,ray_id=ray,route=route,http_status=int(response.status))
            return response

    @traced('main-site')
    async def sync_tick(self):
        if str(getattr(self.env,'TEACHER_SYNC_EXECUTOR_MODE','inline'))=='separate':
            return '{"action":"disabled","skipped":"separate-executor-only"}'
        import json
        from worker_runtime.bridge import Environment
        from backend.app.adapters.d1.sql import D1SQL
        from site_sync.integration.worker_schedule import run
        bindings=Environment(self.env)
        sql=D1SQL(getattr(bindings,str(bindings.TEACHER_DATABASE_BINDING)))
        with phase('SYNC-TICK',progress=False,component='main-site'):
            return json.dumps(await run(sql,bindings,wake=False))

    @traced('main-site')
    async def scheduled(self, controller, env=None, ctx=None):
        with phase('CRON', progress=False):
            # Cron does not need to initialize the HTTP application or its room state.
            from worker_runtime.bridge import Environment
            from worker_runtime.maintenance import run
            from backend.app.adapters.d1.sql import D1SQL
            bindings = Environment(self.env)
            sql = D1SQL(getattr(bindings, str(bindings.TEACHER_DATABASE_BINDING)))
            job, result = await run(sql, bindings, controller)
            reason = result.get('skipped')
            # Idle scheduled invocations need no success/skip console record.
            if not reason:
                emit('CRON', 'OK', job=job)
