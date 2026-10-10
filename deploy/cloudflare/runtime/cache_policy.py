"""Worker-only policy, shared by build validation and request resource creation."""
from dataclasses import replace
from backend.app.public_performance import PublicPerformance

def policy(env,*,admin=False):
    get=env.get if isinstance(env,dict) else lambda key,default=None:getattr(env,key,default)
    mode='off' if admin else str(get('TEACHER_WORKER_CACHE_MODE','simple')).strip()
    if mode not in ('simple','full','off'):raise ValueError('TEACHER_WORKER_CACHE_MODE must be simple, full or off')
    performance=PublicPerformance() if admin else PublicPerformance.from_env(env)
    if mode!='full':performance=replace(performance,public_nav_prefetch_concurrency=0,public_stream_concurrency=1)
    if mode=='off':performance=replace(performance,public_cache_ttl_seconds=0,public_page_cache_ttl_seconds=0)
    request_cache=mode=='full' and str(get('TEACHER_WORKER_REQUEST_CACHE','1')).strip()!='0'
    return mode,performance,request_cache

def variables(env):
    mode,performance,request_cache=policy(env)
    return dict(performance.to_env(),TEACHER_WORKER_CACHE_MODE=mode,TEACHER_WORKER_REQUEST_CACHE='1' if request_cache else '0')
