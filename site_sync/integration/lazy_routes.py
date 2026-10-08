"""Publish sync route definitions on first matching request, never task state.

The child Router runs under the existing site's exception/host/CSRF boundaries.
No nested application middleware, URL rewriting or background jobs are added.
"""
from starlette.routing import BaseRoute,Match

def is_sync(path):
    return path=='/sync/v1/read' or any(path==prefix or path.startswith(prefix+'/') for prefix in ('/admin/site-sync','/api/admin/site-sync'))

class LazySyncRoutes(BaseRoute):
    def __init__(self,resources,csrf,render):
        self.resources,self.csrf,self.render=resources,csrf,render
        self.router=None
    def matches(self,scope):
        return (Match.FULL,{}) if scope['type']=='http' and is_sync(scope['path']) else (Match.NONE,{})
    def url_path_for(self,name,**path_params):
        from starlette.routing import NoMatchFound
        if self.router is None:raise NoMatchFound(name,path_params)
        return self.router.url_path_for(name,**path_params)
    async def handle(self,scope,receive,send):
        if self.router is None:
            from fastapi import FastAPI
            from .web import install
            import time
            from site_sync.core.trace import record
            from site_sync.core.journal import failure
            started=time.monotonic()
            record('INIT-SYNC-ROUTES',application_outcome='started')
            try:
                child=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
                # Synchronous construction cannot interleave. Publish only after
                # successful installation; never retain a half-built router.
                install(child,self.resources,self.csrf,self.render,shared_middleware=False)
            except Exception as exc:
                record('INIT-SYNC-ROUTES',application_outcome='exception',diagnostic=failure(exc),duration_ms=round((time.monotonic()-started)*1000,2))
                raise
            self.router=child.router
            record('INIT-SYNC-ROUTES',application_outcome='returned',duration_ms=round((time.monotonic()-started)*1000,2))
        await self.router(scope,receive,send)

def install(app,resources,csrf,render):
    from .write_gate import install as gate
    from .credentials_api import install_headers
    install_headers(app)
    gate(app,resources)
    app.router.routes.append(LazySyncRoutes(resources,csrf,render))
