"""Database-free Admin failure boundary; never retries requests or reads bodies."""
import asyncio,json,secrets,html
from urllib.parse import urlsplit
from worker_runtime.diagnostics import emit,failure
from worker_runtime.request_cancel import aborted,client_cancelled,cancelled_response
from site_sync.core.trace import current

def response(request,trace):
    from workers import Response
    headers={'cache-control':'no-store','cloudflare-cdn-cache-control':'no-store','retry-after':'2','x-request-id':trace,'x-admin-recovery':'1','x-error-code':'ADMIN_UNAVAILABLE','x-content-type-options':'nosniff'}
    path=urlsplit(str(request.url)).path
    incoming=getattr(request,'headers',{})
    document=(getattr(request,'method','GET') in ('GET','HEAD') and path.startswith(('/admin','/auth','/setup')) and '/api/' not in path and incoming.get('x-native-list')!='1' and 'application/json' not in str(incoming.get('accept') or ''))
    if document:
        headers['content-type']='text/html; charset=utf-8'
        headers['content-security-policy']="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
        body='<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>后台暂时不可用</title><main style="max-width:40rem;margin:12vh auto;padding:2rem;font-family:system-ui;line-height:1.7"><h1>后台暂时未能加载</h1><p>请稍后重新打开页面。若刚才提交了修改，请先核对保存结果，不要重复提交。</p><p>Admin temporarily unavailable. Please check saved changes before retrying.</p><p><a href="'+html.escape(path,quote=True)+'">重新打开页面 / Reload</a></p><small>追踪 ID：'+html.escape(trace)+'</small></main></html>'
    else:
        headers['content-type']='application/json; charset=utf-8'
        body=json.dumps({'error':'后台服务暂时不可用；提交操作请先核对结果','code':'ADMIN_UNAVAILABLE','request_id':trace})
    return Response('' if getattr(request,'method','GET')=='HEAD' else body,status=503,headers=headers)

async def run(request,invoke,stage):
    trace=current().get('request_id') or secrets.token_hex(16)
    headers=getattr(request,'headers',{})
    context={'request_id':trace,'path':urlsplit(str(request.url)).path,'ray_id':headers.get('cf-ray'),'code':'ADMIN_UNAVAILABLE'}
    if getattr(request,'method','GET') in ('GET','HEAD') and aborted(request):return cancelled_response()
    try:
        result=await invoke()
        if int(result.status) not in (500,502,503,504):return result
        emit(stage,'ERROR',admin_status=int(result.status),upstream_request_id=result.headers.get('x-request-id'),**context)
        body=getattr(result,'body',None)
        if body is not None and not getattr(body,'locked',False):
            try:await asyncio.wait_for(body.cancel(),1)
            except Exception as exc:emit('ADMIN-BODY-CANCEL','ERROR',exceptions=failure(exc),**context)
    except asyncio.CancelledError:
        emit(stage,'CANCELLED',request_id=trace,path=context['path'])
        return cancelled_response()
    except Exception as exc:
        if client_cancelled(request,exc):return cancelled_response()
        emit(stage,'ERROR',error_type=type(exc).__name__,exceptions=failure(exc),**context)
    return response(request,trace)

async def forward(binding,request):
    # Public identity endpoints retain their existing cancellation behavior.
    if urlsplit(str(request.url)).path.startswith('/api/public/'):
        return await binding.fetch(request)
    from js import Request,AbortController,Object
    from pyodide.ffi import to_js
    controller=AbortController.new()
    detached=Request.new(getattr(request,'js_object',request),to_js({'signal':controller.signal},dict_converter=Object.fromEntries))
    # Native request copy shares the body stream; no body buffering or replay.
    return await binding.fetch(detached)
