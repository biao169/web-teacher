"""Signed peer endpoint, independent of website application construction."""
import json,time,secrets
from starlette.requests import Request
from starlette.responses import Response
from site_sync.core.diagnostics import RELEASE,coded,classify
from site_sync.core.journal import failure
from site_sync.core.authority import AuthorizationError,ConflictError
from site_sync.transport.protocol import encode,verify_request,response_headers,MAX_SLICE,MAX_MEDIA
from .host import adapter,secret,authorize_export
from .website import TeacherWebsite

async def peer_read(request,resources):
    trace=secrets.token_hex(16);stage='resources'
    nonce=request.headers.get('x-sync-nonce','')
    if __import__('re').fullmatch('[a-f0-9]{32}',nonce):trace=nonce
    try:
        r=await resources(request)
        stage='admission'
        from .control import stopped
        if await stopped(r):return Response(status_code=503,headers={'cache-control':'no-store','retry-after':'60','x-sync-error':'SYNC_PAUSED','x-sync-trace':trace,'x-sync-stage':stage,'x-sync-component':'peer-site','x-sync-release':RELEASE})
        stage='request_body'
        data=bytearray()
        async for b in request.stream():
            if len(data)+len(b)>2048:raise ValueError('Control bound')
            data.extend(b)
        stage='credential_read';key=await secret(r)
        stage='request_verify';nonce=verify_request(key,request.headers,bytes(data));q=json.loads(data)
        if not isinstance(q,dict):raise ValueError('Invalid request')
        db=adapter(r);source=TeacherWebsite(db,r);stage='export_authorization'
        if q.get('kind')=='probe':
            allowed=await authorize_export(r);selection=q.get('scope')
            if not isinstance(selection,list) or not selection or any(not isinstance(x,str) for x in selection):raise coded(ValueError(),'SYNC_SCOPE_INVALID')
            if not set(selection)<=allowed:raise coded(AuthorizationError(),'SYNC_SCOPE_DENIED')
            body=encode({'ok':True,'release':RELEASE,'protocol':'probe-v1'});meta={'version':'probe-v1'}
        elif q.get('kind')=='proposal':
            from .proposals import receive
            body=encode(await receive(r,q));meta={'version':'proposal-v1'}
        elif q.get('kind')=='clone_check':
            from site_sync.core.selection import is_restore
            selection=q.get('scope',['site_clone'])
            if not is_restore(selection):raise AuthorizationError('Invalid restore scope')
            for module in selection:await authorize_export(r,module)
            from .clone import check_source
            body=encode(await check_source(source,q));meta={'version':'catalog-v1'}
        elif q.get('kind')=='candidates':
            allowed=await authorize_export(r)
            if not isinstance(q.get('scope'),list) or not set(q['scope'])<=allowed or q.get('version')!='catalog-v1':raise coded(AuthorizationError('Export scope denied'),'SYNC_SCOPE_DENIED')
            stage='candidates_query'
            body=encode(await source.source_candidates(q));meta={'version':'catalog-v1'}
        else:
            if any(not isinstance(q.get(k),str) or not 0<len(q[k])<=256 for k in ('module','record','version')):raise ValueError('Identity bound')
            await authorize_export(r,q['module'])
            if q['record'].startswith('00meta-'):
                from site_sync.core.selection import meta_scope
                for module in meta_scope(q['record']):await authorize_export(r,module)
            from .catalog import RELATIONS
            for dep in set(RELATIONS.get(q['module'],{}).values()):await authorize_export(r,dep)
            if q.get('kind')=='manifest':
                stage='manifest_read'
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
                    current=await db.query('SELECT object_key,size FROM media_assets WHERE uid=? AND updated_at=? AND (status=\'active\' OR ? IN (\'site_clone\',\'restore_media_assets\'))',(q['file'],q['version'],q['module']))
                    if not current or current[0]!=rows[0]:raise ConflictError('Media changed')
                    from backend.app.native.media_inventory_store import inventory
                    from backend.app.native.media_response import LocalMediaResponse
                    from starlette.concurrency import run_in_threadpool
                    handle,info,prefix=await run_in_threadpool(inventory(r.media_store).open_reader,rows[0]['object_key'])
                    if info['size']!=q['total']:handle.close();raise ConflictError('Media size changed')
                    meta={'version':q['version'],'offset':offset,'length':length,'total':q['total']}
                    return LocalMediaResponse(handle,offset,length,headers=response_headers(key,nonce,200,meta,stream=True))
                stage='slice_read'
                body=await source.source_read(q)
                if len(body)!=length:raise ConflictError('Truncated slice')
                meta={'version':q['version'],'offset':offset}
        if q.get('kind')=='proposal':
            from site_sync.integration.worker_schedule import arm
            await arm(r)
        return Response(body,headers=response_headers(key,nonce,200,meta,body))
    except Exception as exc:
        fallback='SYNC_RESOURCE_FAILED' if stage=='resources' else 'SYNC_SOURCE_CONFLICT' if isinstance(exc,ConflictError) else 'SYNC_REQUEST_INVALID' if isinstance(exc,(ValueError,TypeError,KeyError)) else 'SYNC_SOURCE_FAILED'
        code=classify(exc,fallback)
        status=403 if isinstance(exc,AuthorizationError) else 409 if isinstance(exc,(ValueError,TypeError,KeyError,ConflictError)) else 500
        print(json.dumps({'component':'peer-site','release':RELEASE,'stage':stage,'request_id':trace,'code':code,'diagnostic':failure(exc),'context':__import__('site_sync.core.trace',fromlist=['current']).current()},ensure_ascii=True),flush=True)
        return Response(status_code=status,headers={'cache-control':'no-store','x-sync-error':code,'x-sync-trace':trace,'x-sync-stage':stage,'x-sync-component':'peer-site','x-sync-release':RELEASE})
