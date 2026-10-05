"""Create request applications after startup; never snapshot random identifiers."""
from workers import WorkerEntrypoint, DurableObject
from worker_runtime.diagnostics import phase, emit
from worker_runtime import snapshot  # deterministic imports enter the Python snapshot


def build_application(include_transfer=False):
    """Build a fresh app synchronously; a failed attempt cannot leave cached routes."""
    with phase('INIT-RESOURCES'):
        from worker_runtime import http_snapshot
        from worker_runtime.resources import resource_factory
        from backend.app.native.web import create_app
        from worker_runtime.bridge import BoundApplication
        from worker_runtime.setup import install as setup
    with phase('INIT-MAIN'):
        app = create_app(resource_factory)
    with phase('INIT-SETUP'):
        setup(app, resource_factory)
    if include_transfer:
        with phase('INIT-TRANSFER'):
            from generated_resources import TRANSFER_TEMPLATES, TRANSFER_CATALOG
            from worker_runtime.transfer import install as transfer
            transfer(app, resource_factory, TRANSFER_TEMPLATES, TRANSFER_CATALOG)
    from worker_runtime.http_boundary import Boundary
    return Boundary(BoundApplication(app))


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
        from workers import asgi
        if not hasattr(self, '_application'):
            self._application = LazyApplication(include_transfer=True)
        try:
            with phase('COORDINATOR-FETCH', progress=False):
                return await asgi.fetch(self._application, request, self.env, self.ctx)
        except Exception:
            from worker_runtime.http_boundary import unavailable
            return await asgi.fetch(unavailable,request,self.env,self.ctx)


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        from workers import asgi
        from worker_runtime.routing import dispatch
        try:
            with phase('FETCH', progress=False):
                return await dispatch(application, request, self.env, self.ctx, asgi.fetch)
        except Exception:
            from worker_runtime.http_boundary import unavailable
            return await asgi.fetch(unavailable,request,self.env,self.ctx)

    async def scheduled(self, controller, env=None, ctx=None):
        emit('CRON-ENTRY','START')
        from worker_runtime.cron_entry import run
        # Platform callback arguments are authoritative; self.env supports direct tests.
        return await run(controller,env if env is not None else self.env)
