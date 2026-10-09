"""Bounded request-local phase diagnostics; no payloads, credentials or task execution."""
import json,secrets,time,traceback
from contextvars import ContextVar
from contextlib import contextmanager
from functools import wraps
_context=ContextVar('operation_trace',default=None)
FIELDS=('request_id','ray_id','colo','country','executor_mode','component','route','method','task_id')

def current():return dict(_context.get() or {})
@contextmanager
def request_context(**values):
    token=_context.set({k:values[k] for k in FIELDS if k in values})
    try:yield
    finally:_context.reset(token)

def emit(event,**values):
    print(json.dumps(dict(current(),release='0.16.054',event=event,**values),ensure_ascii=True,separators=(',',':')),flush=True)

def error(exc):
    frames=[]
    for f in traceback.extract_tb(exc.__traceback__)[-6:]:
        path=f.filename.replace('\\','/')
        for part in ('backend/','site_sync/','worker_runtime/'):
            if part in path:
                frames.append({'file':part+path.split(part,1)[1],'function':f.name[:80],'line':f.lineno});break
    # Raw exception messages may contain SQL parameters, object names or secrets.
    return {'error_type':type(exc).__name__[:80],'frames':frames,'http_status':getattr(exc,'status',None) if type(getattr(exc,'status',None))==int else None}

@contextmanager
def stage(name,**values):
    started=time.monotonic();emit('OPERATION-START',stage=name,**values)
    try:yield
    except BaseException as exc:
        emit('OPERATION-ERROR',stage=name,duration_ms=round((time.monotonic()-started)*1000,2),**values,**error(exc))
        raise
    else:emit('OPERATION-END',stage=name,duration_ms=round((time.monotonic()-started)*1000,2),**values)

def operation(name):
    def decorate(fn):
        @wraps(fn)
        async def call(*args,**kwargs):
            context=current() or {'request_id':secrets.token_hex(16),'component':'website-local'}
            with request_context(**context),stage(name):return await fn(*args,**kwargs)
        return call
    return decorate
