"""Preload public/admin HTTP definitions during deployment; never construct request state.

Keep the original worker entrypoint out: importing it also constructs an app.
Request-scoped randomness, bindings and I/O still belong to event handlers.
"""
from backend.app.native.web import create_app
from backend.app.web.rendering import Renderer
from backend.app.config import Settings
from backend.app.security.http import AuthConfig
from backend.app.security.passwords import Passwords
from backend.app.adapters.worker_crypto.passwords import derive
from backend.app.adapters.worker_crypto.scholarly import CrossrefTransport
from backend.app.adapters.worker_crypto.translation import TranslationTransport
from worker_runtime.bridge import BoundApplication
from worker_runtime.setup import install as install_setup
from worker_runtime.transfer import install as install_transfer
from worker_runtime.cleanup import run as cleanup
# These modules are otherwise first imported inside app_factory's installation.
from transfer.backend import folders, receivers, lan, relay, codes

# Sync definitions are deterministic; no peer requests or background grants run here.
from backend.app.native import site_sync_admin, site_sync_preview, site_sync_incremental, site_sync_execute_plan, site_sync_history, site_sync_latest
