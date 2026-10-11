"""Public/DO and maintenance declarations only; no full-site or admin routes."""
from backend.app.native import web_public,public_cache,public_revision
from backend.app import public_performance
from backend.app.native import public_recovery
from worker_runtime import public_recovery as recovery_boundary
from backend.app.web.rendering import Renderer
from worker_runtime import site_resources
from worker_runtime.bridge import BoundApplication
# Generated role resources enter the deployment snapshot; source-only tests omit them.
from importlib.util import find_spec
if find_spec('generated_public_recovery') is not None:
    public_recovery.template() # Immutable small HTML only; no Jinja/SQL/identity.
if find_spec("worker_runtime.public_resources") is not None:
    from worker_runtime import public_resources

