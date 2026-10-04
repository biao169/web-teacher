"""Transfer routes share the site's origin policy; tokens and quotas stay in services."""
from backend.app.security.http import AuthConfig


def check_origin(request, runtime):
    config = getattr(runtime, 'config', None)
    if config is None:
        config = AuthConfig.from_origin(runtime.origin)
    return config.same_origin(request)
