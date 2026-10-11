"""Public-only exception boundary; no app, database or task initialization."""
from urllib.parse import urlsplit,parse_qs

RECOVERABLE={500,502,503,504}
PUBLIC_TABLES={'profiles','students','research_interests','projects','publications','patents','courses','news'}

def eligible(request):
    if str(getattr(request,'method','GET')) not in ('GET','HEAD'):return False
    if request.headers.get('x-public-fragment')=='1':return False
    if 'application/json' in str(request.headers.get('accept') or ''):return False
    url=urlsplit(str(request.url));parts=url.path.strip('/').split('/')
    if parts[0] not in ('en','zh'):return False
    if len(url.query)>32768:return False
    try:query=parse_qs(url.query,keep_blank_values=True,max_num_fields=40)
    except ValueError:return False
    if 'nav' in query or 'nv' in query:return False
    # News details may contain comment forms. Without DB access, fail closed;
    # the app-level boundary can recover those already confirmed form-free.
    return len(parts)==1 or (len(parts)==2 and parts[1] in PUBLIC_TABLES) or (len(parts)==3 and parts[1] in ('profiles','courses'))

def recovery_response(request,trace):
    from types import SimpleNamespace
    from starlette.datastructures import QueryParams
    from backend.app.native.public_recovery import response
    from workers import Response
    url=urlsplit(str(request.url))
    adapted=SimpleNamespace(url=url,query_params=QueryParams(url.query),state=SimpleNamespace(request_id=trace),method=str(request.method))
    result=response(adapted)
    return Response(result.body.decode('utf-8'),status=result.status_code,headers=dict(result.headers))

async def run(request,invoke,trace,ray):
    from worker_runtime.diagnostics import emit,failure
    from worker_runtime.request_cancel import aborted,client_cancelled,cancelled_response
    if aborted(request):return cancelled_response()
    context={'component':'main-site','request_id':trace,'ray_id':ray,'path':urlsplit(str(request.url)).path,'phase':'public-dispatch'}
    try:
        result=await invoke()
        status=int(result.status)
        already_recovering=result.headers.get('x-public-recovery')=='1'
    except Exception as exc:
        if client_cancelled(request,exc):return cancelled_response()
        emit('PUBLIC-RECOVERY','ERROR',error_type=type(exc).__name__,exceptions=failure(exc),**context)
        return recovery_response(request,trace)
    # Do not replace an application-generated recovery page or any other status.
    if status not in RECOVERABLE or already_recovering:return result
    emit('PUBLIC-RECOVERY','ERROR',http_status=status,**context)
    await discard(result,context)
    return recovery_response(request,trace)

async def discard(result,context):
    from worker_runtime.diagnostics import emit,failure
    import asyncio
    try:
        body=getattr(result,'body',None)
        if body is not None and not getattr(body,'locked',False):
            await asyncio.wait_for(body.cancel(),1)
    except Exception as exc:
        emit('PUBLIC-RECOVERY-CLEANUP','ERROR',exceptions=failure(exc),**context)
