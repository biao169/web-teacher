"""Keep raw upload streams out of the ASGI Python receive path."""
from urllib.parse import urlsplit
from backend.app.ports.upload_stream import PATHS,bind
async def dispatch_upload(application,request,env,ctx,fetch,dispatch):
    if str(getattr(request,'method','GET'))!='POST' or urlsplit(str(request.url)).path not in PATHS:
        return await dispatch(application,request,env,ctx,fetch)
    from js import Request,Headers,Object
    from pyodide.ffi import to_js
    headers=Headers.new(request.headers)
    headers.delete('content-length');headers.delete('transfer-encoding')
    # Same URL/cookies/origin/CSRF headers; only the opaque body stays with native RPC.
    envelope=Request.new(str(request.url),to_js({'method':'POST','headers':headers},dict_converter=Object.fromEntries))
    try:
        with bind(request,getattr(env,'SYNC_NATIVE',None)):
            return await fetch(application,envelope,env,ctx)
    finally:
        # On denied authentication/CSRF/quota the RPC never acquired the stream.
        body=request.body
        if body is not None and not body.locked:
            try:await body.cancel()
            except Exception as exc:
                from backend.app.ports.operations import emit,error
                emit('MEDIA-CANCEL-FAILED',stage='media-cancel',**error(exc))
