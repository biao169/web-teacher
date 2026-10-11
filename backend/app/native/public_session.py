"""Private Public-page components served by Admin, without Public resource setup."""
from fastapi import Request
from fastapi.responses import JSONResponse
from .auth import Auth
from .catalog import now
from .public_data import project_private_allowed

SUMMARY_HEADERS={'Cache-Control':'private, no-store','Cloudflare-CDN-Cache-Control':'no-store','Vary':'Cookie, Authorization'}

def session_summary(p):
    # Presentation hints only; private endpoints always authenticate independently.
    data={'authenticated':bool(p),'can_enter_admin':False,'can_view_private_projects':False,
          'checked_at':now(),'display_ttl_seconds':300 if p else 60,'heartbeat_interval_seconds':300}
    if p:
        data.update({k:p[k] for k in ('uid','username','display_name','csrf','must_change_password','can_enter_admin','can_view_private_projects')})
        data.update(idle_expires_at=p['idle_expires_at'],absolute_expires_at=p['expires_at'])
    return data

HEADERS={'Cache-Control':'private, max-age=60','Vary':'Cookie, Authorization'}

def denied(message,status):
    return JSONResponse({'error':message},status_code=status,headers={**HEADERS,'Cache-Control':'no-store'})

def install(app,factory):
    async def identity(request):
        r=factory(request)
        p=await Auth(r.sql,r.passwords).public_principal(request.cookies.get(r.config.name('session')))
        return r,p

    @app.get('/api/public/session-summary')
    async def summary(request:Request):
        try:
            _,p=await identity(request)
            return JSONResponse(session_summary(p),headers=SUMMARY_HEADERS)
        except Exception as exc:
            # A storage/runtime failure is unknown identity, never authenticated=false.
            from backend.app.ports.operations import current,emit,error
            import secrets
            trace=current().get('request_id') or secrets.token_hex(16)
            emit('SESSION-SUMMARY-ERROR',request_id=trace,route=request.url.path,**error(exc))
            return JSONResponse({'code':'SESSION_CHECK_UNAVAILABLE','retryable':True,'request_id':trace},
                                status_code=503,headers={**SUMMARY_HEADERS,'Retry-After':'60','X-Request-ID':trace})

    @app.get('/api/public/admin-project-fields')
    async def project_fields(request:Request):
        r,p=await identity(request)
        if not p:return denied('请先登录',401)
        if not project_private_allowed(p):return denied('无权查看项目私有字段',403)
        uids=request.query_params.getlist('uid')
        if not 1<=len(uids)<=20 or any(not uid.strip() or len(uid)>128 for uid in uids):
            return denied('请提供1至20个有效项目UID',400)
        uids=list(dict.fromkeys(uids))
        rows=await r.sql.query("SELECT uid,principal,amount,members FROM projects WHERE visibility='public' AND uid IN ("+','.join('?' for _ in uids)+") LIMIT 20",tuple(uids))
        if request.query_params.get('lang') in ('en','zh'):
            from backend.app.domain.public_projects import project_amount
            rows=[{**row,'amount_display':project_amount(row.get('amount'),request.query_params['lang'])} for row in rows]
        return JSONResponse({'projects':rows},headers=HEADERS)
