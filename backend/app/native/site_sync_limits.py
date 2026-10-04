"""Small immutable sync profiles; importable without DB, web, JS or task modules.

Runtime budgets and protocol-v7 framing ceilings are deliberately separate.
Preferred media widths are negotiated and persisted per file before changing
range offsets or merge keys; the legacy wire ceiling remains unchanged.
"""
from types import MappingProxyType
from contextlib import contextmanager
from contextvars import ContextVar

STANDARD = MappingProxyType({
    'mode':'standard', 'content_rows':5, 'version_rows':20, 'brief_rows':20,
    'page_bytes':64*1024, 'media_chunk_bytes':64*1024,
    'cleanup_batch':4, 'history_batch':20,
    'reference_rows':1, 'dependency_rows':5,
    'steps_per_tick':1, 'maintenance_jobs_per_tick':2,
    'request_interval_ms':1000, 'retry_seconds':(5,15,60),
    'no_progress_retry_limit':8,
})
WORKER = MappingProxyType({
    **STANDARD, 'mode':'ultra_low', 'content_rows':1, 'version_rows':5,
    'brief_rows':1, 'page_bytes':16*1024, 'media_chunk_bytes':16*1024,
    'cleanup_batch':1, 'history_batch':1, 'dependency_rows':1,
    'maintenance_jobs_per_tick':1, 'retry_seconds':(60,180,600),
    'no_progress_retry_limit':30,
})
# Existing wire/task ceilings: unchanged in step 1, not resource measurements.
CONTENT_ROWS=STANDARD['content_rows']
VERSION_ROWS=STANDARD['version_rows']
PAGE_BYTES=STANDARD['page_bytes']
RECORD_BYTES=200000
TOTAL_ROWS=2000
TOTAL_BYTES=4*1024*1024
REQUEST_INTERVAL_MS=STANDARD['request_interval_ms']
MEDIA_CHUNK_BYTES=STANDARD['media_chunk_bytes']
MEDIA_FILE_BYTES=20*1024*1024
MEDIA_TOTAL_BYTES=24*1024*1024
CLEANUP_BATCH=STANDARD['cleanup_batch']
REFERENCE_ROWS=STANDARD['reference_rows']
DEPENDENCY_ROWS=STANDARD['dependency_rows']
# Automatic previews select newest candidates rather than rejecting item 501.
AUTO_PULL_CANDIDATES=500
AUTO_PULL_ORDER=('updated_at DESC','id DESC','module DESC')


def for_kind(kind):
    """Use the existing trusted storage/runtime kind. Unknown kinds stay small."""
    return STANDARD if kind=='local' else WORKER


# Scoped to one leased request and one resource object, never a process-wide mode.
_CURRENT=ContextVar('site_sync_budget',default=None)
MEDIA_WIDTHS=(4096,8192,16384,65536)

def level(work):
    value=work.get('resource_level',0)
    return min(2,max(0,value)) if type(value) is int else 0

def pressured(resource,work,code=None):
    value=level(work)
    if getattr(resource,'kind','local')!='local' and str(code) in ('1101','1102','sync_unconfirmed'):
        value=min(2,value+1)
    return value

@contextmanager
def budget(resource,work):
    token=_CURRENT.set((resource,level(work)))
    try:yield
    finally:_CURRENT.reset(token)

def for_resource(resource=None):
    """A durable task may lower Worker budgets; it never raises wire ceilings."""
    base=for_kind('local' if resource is None else getattr(resource,'kind',None))
    current=_CURRENT.get()
    pressure=current[1] if current and current[0] is resource else 0
    if base is STANDARD or not pressure:return base
    return {**base,'version_rows':2 if pressure==1 else 1,
            'media_chunk_bytes':8192 if pressure==1 else 4096,
            'request_interval_ms':5000 if pressure==1 else 15000}



def capped_rows(value,local_limit):
    """Ignore malformed peer hints; valid positive hints may only lower a budget."""
    return min(local_limit,value) if type(value) is int and value>0 else local_limit
