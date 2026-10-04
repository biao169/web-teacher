"""Small immutable sync profiles; importable without DB, web, JS or task modules.

Runtime budgets and protocol-v7 framing ceilings are deliberately separate.
Preferred media widths are negotiated and persisted per file before changing
range offsets or merge keys; the legacy wire ceiling remains unchanged.
"""
from types import MappingProxyType

STANDARD = MappingProxyType({
    'mode':'standard', 'content_rows':5, 'version_rows':20, 'brief_rows':20,
    'page_bytes':64*1024, 'media_chunk_bytes':64*1024,
    'cleanup_batch':4, 'history_batch':20,
    'reference_rows':1, 'dependency_rows':5,
    'steps_per_tick':1, 'maintenance_jobs_per_tick':2,
    'request_interval_ms':1000, 'retry_seconds':(5,15,60),
})
WORKER = MappingProxyType({
    **STANDARD, 'mode':'ultra_low', 'content_rows':1, 'version_rows':5,
    'brief_rows':1, 'page_bytes':16*1024, 'media_chunk_bytes':16*1024,
    'cleanup_batch':1, 'history_batch':1, 'dependency_rows':1,
    'maintenance_jobs_per_tick':1, 'retry_seconds':(60,180,600),
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


def for_resource(resource=None):
    """No mutable process-wide mode: mixed adapters in one process stay isolated."""
    return for_kind('local' if resource is None else getattr(resource,'kind',None))


def capped_rows(value,local_limit):
    """Ignore malformed peer hints; valid positive hints may only lower a budget."""
    return min(local_limit,value) if type(value) is int and value>0 else local_limit
