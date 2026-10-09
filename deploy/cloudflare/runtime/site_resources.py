"""Shared binding resolution; public reads never construct admin tool clients."""
from types import SimpleNamespace
from pathlib import Path
from backend.app.config import Settings
from backend.app.security.http import AuthConfig
from backend.app.adapters.d1.sql import D1SQL
from backend.app.native.storage import R2Store

def resource(request,renderer,*,admin=False):
    env=request.scope['env'];defaults=Settings(Path('/runtime-data'))
    names={'database_binding':'TEACHER_DATABASE_BINDING','media_binding':'TEACHER_MEDIA_BINDING','cache_binding':'TEACHER_CACHE_BINDING','media_prefix':'TEACHER_MEDIA_PREFIX','cache_prefix':'TEACHER_CACHE_PREFIX'}
    s=Settings(Path('/runtime-data'),**{k:str(getattr(env,v,getattr(defaults,k))) for k,v in names.items()})
    r=SimpleNamespace(sql=D1SQL(getattr(env,s.database_binding)),passwords=None,renderer=renderer,
        config=AuthConfig.from_origin(str(env.TEACHER_ORIGIN),str(getattr(env,'TEACHER_ALLOWED_ORIGINS',''))),
        media_store=R2Store(getattr(env,s.media_binding),s.media_prefix),cache_store=R2Store(getattr(env,s.cache_binding),s.cache_prefix),
        asset_mode='local',public_request_cache=str(getattr(env,'TEACHER_WORKER_REQUEST_CACHE','1')).strip()!='0',kind='r2',sync_env=env,settings=s,
        transfer_url=str(getattr(env,'TEACHER_TRANSFER_URL','')),transfer_secret=str(getattr(env,'TEACHER_TRANSFER_SECRET','')))
    if admin:
        from backend.app.security.passwords import Passwords
        from backend.app.adapters.worker_crypto.passwords import derive
        from backend.app.adapters.worker_crypto.scholarly import CrossrefTransport
        from backend.app.native.metadata_config import credentials,ENV_KEYS
        from backend.app.adapters.worker_crypto.translation import TranslationTransport
        from backend.app.native.translation_config import credentials as translation_credentials,allowed_hosts,DEPLOY_VARS
        values={k:getattr(env,k,'') for k in DEPLOY_VARS};hosts=allowed_hosts(values)
        r.passwords=Passwords(derive);r.metadata_credentials=credentials({k:getattr(env,k,'') for k in (*ENV_KEYS.values(),'TEACHER_METADATA_EMAIL')})
        r.scholarly=CrossrefTransport();r.translation_credentials=translation_credentials(values)
        r.translation_hosts=hosts;r.translation_transport=TranslationTransport(hosts)
    return r
