"""Existing admin session/CSRF plus a signed read-only peer endpoint."""
import json,time,secrets
from site_sync.core.diagnostics import RELEASE,coded,classify,CODES
from site_sync.core.journal import failure
from site_sync.core.selection import descriptions
from fastapi import Request
from fastapi.responses import Response,JSONResponse
from backend.app.native.catalog import Error
from backend.app.native.data_tools import authorize
from .host import adapter,configure,grant_id,secret,authorize_export,environment,scopes
from .website import TeacherWebsite
from site_sync.admin.asgi import AdminASGI
from site_sync.admin.service import Admin,Actor
from site_sync.adapters.tasks import Tasks
from site_sync.transport.protocol import encode,verify_request,response_headers,MAX_SLICE,MAX_MEDIA
from site_sync.core.authority import AuthorizationError,ConflictError,CredentialRetryError


def install(app,resources,csrf,render,*,shared_middleware=True):
    from backend.app.native.web import payload
    from .credentials_api import install as install_credentials
    install_credentials(app,resources,csrf,shared_middleware=shared_middleware)
    from .control_api import install as install_control
    install_control(app,resources,csrf)
    if shared_middleware:
        from .write_gate import install as install_gate
        install_gate(app,resources)
    @app.get('/admin/site-sync')
    async def page(request:Request):
        r=await resources(request);authorize(r)
        rows=await r.sql.query('SELECT p.origin,p.enabled,c.incoming_auto_scope,c.incoming_auto_delete FROM sync_peers p JOIN sync_connections c ON c.peer_id=p.peer_id WHERE p.peer_id=\'peer\'')
        return await render(r,'sync/page.html','site-sync',title='两站同步',sync_peer=rows[0] if rows else {},sync_modules=descriptions(scopes(r.p)),incoming_scope=json.loads(rows[0]['incoming_auto_scope']) if rows else [])
    @app.post('/api/admin/site-sync/connection')
    async def connection(request:Request):
        r=await resources(request);data=await payload(request,4096);csrf(request,r,data)
        try:return JSONResponse(await configure(r,data))
        except (ValueError,AuthorizationError) as e:raise Error(str(e),400) from None
    @app.post('/api/admin/site-sync/connectivity')
    async def connectivity(request:Request):
        r=await resources(request);authorize(r,'edit')
        data=await payload(request,1024);csrf(request,r,data)
        if data:raise Error('测试使用已保存连接，请勿提交额外参数',400)
        from site_sync.admin.connectivity import probe
        return JSONResponse(await probe(r),headers={'Cache-Control':'no-store'})
    @app.post('/api/admin/site-sync/proposal')
    async def propose(request:Request):
        r=await resources(request);data=await payload(request,2048);csrf(request,r,data)
        from .proposals import send
        try:return JSONResponse(await send(r,data))
        except (AuthorizationError,ConflictError,CredentialRetryError,ValueError) as e:raise Error(str(e),409) from None
    @app.api_route('/admin/site-sync/api/{rest:path}',methods=['GET','POST'])
    async def admin(request:Request,rest:str):
        r=await resources(request);authorize(r,'edit' if request.method=='POST' else 'view')
        async def auth(scope):return Actor(r.p['uid'],grant_id(r.p))
        async def verify(scope,actor):
            try:csrf(request,r,{});return True
            except Error:return False
        service=Admin(Tasks(adapter(r),platform='local' if r.kind=='local' else 'worker'),lambda:int(time.time()),retention_days=int(environment(r,'SYNC_HISTORY_DAYS','90')))
        events=[]
        async def send(event):events.append(event)
        await AdminASGI(service,auth,verify)(request.scope,request.receive,send)
        if not events:return Response(status_code=499)
        wake_intent=rest in ('tasks','schedules') or (rest.startswith('tasks/') and rest.rsplit('/',1)[-1] in ('resume','cancel','confirm','delete'))
        if request.method=='POST' and events[0]['status']==200 and wake_intent:
            from site_sync.integration.worker_schedule import arm
            await arm(r)
        return Response(b''.join(e.get('body',b'') for e in events),status_code=events[0]['status'],headers={k.decode():v.decode() for k,v in events[0]['headers']})
    @app.post('/sync/v1/read')
    async def peer_read(request:Request):
        from .peer_api import peer_read as handle
        return await handle(request,resources)
