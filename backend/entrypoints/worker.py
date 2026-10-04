"""Main Python Worker using configurable D1/R2 bindings and the same native services."""
from workers import asgi
from types import SimpleNamespace
from backend.app.native.site_sync_limits import for_kind
from pathlib import Path
from backend.app.config import Settings
from backend.app.security.http import AuthConfig
from backend.app.security.passwords import Passwords
from backend.app.adapters.worker_crypto.passwords import derive
from backend.app.adapters.worker_crypto.scholarly import CrossrefTransport
from backend.app.native.metadata_config import credentials,ENV_KEYS
from backend.app.adapters.worker_crypto.translation import TranslationTransport
from backend.app.native.translation_config import credentials as translation_credentials,allowed_hosts,DEPLOY_VARS
from backend.app.adapters.d1.sql import D1SQL
from backend.app.native.storage import R2Store
from backend.app.native.web import create_app
from backend.app.web.rendering import Renderer
from generated_resources import TEMPLATES
renderer=Renderer.bundled(TEMPLATES)
def resource_factory(request):
    """Resolve current platform binding names without any local filesystem address assumptions."""
    env=request.scope['env'];defaults=Settings(Path('/runtime-data'));names={'database_binding':'TEACHER_DATABASE_BINDING','media_binding':'TEACHER_MEDIA_BINDING','cache_binding':'TEACHER_CACHE_BINDING','media_prefix':'TEACHER_MEDIA_PREFIX','cache_prefix':'TEACHER_CACHE_PREFIX'}
    s=Settings(Path('/runtime-data'),**{k:str(getattr(env,v,getattr(defaults,k))) for k,v in names.items()})
    translation_env={k:getattr(env,k,'') for k in DEPLOY_VARS};hosts=allowed_hosts(translation_env)
    return SimpleNamespace(metadata_credentials=credentials({k:getattr(env,k,'') for k in (*ENV_KEYS.values(),'TEACHER_METADATA_EMAIL')}),sql=D1SQL(getattr(env,s.database_binding)),passwords=Passwords(derive),renderer=renderer,config=AuthConfig.from_origin(str(env.TEACHER_ORIGIN),str(getattr(env,'TEACHER_ALLOWED_ORIGINS',''))),media_store=R2Store(getattr(env,s.media_binding),s.media_prefix),cache_store=R2Store(getattr(env,s.cache_binding),s.cache_prefix),asset_mode='local',kind='r2',sync_limits=for_kind('r2'),settings=s,scholarly=CrossrefTransport(),translation_credentials=translation_credentials(translation_env),translation_hosts=hosts,translation_transport=TranslationTransport(hosts),transfer_url=str(getattr(env,'TEACHER_TRANSFER_URL','')),transfer_secret=str(getattr(env,'TEACHER_TRANSFER_SECRET','')))
app=create_app(resource_factory)
Default=asgi.entrypoint(app)
