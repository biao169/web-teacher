from worker_runtime.request_diagnostics import traced
"""Create request applications after startup; never snapshot random identifiers."""
from workers import asgi, WorkerEntrypoint, DurableObject
from worker_runtime.routing import dispatch
from worker_runtime.diagnostics import phase, emit
from worker_runtime import snapshot  # deterministic imports enter the Python snapshot


def build_application(include_transfer=False):
    """Build a fresh app synchronously; a failed attempt cannot leave cached routes."""
    from worker_runtime.bridge import BoundApplication
    if include_transfer:
        from worker_runtime.transfer_resources import resource_factory
        from backend.app.native.web_common import create_base
        from generated_transfer_templates import TRANSFER_TEMPLATES,TRANSFER_CATALOG
        from worker_runtime.transfer import install
        from fastapi import Request
        app,resources,csrf,render=create_base(resource_factory)
        @app.get('/admin/transfer')
        async def transfer_admin(request:Request):
            r=await resources(request);r.auth.require(r.p,'transfer')
            values=await app.state.transfer_admin_workspace(request)
            return await render(r,'admin/native-transfer.html','transfer',title='文件快传管理',transfer_url=r.transfer_url,**values)
        install(app,resource_factory,TRANSFER_TEMPLATES,TRANSFER_CATALOG)
    else:
        from worker_runtime.public_resources import resource_factory
        from backend.app.native.web_public import create_public_app
        app=create_public_app(resource_factory)
    return BoundApplication(app)


class LazyApplication:
    def __init__(self, include_transfer=False):
        self.include_transfer = include_transfer
        self.application = None

    async def __call__(self, scope, receive, send):
        if self.application is None:
            # No await during construction: requests cannot interleave installation.
            # Publish the cached reference only after construction fully succeeds.
            from backend.app.ports.operations import stage
            with stage('application-build'),phase('INIT-COORDINATOR' if self.include_transfer else 'INIT-SITE'):
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
        from worker_runtime.site_routes import owner
        if owner(request.url)=='admin':
            # Forward the native stream unchanged: no ASGI, form or JSON parse here.
            try:
                return await self.env.SITE_ADMIN.fetch(request)
            except Exception as exc:
                from worker_runtime.diagnostics import failure
                from site_sync.core.trace import current
                from workers import Response
                import json
                trace=current().get('request_id')
                emit('ADMIN-FORWARD','ERROR',request_id=trace,code='ADMIN_UNAVAILABLE',exceptions=failure(exc))
                body=getattr(request,'body',None)
                if body is not None and not body.locked:
                    try:await body.cancel()
                    except Exception as cancel_error:emit('ADMIN-BODY-CANCEL','ERROR',request_id=trace,exceptions=failure(cancel_error))
                return Response(json.dumps({'error':'后台服务暂时不可用','code':'ADMIN_UNAVAILABLE','request_id':trace}),status=503,headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'})
        import secrets,re
        from urllib.parse import urlsplit
        from site_sync.core.trace import current
        trace=current().get('request_id') or secrets.token_hex(16);path=urlsplit(str(request.url)).path
        if path=='/sync/v1/read' and str(getattr(self.env,'TEACHER_SYNC_PAUSED','0'))=='1':
            from js import Response,Object
            from pyodide.ffi import to_js
            return Response.new(None,to_js({'status':503,'headers':{'cache-control':'no-store','retry-after':'60','x-sync-error':'SYNC_PAUSED','x-sync-trace':trace,'x-sync-stage':'admission','x-sync-component':'peer-site','x-sync-release':'0.16.063'}},dict_converter=Object.fromEntries))
        ray=str(request.headers.get('cf-ray') or '')
        ray=ray if re.fullmatch('[a-fA-F0-9]{8,32}-[A-Z]{3}',ray) else ''
        route='sync-peer' if path=='/sync/v1/read' else 'sync-admin' if path.startswith(('/admin/site-sync','/api/admin/site-sync')) else 'admin' if path.startswith('/admin') else 'public'
        with phase('FETCH',progress=False,component='main-site',request_id=trace,ray_id=ray,route=route):
            if path=='/sync/v1/read' and str(getattr(self.env,'TEACHER_SYNC_EXECUTOR_MODE','inline'))=='separate':
                try:
                    response=await self.env.SYNC_EXECUTOR.fetch(request)
                    upstream=str(response.headers.get('x-request-id') or '')
                    emit('SYNC-FORWARD','RETURNED',component='main-site',request_id=trace,peer_request_id=str(request.headers.get('x-sync-nonce') or '')[:32] if re.fullmatch('[a-f0-9]{32}',str(request.headers.get('x-sync-nonce') or '')) else None,upstream_request_id=upstream if re.fullmatch('[a-f0-9]{32}',upstream) else None,http_status=int(response.status))
                except Exception as exc:
                    from worker_runtime.diagnostics import failure
                    emit('SYNC-FORWARD','ERROR',component='main-site',request_id=trace,code='SYNC_EXECUTOR_UNAVAILABLE',exceptions=failure(exc))
                    from js import Response,Object
                    from pyodide.ffi import to_js
                    response=Response.new(None,to_js({'status':503,'headers':{'cache-control':'no-store','x-request-id':trace,'x-sync-error':'SYNC_EXECUTOR_UNAVAILABLE','x-sync-trace':trace,'x-sync-stage':'executor_forward','x-sync-component':'peer-site','x-sync-release':'0.16.063'}},dict_converter=Object.fromEntries))
            elif request.headers.get('x-sync-stream')=='1' and path=='/sync/v1/read':
                response=await self.env.SYNC_NATIVE.fetch(request)
            elif path=='/sync/v1/read':
                from worker_runtime.sync_resources import application as peer_application
                response=await asgi.fetch(peer_application,request,self.env,self.ctx)
            else:
                response=await dispatch(application,request,self.env,self.ctx,asgi.fetch)
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
