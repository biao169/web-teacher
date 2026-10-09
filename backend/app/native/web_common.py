"""Request resources, validation and HTTP policy shared by both route groups."""
import json,hmac,copy
try:
    import sqlite3
    IntegrityError=sqlite3.IntegrityError
except ImportError:
    class IntegrityError(Exception):pass
from urllib.parse import parse_qs
from fastapi import FastAPI,Request
from fastapi.responses import HTMLResponse,JSONResponse
from fastapi.staticfiles import StaticFiles
from .catalog import Error
from .auth import Auth
from .content import Content
from .media import Media
from .web_context import renderer

async def payload(request,limit=500000):
    """Bound request size and reject duplicate form/JSON keys before dispatch."""
    buf=bytearray()
    async for chunk in request.stream():
        if len(buf)+len(chunk)>limit:raise Error('请求内容过大',413)
        buf.extend(chunk)
    try:
        if request.headers.get('content-type','').split(';')[0]=='application/json':
            def pairs(items):
                """为访客模板组织有值的原生字段标签及内容。"""
                d={}
                for k,v in items:
                    if k in d:raise ValueError()
                    d[k]=v
                return d
            d=json.loads(buf,object_pairs_hook=pairs)
            if not isinstance(d,dict):raise ValueError()
            return d
        parsed=parse_qs(buf.decode(),keep_blank_values=True,max_num_fields=300)
        if any(len(v)!=1 for v in parsed.values()):raise ValueError()
        return {k:v[0] for k,v in parsed.items()}
    except (ValueError,UnicodeDecodeError):raise Error('请求格式不正确') from None

def create_base(factory,static_root=None,*,areas=("shared","public","admin"),sync_assets=True):
    app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
    if static_root:
        for area in areas:app.mount("/assets/"+area,StaticFiles(directory=static_root/"frontend"/area/"static"),name="assets-"+area)
        if sync_assets:app.mount("/assets/site-sync",StaticFiles(directory=static_root/"site_sync/frontend/static"),name="assets-site-sync")
    async def resources(request):
        """按请求复制资源上下文并获取当前身份，防止请求之间串用权限。"""
        r=copy.copy(factory(request));r.auth=Auth(r.sql,r.passwords)
        r.p=await r.auth.principal(request.cookies.get(r.config.name('session')))
        parts=request.url.path.split('/')
        if not r.p and request.method=='GET' and (len(parts)>1 and parts[1] in ('en','zh') or request.url.path.startswith('/api/public/')):
            if r.kind!='local' and getattr(r,'public_request_cache',True):
                from .request_cache import RequestSQL
                r.sql=RequestSQL(r.sql)
            elif r.kind=='local' and hasattr(r.sql,'public_cache'):
                from .public_cache import PublicSQL
                r.sql=PublicSQL(r.sql)
        r.content=Content(r.sql,r.auth);r.media=Media(r.sql,r.auth,r.content,r.media_store,r.kind)
        return r
    def csrf(request,r,data):
        """Require configured origin plus session-bound CSRF, including fetch and multipart alternatives."""
        if not r.config.origin_matches(request):raise Error('请求来源不正确',403)
        if not r.p:raise Error('请先登录',401)
        value=data.get('_csrf') or request.headers.get('x-csrf-token','')
        if not hmac.compare_digest(str(value),r.p['csrf']):raise Error('页面验证已过期，请刷新',403)
    render=renderer()
    @app.middleware('http')
    async def headers(request,call_next):
        """核对Host并为响应设置安全策略和缓存控制。"""
        try:factory(request).config.valid_host(request)
        except Error as exc:return HTMLResponse('请使用配置的网站地址访问',status_code=exc.status)
        response=await call_next(request)
        if request.url.path.startswith(('/admin','/auth/','/api/','/transfer','/health')):
            response.headers['X-Robots-Tag']='noindex, nofollow'
        response.headers['X-Content-Type-Options']='nosniff';response.headers.setdefault('Referrer-Policy','same-origin')
        # Browser media may follow authorized external links; cross-origin pixel reads remain subject to CORS.
        image_policy="'self' data: https: http: blob:" if request.url.path.startswith('/admin') else "'self' data: https: http:"
        connect_policy="'self' https: http:" if request.url.path.startswith('/admin') else "'self'"
        frame_policy="'self' https: http:" if request.url.path.startswith('/admin') else "'self'"
        response.headers.setdefault('Content-Security-Policy',f"default-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'self' https://cdn.jsdelivr.net; img-src {image_policy}; media-src 'self' https: http:; connect-src {connect_policy}; worker-src 'self'; font-src 'self' data: blob:; object-src 'none'; frame-src {frame_policy}; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
        if not request.url.path.startswith('/assets/'):response.headers['Cache-Control']='no-store'
        elif response.status_code in (200,206,304):
            # Windows registry MIME mappings must not turn ES modules into text/plain.
            suffix=request.url.path.rsplit('.',1)[-1].lower()
            if suffix in ('js','mjs','css'):
                response.headers['Content-Type']='text/css; charset=utf-8' if suffix=='css' else 'text/javascript; charset=utf-8'
                response.headers['Cache-Control']='no-cache'
        return response
    @app.exception_handler(Error)
    async def domain_error(request,exc):
        """将业务异常转换为对应状态码及页面或JSON错误。"""
        code=exc.code or ('session_required' if exc.status==401 else 'request_forbidden' if exc.status==403 else 'request_failed')
        if request.headers.get('accept','').startswith('application/json'):
            response=JSONResponse({'error':exc.message,'code':code},status_code=exc.status)
            if code in ('media_read_denied','media_read_failed'):response.headers['X-Media-Error']=code
            return response
        if getattr(app.state,'web_role','full')!='public' and exc.status in (401,403) and request.url.path.startswith(('/admin','/api/','/transfer/login')):
            r=await resources(request)
            response=await render(r,'admin/native-access-error.html',title='权限不足' if code=='access_denied' else '登录已过期' if exc.status==401 else '操作受限',message=exc.message,access_code=code)
            response.status_code=exc.status;return response
        import html
        return HTMLResponse('<!doctype html><html lang="zh"><meta charset="utf-8"><title>操作提示</title><body><h1>操作未完成</h1><p>'+html.escape(exc.message)+'</p><p><a href="/admin">返回后台</a> · <a href="/auth/login">登录</a></p></body></html>',status_code=exc.status)
    @app.exception_handler(IntegrityError)
    async def database_error(request,exc):"""将数据库约束失败转换为保存冲突提示。""";return await domain_error(request,Error('数据已变化，或存在重复值、被引用条目和无效字段。请刷新后检查。',409))
    @app.get('/health/ready')
    @app.get('/health')
    async def health(request:Request):
        """返回服务就绪信息，供启动器和反向代理检查。"""
        r=factory(request);await r.sql.query('SELECT uid FROM site_settings LIMIT 1');return {'status':'ok','schema':'academic-cms-native'}
    return app,resources,csrf,render
