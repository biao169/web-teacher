"""Existing admin session/CSRF plus a signed read-only peer endpoint."""
import json,time,secrets
from site_sync.core.diagnostics import RELEASE,coded,classify,CODES
from site_sync.core.journal import failure
from site_sync.core.selection import descriptions,RESTORE_SCOPES,normalize
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
        sections={'tasks':'任务监控','create':'创建任务','schedules':'定时计划','connection':'连接与授权','settings':'执行参数'}
        section=request.query_params.get('section','tasks')
        if section not in sections:raise Error('同步页面不存在',404)
        rows=await r.sql.query('SELECT p.origin,p.enabled,c.incoming_auto_scope,c.incoming_auto_delete FROM sync_peers p JOIN sync_connections c ON c.peer_id=p.peer_id WHERE p.peer_id=\'peer\'')
        details=descriptions(RESTORE_SCOPES);allowed=set(scopes(r.p))
        for name,d in details.items():d['enabled']=set(normalize([name]))<=allowed
        return await render(r,'sync/page.html','site-sync',title='两站同步',sync_section=section,sync_sections=sections,sync_peer=rows[0] if rows else {},sync_modules=details,incoming_scope=json.loads(rows[0]['incoming_auto_scope']) if rows else [])
    @app.post('/api/admin/site-sync/connection')
    async def connection(request:Request):
        r=await resources(request);data=await payload(request,4096);csrf(request,r,data)
        try:return JSONResponse(await configure(r,data))
        except (ValueError,AuthorizationError) as e:raise Error(str(e),400) from None
    @app.post('/api/admin/site-sync/authorization/refresh')
    async def refresh_authorization(request:Request):
        r=await resources(request);data=await payload(request,1024);csrf(request,r,data)
        authorize(r,'edit')
        if data:raise Error('更新授权不接受自定义范围',400)
        from .host import refresh_scopes
        try:return JSONResponse(await refresh_scopes(r),headers={'Cache-Control':'no-store'})
        except AuthorizationError as exc:raise Error(str(exc),403) from None
    @app.post('/api/admin/site-sync/connectivity')
    async def connectivity(request:Request):
        r=await resources(request);authorize(r,'edit')
        data=await payload(request,1024);csrf(request,r,data)
        if data:raise Error('测试使用已保存连接，请勿提交额外参数',400)
        from site_sync.admin.connectivity import probe
        return JSONResponse(await probe(r),headers={'Cache-Control':'no-store'})
    @app.get('/api/admin/site-sync/proposals')
    async def outgoing_proposals(request:Request):
        r=await resources(request);authorize(r)
        from .outgoing import listing
        return JSONResponse(await listing(r),headers={'Cache-Control':'no-store'})
    @app.post('/api/admin/site-sync/proposal')
    async def propose(request:Request):
        r=await resources(request);data=await payload(request,2048);csrf(request,r,data)
        authorize(r,'edit')
        from .proposals import send
        from backend.app.ports.operations import operation,current,emit
        @operation('sync-proposal-send')
        async def submit():
            try:
                result=await send(r,data)
                return JSONResponse(dict(result,request_id=current().get('request_id'),proposal_request_id=data['request_id']),headers={'Cache-Control':'no-store'})
            except Exception as exc:
                from .capabilities import PreflightError
                if isinstance(exc,PreflightError):
                    return JSONResponse(dict(exc.payload(),request_id=current().get('request_id')),status_code=exc.status,headers={'Cache-Control':'no-store'})
                diagnostic=failure(exc);code=next((c['code'] for c in diagnostic.get('causes',[]) if c.get('code') in CODES),classify(exc,'SYNC_SCOPE_DENIED' if isinstance(exc,AuthorizationError) else 'SYNC_REQUEST_INVALID' if isinstance(exc,ValueError) else 'SYNC_PROPOSAL_FAILED'))
                emit('SYNC-PROPOSAL-ERROR',stage='proposal-send',diagnostic=diagnostic)
                status=403 if isinstance(exc,AuthorizationError) else 409 if isinstance(exc,(ConflictError,ValueError)) else 503
                return JSONResponse({'error':CODES[code],'code':code,'request_id':current().get('request_id'),'diagnostic':diagnostic,'retry_same_request':True},status_code=status,headers={'Cache-Control':'no-store'})
        return await submit()
    @app.api_route('/admin/site-sync/api/{rest:path}',methods=['GET','POST'])
    async def admin(request:Request,rest:str):
        r=await resources(request);authorize(r,'edit' if request.method=='POST' else 'view')
        async def auth(scope):return Actor(r.p['uid'],grant_id(r.p))
        async def verify(scope,actor):
            try:csrf(request,r,{});return True
            except Error:return False
        from .capabilities import preflight
        async def check_peer(peer_id,scope):return await preflight(r,peer_id,scope)
        service=Admin(Tasks(adapter(r),platform='local' if r.kind=='local' else 'worker'),lambda:int(time.time()),retention_days=int(environment(r,'SYNC_HISTORY_DAYS','90')),catalog=RESTORE_SCOPES,principal_scopes=scopes(r.p),preflight=check_peer)
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
