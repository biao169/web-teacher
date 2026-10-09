"""Public/DO and maintenance declarations only; no full-site or admin routes."""
from backend.app.native import web_public
from backend.app.web.rendering import Renderer
from worker_runtime import site_resources
from worker_runtime.bridge import BoundApplication
# Existing DO ownership and room services stay on the main script.
from worker_runtime.transfer import install as install_transfer
from worker_runtime.cleanup import run as cleanup
from transfer.backend import folders,receivers,lan,relay,codes
from backend.maintenance import media_uploads

# Generated role resources enter the deployment snapshot; source-only tests omit them.
from importlib.util import find_spec
if find_spec("worker_runtime.public_resources") is not None:
    from worker_runtime import public_resources

# Inline is retained explicitly; only that deployment preloads peer execution definitions.
if find_spec('worker_runtime.site_mode') is not None:
    from worker_runtime.site_mode import SYNC_EXECUTOR_MODE
    if SYNC_EXECUTOR_MODE=='inline':
        from worker_runtime import sync_resources
        from site_sync.integration import host,website
