"""Deterministic admin-only declarations; no app, database or network work."""
from backend.app.native import web_admin
from backend.app.web.rendering import Renderer
from backend.app.security.passwords import Passwords
from backend.app.adapters.worker_crypto.passwords import derive
from backend.app.adapters.worker_crypto.scholarly import CrossrefTransport
from backend.app.adapters.worker_crypto.translation import TranslationTransport
from backend.app.native import metadata_config,translation_config
from worker_runtime import setup,media_upload
from site_sync.integration import lazy_routes,write_gate,credentials_api,control_api

# Generated role resources enter the deployment snapshot; source-only tests omit them.
from importlib.util import find_spec
if find_spec("worker_runtime.admin_resources") is not None:
    from worker_runtime import admin_resources

# Lightweight error responses must also be available in the Python snapshot.
from worker_runtime import admin_recovery

# Pure cache-change declarations; no cache operation occurs during snapshot.
from backend.app.native import public_cache_tags
from worker_runtime import public_invalidation
