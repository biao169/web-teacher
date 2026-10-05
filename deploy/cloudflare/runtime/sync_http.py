"""Sync JSON APIs bypass website app, renderer and unrelated service factories.

Monitor is a separate app: no business routes/scheduler imports are needed to
read status. Sessions, CSRF, origin policy and module permissions are unchanged.
"""
from worker_runtime.http_boundary import Boundary


def build(monitor=False):
    from fastapi import FastAPI,Request
    from fastapi.responses import JSONResponse
    from backend.app.native.catalog import Error
    from backend.app.native.auth import Auth
    from backend.app.native.http_csrf import csrf
    from backend.app.native.http_payload import payload
    from backend.app.security.http import AuthConfig
    from backend.app.adapters.d1.sql import D1SQL
    from worker_runtime.bridge import Environment
    from worker_runtime.sync_resources import resource_factory
    app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)

    async def resources(request):
        if 'sync_resources' in request.scope:return request.scope['sync_resources']
        env=Environment(request.scope['env'])
        config=AuthConfig.from_origin(str(env.TEACHER_ORIGIN),str(getattr(env,'TEACHER_ALLOWED_ORIGINS','')))
        config.valid_host(request)
        r=resource_factory(D1SQL(getattr(env,str(getattr(env,'TEACHER_DATABASE_BINDING','DB')))),env)
        r.config=config;r.auth=Auth(r.sql,None)
        r.p=await r.auth.principal(request.cookies.get(config.name('session')))
        request.scope['sync_resources']=r
        return r

    @app.exception_handler(Error)
    async def domain_error(request,exc):
        code=exc.code or ('session_required' if exc.status==401 else 'request_forbidden' if exc.status==403 else 'request_failed')
        return JSONResponse({'error':exc.message,'code':code},status_code=exc.status,headers={'Cache-Control':'no-store'})

    try:
        from sqlite3 import IntegrityError
    except ImportError:
        IntegrityError=None
    if IntegrityError:
        @app.exception_handler(IntegrityError)
        async def conflict(request,exc):
            return await domain_error(request,Error('数据已变化，或存在重复值、被引用条目和无效字段。请刷新后检查。',409))

    @app.middleware('http')
    async def headers(request,call_next):
        # Host checks apply even to malformed/unknown routes; errors stay JSON.
        try:
            await resources(request)
            response=await call_next(request)
        except Error as exc:return await domain_error(request,exc)
        except Exception as exc:
            from worker_runtime.diagnostics import emit,failure
            emit('SYNC-HTTP','ERROR',exceptions=failure(exc))
            return JSONResponse({'error':'本站同步接口暂未完成；已保存进度保留，稍后重试。','code':'worker_request_failed'},status_code=503,headers={'Cache-Control':'no-store','Retry-After':'60'})
        response.headers['Cache-Control']='no-store'
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['X-Robots-Tag']='noindex, nofollow'
        return response

    if monitor:
        @app.post('/api/admin/site-sync/wake')
        async def wake(request:Request):
            from backend.app.native.data_tools import authorize
            from backend.app.native.site_sync_wake import claim
            r=await resources(request);data=await payload(request,16384)
            csrf(request,r,data);authorize(r,'edit')
            if not await claim(r.sql):return JSONResponse({'skipped':'wake-cooldown'},headers={'Cache-Control':'no-store'})
            from worker_runtime.sync_schedule import run
            return JSONResponse(await run(r.sql,r._bindings,source='browser-wake'),headers={'Cache-Control':'no-store'})

        @app.post('/api/admin/site-sync/monitor')
        async def status(request:Request):
            from backend.app.native.data_tools import authorize
            from backend.app.native.site_sync_status import read
            r=await resources(request);data=await payload(request,262144)
            csrf(request,r,data);authorize(r,'edit')
            return JSONResponse({**await read(r,data),'browser_wake_available':True},headers={'Cache-Control':'no-store'})
    else:
        from backend.app.native.site_sync_admin import install
        async def no_page(*args,**kwargs):raise Error('此入口仅提供同步 JSON 接口',404)
        install(app,resources,csrf,no_page)
    return Boundary(app)

class LazySync:
    def __init__(self,monitor=False):self.monitor=monitor;self.application=None
    async def __call__(self,scope,receive,send):
        if self.application is None:self.application=build(self.monitor)
        await self.application(scope,receive,send)

monitor=LazySync(True)
application=LazySync()
