"""Static shared-HTML gate. No SQL, identity or response-body processing."""
from urllib.parse import urlsplit,parse_qs

TABLES=frozenset(('profiles','students','research_interests','projects','publications','patents','courses','news'))

def eligible(request,env):
    if str(getattr(env,'TEACHER_WORKER_CACHE_MODE','simple'))=='off':return False
    if int(getattr(env,'TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS','1800'))<=0:return False
    if str(request.method) not in ('GET','HEAD'):return False
    if request.headers.get('x-public-fragment')=='1':return False
    if any(request.headers.get(k) for k in ('range','if-match','if-unmodified-since')):return False
    if 'application/json' in str(request.headers.get('accept') or ''):return False
    url=urlsplit(str(request.url));parts=url.path.split('/')
    # Exact standard home/list routes only. No details, forms or custom navigation.
    if not (len(parts)==2 and parts[1] in ('en','zh') or len(parts)==3 and parts[1] in ('en','zh') and parts[2] in TABLES):return False
    if len(url.query)>8192:return False
    try:query=parse_qs(url.query,keep_blank_values=True,max_num_fields=40)
    except ValueError:return False
    return not any(k in query for k in ('nav','nv','__recover'))

async def forward(request,env,ctx):
    from backend.app.security.http import AuthConfig,AuthError
    # Host checks must happen before a cache HIT bypasses application middleware.
    try:
        AuthConfig.from_origin(str(env.TEACHER_ORIGIN),str(getattr(env,'TEACHER_ALLOWED_ORIGINS',''))).valid_host(request)
    except AuthError:
        from workers import Response
        return Response('Invalid site address',status=400,headers={'cache-control':'no-store','cloudflare-cdn-cache-control':'no-store'})
    from js import Request
    public=Request.new(getattr(request,'js_object',request))
    public.headers.delete('cookie');public.headers.delete('authorization')
    return await ctx.exports.PublicPage.fetch(public)
