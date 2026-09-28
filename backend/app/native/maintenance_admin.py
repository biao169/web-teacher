"""Local-only maintenance workspace, using existing system role and CSRF controls."""
import json,asyncio
from contextlib import asynccontextmanager
from fastapi import Request
from fastapi.responses import JSONResponse
from .catalog import Error,now
from .web import payload
from backend.maintenance.policy import load,validate,KEY
from backend.maintenance.runtime import Maintenance
from backend.maintenance.monitor import Monitor


def allowed(p):
    return bool(p and p.get('is_system')==1 and not p.get('must_change_password') and p.get('permissions',{}).get('global_settings',{}).get('can_view'))

def install(app,resources,csrf,render):
    monitor=None;operation=asyncio.Lock()
    def check(r,action='view'):
        r.auth.require(r.p,'global_settings',action)
        if not allowed(r.p):raise Error('仅系统管理员可管理运行维护',403)
        if r.kind!='local':raise Error('此页面仅适用于 Windows/Linux 本地部署',409)
    def observer(r):
        nonlocal monitor
        if monitor is None:monitor=Monitor(r.settings)
        return monitor
    original=app.router.lifespan_context
    @asynccontextmanager
    async def lifespan(application):
        async with original(application):
            try:yield
            finally:
                if monitor:monitor.close()
    app.router.lifespan_context=lifespan
    @app.get('/admin/runtime-maintenance')
    async def page(request:Request):
        r=await resources(request);check(r)
        response=await render(r,'admin/native-maintenance.html','runtime-maintenance','运行维护',policy=await load(r.sql))
        response.headers['Cache-Control']='no-store';return response
    @app.get('/api/admin/runtime-maintenance/status')
    async def status(request:Request):
        r=await resources(request);check(r);m=Maintenance(r.sql,r.settings)
        data={'policy':{k:v for k,v in (await load(r.sql)).items() if k!='raw'},'resources':observer(r).snapshot(r.sql),'last':await m.load('status.json'),'transfer_cleanup':getattr(getattr(app.state,'transfer_maintenance',None),'status',None)}
        return JSONResponse(data,headers={'Cache-Control':'no-store'})
    @app.post('/api/admin/runtime-maintenance')
    async def action(request:Request):
        r=await resources(request);data=await payload(request,16384);csrf(request,r,data)
        op=data.get('action');check(r,'edit' if op=='save' else 'delete' if op=='run' else 'view')
        if op not in ('save','preview','run','scan'):raise Error('维护操作无效')
        if operation.locked():raise Error('维护操作正在执行，请稍后重试',409)
        async with operation:
            if op=='save':
                values=validate(data.get('values'));current=await load(r.sql)
                if type(data.get('revision')) is not int or current['revision']!=data['revision']:raise Error('策略已变化，请刷新后重新修改',409)
                condition='NOT EXISTS(SELECT 1 FROM service_meta WHERE key=?)' if current['raw'] is None else 'EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)'
                args=(KEY,) if current['raw'] is None else (KEY,current['raw'])
                gid,guard=r.auth.guard(r.p,'global_settings','edit',condition,args)
                encoded=json.dumps({'revision':current['revision']+1,'values':values},ensure_ascii=False)
                await r.sql.batch([guard,('INSERT INTO service_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(KEY,encoded)),r.content.audit(r.p,'global_settings','maintenance-policy',KEY),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
                runner=getattr(app.state,'site_maintenance',None)
                if runner:runner.next_run=0
                return {'revision':current['revision']+1,'values':values}
            if op=='scan':return observer(r).step(bool(data.get('restart',False)))
            # Recheck the live authorization before entering the shared cleanup service.
            gid,guard=r.auth.guard(r.p,'global_settings','delete' if op=='run' else 'view')
            await r.sql.batch([guard,('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
            try:return await Maintenance(r.sql,r.settings).tick(op=='run')
            except ValueError as exc:raise Error('自动维护或其他清理正在运行，请稍后重试',409) from exc
