"""Private Public-page components served by Admin, without Public resource setup."""
from fastapi import Request
from fastapi.responses import JSONResponse
from .auth import Auth
from .public_data import project_private_allowed

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
        _,p=await identity(request)
        data={'authenticated':bool(p),'can_enter_admin':False,'can_view_private_projects':False}
        if p:
            data.update({k:p[k] for k in ('uid','username','display_name','csrf','must_change_password','can_enter_admin','can_view_private_projects')})
        return JSONResponse(data,headers=HEADERS)

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
