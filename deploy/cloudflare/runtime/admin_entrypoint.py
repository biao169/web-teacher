"""Private HTTP-only Admin Worker: no scheduled event or sync_tick export."""
from workers import WorkerEntrypoint,asgi
from worker_runtime import admin_snapshot
from worker_runtime.request_diagnostics import traced
from worker_runtime.bridge import BoundApplication
from worker_runtime.media_upload import dispatch_upload
from worker_runtime.site_routes import owner
from backend.app.native.web_admin import create_admin_app

class LazyAdmin:
    application=None
    async def __call__(self,scope,receive,send):
        if self.application is None:
            from worker_runtime.admin_resources import resource_factory
            from worker_runtime.setup import install
            app=create_admin_app(resource_factory,lazy_sync=True)
            install(app,resource_factory)
            self.application=BoundApplication(app)
        await self.application(scope,receive,send)
application=LazyAdmin()

async def direct(app,request,env,ctx,fetch):return await fetch(app,request,env,ctx)

class Default(WorkerEntrypoint):
    @traced('admin-site',http=True)
    async def fetch(self,request):
        if owner(request.url)!='admin':
            from workers import Response
            return Response('Not found',status=404)
        return await dispatch_upload(application,request,self.env,self.ctx,asgi.fetch,direct)
