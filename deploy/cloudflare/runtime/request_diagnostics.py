"""Small request envelopes; cf metadata is observed, never inferred from origin."""
import re,time
from functools import wraps
from backend.app.ports.operations import request_context,stage as operation_stage
from site_sync.core.trace import current,scope,invocation,record,category
from site_sync.core.journal import failure

def field(obj,name,pattern):
    value=obj.get(name) if isinstance(obj,dict) else getattr(obj,name,None)
    return value if isinstance(value,str) and re.fullmatch(pattern,value) else None

def traced(component,http=False):
    def decorate(fn):
        @wraps(fn)
        async def wrapped(self,*args,**kwargs):
            data=invocation(component,str(getattr(self.env,'TEACHER_SYNC_EXECUTOR_MODE','inline')),fn.__name__)
            if http:
                request=args[0];cf=getattr(request,'cf',None)
                from urllib.parse import urlsplit
                path=urlsplit(str(request.url)).path
                data.update(colo_source='request.cf',colo=field(cf,'colo','[A-Z]{3}'),country=field(cf,'country','[A-Z0-9]{2}'),ray_id=field({'ray':request.headers.get('cf-ray')},'ray','[a-fA-F0-9]{8,32}-[A-Z]{3}'),method=str(getattr(request,'method','GET'))[:12],route='sync-peer' if path=='/sync/v1/read' else 'sync-admin' if path.startswith(('/admin/site-sync','/api/admin/site-sync')) else 'admin' if path.startswith('/admin') else 'public')
            if http and data.get('route')=='sync-peer':
                data['peer_request_id']=field({'nonce':request.headers.get('x-sync-nonce')},'nonce','[a-f0-9]{32}')
                data['peer_request_id_verified']=False # Correlation only; signature validation is downstream.
            start=time.monotonic();status=None
            with scope(**data),request_context(**data):
                if not http or data.get('route')=='sync-peer':record('INVOCATION-START')
                try:
                    with operation_stage('http-handler' if http else 'executor-handler'):
                        result=await fn(self,*args,**kwargs)
                    if http:
                        # SDK service bindings return workers.Response, ASGI returns js.Response.
                        # ResponseInit must receive the native object (not HTTPMessage/PyProxy headers).
                        result=getattr(result,'js_object',result)
                        status=int(result.status)
                        if status!=101 and hasattr(result,'headers'):
                            from js import Response
                            with operation_stage('response-wrap'):
                                result=Response.new(result.body,result)
                                result.headers.set('x-request-id',data['request_id'])
                                result.headers.set('x-teacher-release','0.16.048')
                    record('INVOCATION-END',http_status=status,finished_at=time.time(),duration_ms=round((time.monotonic()-start)*1000,2),application_outcome='returned')
                    return result
                except BaseException as exc:
                    record('INVOCATION-ERROR',finished_at=time.time(),duration_ms=round((time.monotonic()-start)*1000,2),error_type=type(exc).__name__,diagnostic=failure(exc),**category(exc))
                    raise
        return wrapped
    return decorate
