"""会话管理HTTP适配：共享身份、CSRF、固定导航及局部模板，不刷新账号草稿。"""
from urllib.parse import urlencode,quote
from fastapi import Request
from fastapi.responses import JSONResponse
from .sessions import Sessions

def panel(r,model,nav='',nav_stamp=''):
    """渲染共用会话片段；分页URL仅含白名单筛选及ASCII导航标识。"""
    endpoint='/api/admin/accounts/'+quote(model['uid'],safe='')+'/sessions'
    def page_url(page):
        """为同一会话区保留筛选、页大小和导航条件，返回片段读取地址。"""
        return endpoint+'?'+urlencode({**model['query'],'size':model['size'],'page':page,**({'nav':nav} if nav else {})})
    return r.renderer.render('admin/native-sessions.html',sessions=model,page_url=page_url,endpoint=endpoint,nav=nav,nav_stamp=nav_stamp)

def install(app,resources,csrf,resolve,navigation_stamp,check_navigation_current):
    """注册独立会话端点；身份在每次读取/写入时重新取得。"""
    from .web import payload

    @app.get('/api/admin/accounts/{uid}/sessions')
    async def listing(request:Request,uid:str):
        """重新授权并返回一页HTML，供账号单页中的刷新、筛选和分页复用。"""
        r=await resources(request);_,base,nav,_=await resolve(request,r,'auth_users')
        model=await Sessions(r).listing(uid,dict(request.query_params),base)
        await check_navigation_current(r)
        return JSONResponse({'html':panel(r,model,nav,(r.navigation_context or {}).get('updated_at',''))})

    @app.post('/api/admin/accounts/{uid}/sessions/revoke')
    async def revoke(request:Request,uid:str):
        """只接受显式撤销动作；账号和导航版本、会话权限、审计在同一写事务检查。"""
        r=await resources(request);data=await payload(request,20000);csrf(request,r,data)
        _,base,_,_=await resolve(request,r,'auth_users',data.get('nav') or None)
        navigation_stamp(r,data.get('nav_stamp',''))
        return await Sessions(r).revoke(uid,data.get('stamp'),data.get('mode'),data.get('selected'),base,r.navigation_context)
