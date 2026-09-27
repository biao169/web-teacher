"""Authorized grouped translation review routes; source versions remain individually editable."""
from fastapi import Request
from fastapi.responses import JSONResponse
from .catalog import Error
from .translation_groups import TranslationGroups
from .navigation import navigation_guard


def install(app,resources,render,csrf,resolve,navigation_stamp):
    """Register review reads and explicit version adoption before the generic module routes."""
    @app.get('/admin/translation-groups/{uid}')
    async def detail(request:Request,uid:str):
        """Render paged sources within the caller's original filters, with no provider calls or writes."""
        r=await resources(request);_,base,nav,_=await resolve(request,r,'translation_cache')
        groups=TranslationGroups(r,dict(request.query_params),base);listing=await groups.members(uid,request.query_params.get('part',1))
        fragment=request.headers.get('x-translation-group')=='1'
        response=await render(r,'admin/native-translation-group-panel.html' if fragment else 'admin/native-translation-group.html','translation_cache','来源与译文版本',listing=listing,group_uid=uid,
            page_url=lambda page:groups.url(uid,page),can_edit=bool(r.p['permissions'].get('translation_cache',{}).get('can_edit')),nav=nav,nav_stamp=(r.navigation_context or {}).get('updated_at',''))
        if fragment:return JSONResponse({'html':response.body.decode(),'owner':r.p['uid']})
        return response

    @app.post('/api/assistance/translation-groups/{uid}/choose')
    async def choose(request:Request,uid:str):
        """Adopt an explicitly reviewed donor for one pending row; no implicit group-wide overwrite."""
        from .web import payload
        r=await resources(request);data=await payload(request,16384);csrf(request,r,data)
        _,base,_,_=await resolve(request,r,'translation_cache');navigation_stamp(r,data.get('nav_stamp',''))
        values=[data.get(key) for key in ('donor_uid','donor_stamp','target_uid','target_stamp')]
        if any(not isinstance(value,str) or not 1<=len(value)<=128 for value in values):raise Error('来源与版本参数无效')
        return await TranslationGroups(r,dict(request.query_params),base).choose(uid,*values,navigation_guard(r.navigation_context))

    @app.post('/api/assistance/translation-groups/{uid}/translate')
    async def translate_one(request:Request,uid:str):
        """One explicit source, constrained by the same group/filter ACL; reuse the guarded service."""
        from .web import payload
        from .assistance import Assistance
        from .translation_index import identity
        r=await resources(request);data=await payload(request,4096);csrf(request,r,data)
        if set(data)-{'_csrf','target_uid','stamp','nav_stamp'}:raise Error('翻译参数无效')
        if any(not isinstance(data.get(k),str) or not 1<=len(data[k])<=128 for k in ('target_uid','stamp')):raise Error('词条与版本参数无效')
        _,base,_,_=await resolve(request,r,'translation_cache');navigation_stamp(r,data.get('nav_stamp',''))
        groups=TranslationGroups(r,dict(request.query_params),base);anchor=await groups.anchor(uid)
        where,args=groups.predicate();match,values=identity(anchor)
        if not await r.sql.query('SELECT 1 FROM translation_cache t WHERE '+where+' AND '+match+' AND t.uid=? AND t.updated_at=?',(*args,*values,data.get('target_uid'),data.get('stamp'))):raise Error('词条已变化或不在当前筛选范围，请刷新',409)
        return await Assistance(r).translate(data.get('target_uid'),data.get('stamp'),job_guard=navigation_guard(r.navigation_context))
