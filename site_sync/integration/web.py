"""Existing admin session/CSRF plus a signed read-only peer endpoint."""
import json,time
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


def install(app,resources,csrf,render):
    from backend.app.native.web import payload
    from .credentials_api import install as install_credentials
    install_credentials(app,resources,csrf)
    @app.get('/admin/site-sync')
    async def page(request:Request):
        r=await resources(request);authorize(r)
        rows=await r.sql.query('SELECT p.origin,p.enabled,c.incoming_auto_scope,c.incoming_auto_delete FROM sync_peers p JOIN sync_connections c ON c.peer_id=p.peer_id WHERE p.peer_id=\'peer\'')
        return await render(r,'sync/page.html','site-sync',title='两站同步',sync_peer=rows[0] if rows else {},sync_modules=scopes(r.p),incoming_scope=json.loads(rows[0]['incoming_auto_scope']) if rows else [])
    @app.post('/api/admin/site-sync/connection')
    async def connection(request:Request):
        r=await resources(request);data=await payload(request,4096);csrf(request,r,data)
        try:return JSONResponse(await configure(r,data))
        except (ValueError,AuthorizationError) as e:raise Error(str(e),400) from None
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
        return Response(b''.join(e.get('body',b'') for e in events),status_code=events[0]['status'],headers={k.decode():v.decode() for k,v in events[0]['headers']})
    @app.post('/sync/v1/read')
    async def peer_read(request:Request):
        r=await resources(request)
        try:
            data=bytearray()
            async for b in request.stream():
                if len(data)+len(b)>2048:raise ValueError('Control bound')
                data.extend(b)
            key=await secret(r);nonce=verify_request(key,request.headers,bytes(data));q=json.loads(data)
            if not isinstance(q,dict):raise ValueError('Invalid request')
            db=adapter(r);source=TeacherWebsite(db,r)
            if q.get('kind')=='proposal':
                from .proposals import receive
                body=encode(await receive(r,q));meta={'version':'proposal-v1'}
            elif q.get('kind')=='candidates':
                allowed=await authorize_export(r)
                if not isinstance(q.get('scope'),list) or not set(q['scope'])<=allowed or q.get('version')!='catalog-v1':raise AuthorizationError('Export scope denied')
                body=encode(await source.source_candidates(q));meta={'version':'catalog-v1'}
            else:
                if any(not isinstance(q.get(k),str) or not 0<len(q[k])<=256 for k in ('module','record','version')):raise ValueError('Identity bound')
                await authorize_export(r,q['module'])
                from .catalog import RELATIONS
                for dep in set(RELATIONS.get(q['module'],{}).values()):await authorize_export(r,dep)
                if q.get('kind')=='manifest':
                    body=encode(await source.source_read(q));meta={'version':q['version']}
                else:
                    offset,length=q.get('offset'),q.get('length')
                    if type(offset)!=int or offset<0 or type(length)!=int or not 0<length<=(5*1024*1024 if q['kind']=='media' else MAX_SLICE):raise ValueError('Range bound')
                    if q['kind']=='media':
                        if r.kind!='local':raise ConflictError('Native stream binding required')
                        if q.get('record_version') and q.get('snapshot_hash'):
                            await source.snapshot(dict(q,kind='manifest',version=q['record_version']))
                        rows=await db.query("SELECT json_extract(f.value,'$.object_key') object_key,json_extract(f.value,'$.size') size FROM sync_exports e,json_each(e.files_json) f WHERE e.module=? AND e.record_id=? AND e.request_id=? AND json_extract(f.value,'$.id')=? AND json_extract(f.value,'$.version')=? LIMIT 1",(q['module'],q['record'],q.get('task',''),q.get('file'),q['version']))
                        if not rows or type(q.get('total'))!=int or not 0<q['total']<=MAX_MEDIA or rows[0]['size']!=q['total'] or offset+length>q['total']:raise ConflictError('Media changed')
                        current=await db.query('SELECT object_key,size FROM media_assets WHERE uid=? AND updated_at=? AND status=\'active\'',(q['file'],q['version']))
                        if not current or current[0]!=rows[0]:raise ConflictError('Media changed')
                        from backend.app.native.media_inventory_store import inventory
                        from backend.app.native.media_response import LocalMediaResponse
                        from starlette.concurrency import run_in_threadpool
                        handle,info,prefix=await run_in_threadpool(inventory(r.media_store).open_reader,rows[0]['object_key'])
                        if info['size']!=q['total']:handle.close();raise ConflictError('Media size changed')
                        meta={'version':q['version'],'offset':offset,'length':length,'total':q['total']}
                        return LocalMediaResponse(handle,offset,length,headers=response_headers(key,nonce,200,meta,stream=True))
                    body=await source.source_read(q)
                    if len(body)!=length:raise ConflictError('Truncated slice')
                    meta={'version':q['version'],'offset':offset}
            return Response(body,headers=response_headers(key,nonce,200,meta,body))
        except AuthorizationError:return Response(status_code=403)
        except (ValueError,TypeError,KeyError,ConflictError):return Response(status_code=409)
