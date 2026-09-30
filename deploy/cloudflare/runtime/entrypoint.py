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
        app = create_app(resource_factory)
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
    async def fetch(self, request):
        with phase('FETCH', progress=False):
            return await dispatch(application, request, self.env, self.ctx, asgi.fetch)

    async def scheduled(self, controller, env=None, ctx=None):
        with phase('CRON', progress=False):
            # Cron does not need to initialize the HTTP application or its room state.
            from worker_runtime.bridge import Environment
            from worker_runtime.storage import TransferStore
            from worker_runtime.cleanup import run as cleanup
            from backend.app.adapters.d1.sql import D1SQL
            bindings = Environment(self.env)
            sql = D1SQL(getattr(bindings, str(bindings.TEACHER_DATABASE_BINDING)))
            store = TransferStore(getattr(bindings, str(bindings.TEACHER_MEDIA_BINDING)), 'transfer/media/')
            result = await cleanup(sql, store)
            # Skip reasons are internal enums; do not log returned arbitrary content.
            reason = result.get('skipped')
            emit('CRON', 'SKIPPED' if reason else 'OK',
                 reason=reason if reason in ('not-initialized', 'disabled', 'interval', 'busy') else '')
