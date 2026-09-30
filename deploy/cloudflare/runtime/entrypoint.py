"""Main app and same-site transfer coordinator, with bounded scheduled cleanup."""
from workers import asgi, WorkerEntrypoint, DurableObject
from backend.entrypoints.worker import app, resource_factory
from generated_resources import TRANSFER_TEMPLATES, TRANSFER_CATALOG
from worker_runtime.bridge import BoundApplication, Environment
from worker_runtime.setup import install as setup
from worker_runtime.transfer import install as transfer, TransferStore
from worker_runtime.cleanup import run as cleanup
from backend.app.adapters.d1.sql import D1SQL
from worker_runtime.routing import dispatch

setup(app, resource_factory)
transfer(app, resource_factory, TRANSFER_TEMPLATES, TRANSFER_CATALOG)
application = BoundApplication(app)



class TransferCoordinator(DurableObject):
    """One named coordinator keeps existing short-lived codes and rooms together.

    Online rooms intentionally do not survive eviction/deploy; original instance
    tokens reject stale codes. Offline data and checkpoints remain in D1/R2.
    """
    async def fetch(self, request):
        return await asgi.fetch(application, request, self.env, self.ctx)


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        return await dispatch(application, request, self.env, self.ctx, asgi.fetch)

    async def scheduled(self, controller, env=None, ctx=None):
        bindings = Environment(self.env)
        sql = D1SQL(getattr(bindings, str(bindings.TEACHER_DATABASE_BINDING)))
        store = TransferStore(getattr(bindings, str(bindings.TEACHER_MEDIA_BINDING)), 'transfer/media/')
        await cleanup(sql, store)
