"""Static anonymous PublicPage forwarding; never reads SQL or response bodies."""
from backend.app.public_performance import page_request

def eligible(request, env):
    return page_request(request)

async def forward(request, env, ctx, *, entrypoint='PublicPage'):
    # Check the hostname before a platform HIT bypasses callee middleware.
    from backend.app.security.http import AuthConfig, AuthError
    try:
        AuthConfig.from_origin(str(env.TEACHER_ORIGIN), str(getattr(env, 'TEACHER_ALLOWED_ORIGINS', ''))).valid_host(request)
    except AuthError:
        from workers import Response
        return Response('Invalid site address', status=400,
                        headers={'cache-control': 'no-store', 'cloudflare-cdn-cache-control': 'no-store'})
    public = getattr(request, 'js_object', request)
    if request.headers.get('cookie') is not None or request.headers.get('authorization') is not None:
        from js import Request
        public = Request.new(public)
        public.headers.delete('cookie')
        public.headers.delete('authorization')
    return await getattr(ctx.exports, entrypoint).fetch(public)
