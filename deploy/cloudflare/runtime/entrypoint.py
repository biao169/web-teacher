"""Create request applications after startup; never snapshot random identifiers."""
from workers import asgi, WorkerEntrypoint, DurableObject
from worker_runtime.routing import dispatch


def build_application():
    """Build a fresh app synchronously; a failed attempt cannot leave cached routes."""
    from backend.entrypoints.worker import resource_factory
    from backend.app.native.web import create_app
    from generated_resources import TRANSFER_TEMPLATES, TRANSFER_CATALOG
    from worker_runtime.bridge import BoundApplication
    from worker_runtime.setup import install as setup
    from worker_runtime.transfer import install as transfer
    app = create_app(resource_factory)
    setup(app, resource_factory)
    transfer(app, resource_factory, TRANSFER_TEMPLATES, TRANSFER_CATALOG)
    return BoundApplication(app)


class LazyApplication:
    def __init__(self):
        self.application = None

    async def __call__(self, scope, receive, send):
        if self.application is None:
            # No await during construction: requests cannot interleave installation.
            # Publish the cached reference only after construction fully succeeds.
            self.application = build_application()
        await self.application(scope, receive, send)


application = LazyApplication()


class TransferCoordinator(DurableObject):
    """Keep one request-created application per coordinator instance."""
    async def fetch(self, request):
        if not hasattr(self, '_application'):
            self._application = LazyApplication()
        return await asgi.fetch(self._application, request, self.env, self.ctx)


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        return await dispatch(application, request, self.env, self.ctx, asgi.fetch)

    async def scheduled(self, controller, env=None, ctx=None):
        # Cron does not need to initialize the HTTP application or its room state.
        from worker_runtime.bridge import Environment
        from worker_runtime.transfer import TransferStore
        from worker_runtime.cleanup import run as cleanup
        from backend.app.adapters.d1.sql import D1SQL
        bindings = Environment(self.env)
        sql = D1SQL(getattr(bindings, str(bindings.TEACHER_DATABASE_BINDING)))
        store = TransferStore(getattr(bindings, str(bindings.TEACHER_MEDIA_BINDING)), 'transfer/media/')
        await cleanup(sql, store)
