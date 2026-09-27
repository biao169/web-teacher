"""Independent transfer Worker with separately configurable D1, media and cache storage."""
from workers import asgi
from pathlib import Path
from types import SimpleNamespace
from jinja2 import Environment,DictLoader,select_autoescape,StrictUndefined
from backend.app.config import Settings
from backend.app.adapters.d1.sql import D1SQL
from backend.app.native.storage import R2Store
from backend.app.security.http import AuthConfig
from generated_resources import TRANSFER_TEMPLATES
from .native import app_factory
templates=Environment(loader=DictLoader(TRANSFER_TEMPLATES),autoescape=select_autoescape(),undefined=StrictUndefined)
def factory(request):
    """Build a per-request resource context from explicit transfer platform bindings."""
    env=request.scope['env'];defaults=Settings(Path('/runtime-data'));names={'transfer_database_binding':'TRANSFER_DATABASE_BINDING','transfer_media_binding':'TRANSFER_MEDIA_BINDING','transfer_cache_binding':'TRANSFER_CACHE_BINDING','transfer_media_prefix':'TRANSFER_MEDIA_PREFIX','transfer_cache_prefix':'TRANSFER_CACHE_PREFIX'}
    s=Settings(Path('/runtime-data'),**{k:str(getattr(env,v,getattr(defaults,k))) for k,v in names.items()})
    return SimpleNamespace(sql=D1SQL(getattr(env,s.transfer_database_binding)),store=R2Store(getattr(env,s.transfer_media_binding),s.transfer_media_prefix),cache=R2Store(getattr(env,s.transfer_cache_binding),s.transfer_cache_prefix),origin=AuthConfig.from_origin(str(env.TRANSFER_ORIGIN)).origin,teacher_origin=AuthConfig.from_origin(str(env.TEACHER_ORIGIN)).origin,secret=str(getattr(env,'TEACHER_TRANSFER_SECRET','')),render=lambda name,**values:templates.get_template(name).render(**values))
Default=asgi.entrypoint(app_factory(factory))
