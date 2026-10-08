"""Small shared write protection; GET never reads sync state or builds sync routes."""
from fastapi.responses import JSONResponse

def install(app,resources):
    @app.middleware('http')
    async def clone_write_gate(request,call_next):
        path=request.url.path
        if request.method not in ('GET','HEAD','OPTIONS') and not path.startswith(('/sync/','/api/admin/site-sync','/admin/site-sync/api','/auth/login','/auth/logout')):
            r=await resources(request)
            lock=await r.sql.query("SELECT 1 FROM service_meta m JOIN sync_tasks t ON t.task_id=m.value WHERE m.key='sync:clone-lock' AND t.phase='apply' AND t.status NOT IN ('done','cancelled','cancel_requested') LIMIT 1")
            if lock:return JSONResponse({'error':'整站克隆正在应用数据，请暂缓编辑；可在同步页面暂停或取消任务'},status_code=409,headers={'Cache-Control':'no-store'})
        return await call_next(request)
