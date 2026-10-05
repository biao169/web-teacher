"""Deterministic website routes; bindings and identities are resolved per request."""
from backend.app.native.web import create_app
from worker_runtime.setup import install
from worker_runtime.bridge import BoundApplication
from worker_runtime.http_boundary import Boundary


def request_resources(request):
    # Never import generated bindings/templates or resolve an environment at snapshot time.
    from worker_runtime.resources import resource_factory
    return resource_factory(request)


site = create_app(request_resources)
install(site, request_resources)
site.middleware_stack = site.build_middleware_stack()
application = Boundary(BoundApplication(site))
