"""Authenticated module maintenance; no content reads, warming, or direct cache access."""
from fastapi import Request
from fastapi.responses import JSONResponse
from .catalog import Error
from .web_common import payload
from .maintenance_access import allowed
from .public_cache_tags import RESET_HEADER,reset_plan

HEADERS={'Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store'}
def install(app,resources,csrf):
    @app.post('/api/admin/public-cache/reset')
    async def reset(request:Request):
        r=await resources(request);data=await payload(request,2048);csrf(request,r,data)
        r.auth.require(r.p,'global_settings','delete')
        if not allowed(r.p):raise Error('仅系统管理员可清除公开缓存',403)
        if set(data)-{'module','_csrf'}:raise Error('公开缓存参数无效',400)
        module=data.get('module')
        try:reset_plan(module)
        except ValueError:raise Error('公开缓存模块无效',400)
        if r.kind=='local':
            return JSONResponse({'module':module,'page_cache':'not_applicable','data_cache':'not_applicable'},headers=HEADERS)
        # Only the main Worker's private SITE_ADMIN response relay consumes this marker.
        return JSONResponse({'module':module,'page_cache':'pending','data_cache':'not_applicable' if module=='home' else 'pending'},
                            status_code=202,headers={**HEADERS,RESET_HEADER:module})
