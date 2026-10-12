"""Worker configuration adapter for the single success-only Public policy."""
from dataclasses import replace
from backend.app.public_performance import PublicPerformance

def policy(env, *, admin=False):
    performance = PublicPerformance() if admin else PublicPerformance.from_env(env)
    return replace(performance, public_stream_concurrency=1)

def variables(env):
    return policy(env).to_env()

def edge_cache(env):
    return {'enabled': False, 'cross_version_cache': False}

def entrypoint_cache(env):
    return {'default': {'type': 'worker', 'cache': {'enabled': False}},
            'PublicPage': {'type': 'worker', 'cache': {'enabled': True}},
            'PublicData': {'type': 'worker', 'cache': {'enabled': True}}}
