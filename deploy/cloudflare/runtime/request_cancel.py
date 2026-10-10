"""Conservative HTTP cancellation classification; no task/state mutations."""
import asyncio

def aborted(request):
    return bool(getattr(getattr(request,'signal',None),'aborted',False))

def client_cancelled(request,exc):
    if not aborted(request):return False
    if isinstance(exc,asyncio.CancelledError):return True
    # Pyodide may wrap a DOMException; never classify by message substring.
    for value in (exc,getattr(exc,'js_error',None)):
        if value is not None and (getattr(value,'name',None)=='AbortError' or type(value).__name__=='AbortError'):return True
    return False

def cancelled_response():
    from workers import Response
    from site_sync.core.trace import current,record
    trace=current().get('request_id') or ''
    record('HTTP-CANCELLED',http_status=499,error_category='cancelled',application_outcome='cancelled',retryable=False)
    return Response('',status=499,headers={'cache-control':'no-store','cloudflare-cdn-cache-control':'no-store','x-request-id':trace,'x-error-code':'CLIENT_CANCELLED'})
