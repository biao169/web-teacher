"""Local runtime composition uses the same service contracts as Worker bindings."""
from types import SimpleNamespace
from backend.app.config import Settings,PROJECT_ROOT
from backend.app.security.http import AuthConfig
from backend.app.security.passwords import Passwords
from backend.app.web.rendering import Renderer

def local(settings=None):
    """Resolve configured addresses once; no example data or accounts are inserted here."""
    from .database import Database
    from .storage import LocalStore
    from backend.app.adapters.sqlite.passwords import LocalKDF
    import os
    from backend.app.public_performance import PublicPerformance
    performance=PublicPerformance.from_env()
    settings=settings or Settings.from_env();sql=Database(settings.database_path);sql.initialize()
    from backend.app.adapters.local_files.scholarly import CrossrefTransport
    from .metadata_config import credentials
    from backend.app.adapters.local_files.translation import TranslationTransport
    from .translation_config import credentials as translation_credentials,allowed_hosts
    hosts=allowed_hosts(os.environ)
    return SimpleNamespace(public_performance=performance,metadata_credentials=credentials(os.environ),scholarly=CrossrefTransport(),translation_credentials=translation_credentials(os.environ),translation_hosts=hosts,translation_transport=TranslationTransport(hosts),sql=sql,passwords=Passwords(LocalKDF()),renderer=Renderer.local(PROJECT_ROOT),config=AuthConfig.from_env(),media_store=LocalStore(settings.media_dir),cache_store=LocalStore(settings.cache_dir),asset_mode=settings.asset_mode,kind='local',settings=settings,transfer_url='/transfer',transfer_secret=os.environ.get('TEACHER_TRANSFER_SECRET',''))
