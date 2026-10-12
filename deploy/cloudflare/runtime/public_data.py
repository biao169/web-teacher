"""PublicData entrypoint gate and minimal D1-only generation on a platform MISS."""
from backend.app.public_performance import data_target


def eligible(request,env):
    return data_target(request) is not None


async def forward(request,env,ctx):
    from worker_runtime.public_page import forward as anonymous_forward
    return await anonymous_forward(request,env,ctx,entrypoint='PublicData')


async def serve(request,env):
    from workers import Response
    from backend.app.native.public_read_api import generate, invalid_request, error_reply
    if not eligible(request,env):result=invalid_request(request)
    else:
        from backend.app.security.http import AuthConfig, AuthError
        try:
            AuthConfig.from_origin(str(env.TEACHER_ORIGIN),str(getattr(env,'TEACHER_ALLOWED_ORIGINS',''))).valid_host(request)
        except AuthError:result=error_reply(400,'HOST_INVALID')
        else:
            from types import SimpleNamespace
            from backend.app.adapters.d1.sql import D1SQL
            from worker_runtime.bridge import Database
            try:
                name=str(getattr(env,'TEACHER_DATABASE_BINDING','DB'))
                # No R2, identity, tool clients, Jinja, service binding or application factory.
                result=await generate(request,SimpleNamespace(sql=D1SQL(Database(getattr(env,name)))))
            except Exception:
                import logging
                logging.getLogger(__name__).exception('PublicData resource setup failed')
                result=error_reply(503,'PUBLIC_DATA_UNAVAILABLE')
    body=None if str(request.method)=='HEAD' or result.status==304 else result.text
    return Response(body,status=result.status,headers=result.headers)
