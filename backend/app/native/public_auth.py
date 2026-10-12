"""Public authentication presentation over the existing Auth and registration services."""
import secrets,hmac
from urllib.parse import urlsplit,urlencode,unquote
from fastapi import Request
from fastapi.responses import JSONResponse,RedirectResponse
from .catalog import Error
from .public_actions import register

MESSAGES={
 '密码需要6—128个字符':'Use a password of 6–128 characters.',
 '账号或密码不正确':'Incorrect username or password.',
 '账号或密码输入无效':'Enter a valid username and password.',
 '尝试过多，请15分钟后重试':'Too many attempts. Please try again in 15 minutes.',
 '账号需3—64位字母、数字、点、下划线或短横线':'Use 3–64 letters, numbers, dots, underscores or hyphens for your username.',
 '邮箱格式无效':'Enter a valid email address.',
 '网站尚未开放注册':'Registration is currently closed.',
 '当前无法注册':'Registration is currently unavailable.',
 '提交过于频繁，请稍后重试':'Too many submissions. Please try again later.',
 '表单已过期，请重新提交':'This form has expired. Please enter your password and submit again.',
 '账号已存在或不可用':'This username already exists or is unavailable.',
 '输入格式无效':'Invalid input format.',
}
def safe_next(value):
    if not isinstance(value,str) or len(value)>2048:return ''
    if any(ord(c)<33 or c=='\\' for c in unquote(value)):return ''
    try:parts=urlsplit(value)
    except ValueError:return ''
    if parts.scheme or parts.netloc or parts.fragment or '%' in parts.path:return ''
    if any(x in ('.','..') for x in parts.path.split('/')):return ''
    return value if any(parts.path==base or parts.path.startswith(base+'/') for base in ('/zh','/en','/admin','/transfer')) else ''

def install(app,resources,render):
    from .web_common import payload,IntegrityError
    async def presentation(request,r,mode,data=None,message='',status=200):
        data=data or {};lang=data.get('lang',request.query_params.get('lang','en'));lang=lang if lang in ('zh','en') else 'en'
        target=safe_next(data.get('next',request.query_params.get('next','')))
        allowed=bool(await r.sql.query('SELECT 1 FROM global_settings WHERE allow_public_registration=1 LIMIT 1'))
        if mode=='register' and not allowed:status=403;message='网站尚未开放注册'
        en=lang=='en'
        if en and message:message=MESSAGES.get(message,'Unable to complete this request. Please check your entries and try again.')
        if not message and mode=='login' and request.query_params.get('registered')=='1':message='Registration complete. Please sign in.' if en else '注册成功，请登录。'
        challenge=secrets.token_urlsafe(32);params=urlencode({'lang':lang,'next':target})
        values=dict(lang=lang,auth_mode=mode,auth_next=target,auth_allowed=allowed,auth_challenge=challenge,auth_message=message,auth_username=data.get('username','') if isinstance(data.get('username',''),str) else '',auth_email=data.get('email','') if isinstance(data.get('email',''),str) else '',auth_switch='/auth/'+('register' if mode=='login' else 'login')+'?'+params)
        if request.headers.get('x-auth-fragment')=='1' or request.headers.get('accept','').startswith('application/json'):
            response=JSONResponse({'ok':False,'mode':mode,'html':r.renderer.render('public/auth-form.html',**values)},status_code=status)
        else:response=await render(r,'public/auth-page.html',**values);response.status_code=status
        response.headers['Cache-Control']='no-store';r.config.set_cookie(response,'login' if mode=='login' else 'public-form',challenge,600)
        return response
    @app.get('/auth/login')
    @app.get('/auth/register')
    async def auth_get(request:Request):
        return await presentation(request,await resources(request),'register' if request.url.path.endswith('register') else 'login')
    @app.post('/auth/login')
    @app.post('/auth/register')
    async def auth_post(request:Request):
        r=await resources(request);mode='register' if request.url.path.endswith('register') else 'login';data={};session=None
        try:
            data=await payload(request,16384)
            if any(not isinstance(data.get(k,''),str) for k in ('username','password','email','lang','next','challenge')):raise Error('输入格式无效')
            token=request.cookies.get(r.config.name('login' if mode=='login' else 'public-form'),'')
            if not token or not r.config.origin_matches(request) or not hmac.compare_digest(data.get('challenge','').encode(),token.encode()):raise Error('表单已过期，请重新提交',403)
            if mode=='register':
                if not await r.sql.query('SELECT 1 FROM global_settings WHERE allow_public_registration=1 LIMIT 1'):raise Error('网站尚未开放注册',403)
                await register(r,data,request.client.host if request.client else 'worker')
            else:session=await r.auth.login(data.get('username',''),data.get('password',''),request.client.host if request.client else 'worker')
        except IntegrityError:return await presentation(request,r,mode,data,'账号已存在或不可用',409)
        except Error as exc:return await presentation(request,r,mode,data,exc.message,exc.status)
        lang=data.get('lang','en');lang=lang if lang in ('zh','en') else 'en';target=safe_next(data.get('next',''))
        if mode=='register':target='/auth/login?'+urlencode({'lang':lang,'next':target,'registered':'1'})
        elif not target:
            principal=await r.auth.principal(session)
            target='/admin' if principal and any(v.get('can_view') for v in principal['permissions'].values()) else '/'+lang
        if request.headers.get('accept','').startswith('application/json'):response=JSONResponse({'ok':True,'redirect':target,'registered':mode=='register'})
        else:response=RedirectResponse(target,303)
        response.headers['Cache-Control']='no-store'
        if session:r.config.set_cookie(response,'session',session,43200)
        return response
