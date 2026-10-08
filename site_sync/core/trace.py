"""Invocation-local diagnostics. Tokens always reset; never persist payloads here."""
from contextvars import ContextVar
from contextlib import contextmanager
import secrets,time,json,re
_current=ContextVar('sync_diagnostic_context',default=None)
def current():return dict(_current.get() or {})
@contextmanager
def scope(**values):
    data=current();data.update(values)
    token=_current.set(data)
    try:yield data
    finally:_current.reset(token)
def annotate(**values):
    if _current.get() is not None:
        data=current();data.update(values);_current.set(data)
def invocation(component,executor_mode='unknown',trigger='tick'):
    return dict(request_id=secrets.token_hex(16),component=component,executor_mode=executor_mode,trigger=trigger,started_at=time.time(),colo=None,country=None,colo_source=None,execution_colo=None,ray_id=None,platform_outcome=None,cpu_time_ms=None)
def record(stage,**values):
    from .diagnostics import RELEASE
    value=current();value.update(values)
    print(json.dumps(dict(value,stage=stage,release=RELEASE),ensure_ascii=True,separators=(',',':')),flush=True)
def category(exc):
    chain=[];cause=exc
    for _ in range(4):
        if cause is None:break
        chain.append(cause);cause=cause.__cause__
    outcome=next((getattr(x,'platform_outcome',None) for x in chain if getattr(x,'evidence_source',None)=='cloudflare-telemetry' and getattr(x,'platform_outcome',None) in ('exceededCpu','exceededMemory','exception','ok')),None)
    resource='cpu' if outcome=='exceededCpu' else 'memory' if outcome=='exceededMemory' else None
    if resource:kind='resource'
    elif any(getattr(x,'platform_code',None)==1102 for x in chain):kind='resource';resource='unknown'
    elif any(type(x).__name__=='CredentialRetryError' for x in chain):kind='credential'
    elif any(type(x).__name__=='JSONDecodeError' for x in chain):kind='json'
    elif any(getattr(x,'d1_diagnostic',None) or getattr(x,'code',None) in ('SYNC_SCHEMA_MISSING','SYNC_STORAGE_FAILED') or type(x).__name__ in ('OperationalError','DatabaseError','IntegrityError') for x in chain):kind='database'
    elif any(type(x).__name__ in ('AuthorizationError','ConflictError') for x in chain):kind='authorization' if any(type(x).__name__=='AuthorizationError' for x in chain) else 'state'
    elif any(getattr(x,'http_status',None) for x in chain):kind='http'
    elif any(isinstance(x,(TimeoutError,ConnectionError)) or getattr(x,'code',None) in ('NETWORK_REQUEST_FAILED','REQUEST_TIMEOUT','STREAM_READ_FAILED') for x in chain):kind='network'
    elif any(type(x).__name__=='ResourceError' for x in chain):kind='resource';resource='unknown'
    else:kind='exception'
    return dict(error_category=kind,resource_kind=resource,platform_outcome=outcome,evidence_source='cloudflare-telemetry' if outcome else 'captured_context',cpu_time_ms=None)

@contextmanager
def step(name):
    """Keep the failing substep in the invocation context; no payload logging."""
    annotate(sub_stage=name,d1_operation=None,sql_type=None)
    started=time.monotonic();record('SYNC-SUBSTEP-START')
    try:yield
    except Exception as exc:
        annotate(duration_ms=round((time.monotonic()-started)*1000,2))
        record('SYNC-SUBSTEP-ERROR',error_type=type(exc).__name__,error_message=getattr(exc,'d1_diagnostic',{}).get('message','See typed exception and source location'))
        raise
    else:
        annotate(duration_ms=round((time.monotonic()-started)*1000,2))
        record('SYNC-SUBSTEP-END')
