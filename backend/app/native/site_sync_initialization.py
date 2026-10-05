"""Bounded, context-local background initialization timeline; standard library only.

Persist the next stage BEFORE entering it. Its transition closes the preceding
stage in the same CAS write; forced termination leaves a useful running marker.
Durations are wall time (including I/O), never a measurement of Worker CPU/memory.
"""
import time
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime,timezone

_CURRENT=ContextVar('sync_initialization',default=None)
STAGES=('latest_gate','latest_modules','latest_resources','receipt_reconcile','resource_modules','schedule_modules','resource_factory',
        'dispatch','authorization','execution_lease','business_step','receipt_save')
MAX_STAGES=12

def stamp():return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')

class Superseded(Exception):
    """The diagnostic receipt is no longer owned by this scheduler invocation."""

class Unavailable(Exception):
    """Diagnostic persistence failed; leave task/grant retry decisions untouched."""


def previous(value):
    rows=value.get('stages',[])
    completed=[row for row in rows if 'elapsed_ms' in row]
    return {'status':value.get('status'),'elapsed_ms':value.get('elapsed_ms'),
            'last_stage':rows[-1] if rows else None,
            'slowest_stage':max(completed,key=lambda row:row['elapsed_ms']) if completed else None}

class Timeline:
    def __init__(self,receipt):
        self.value={'version':1,'stages':[],'record_write_ms':0}
        receipt['initialization']=self.value
        self.started=time.monotonic();self.phase_started=self.started
    def ready(self):
        # Start measuring work only after its durable stage marker was acknowledged.
        self.phase_started=time.monotonic()
    def close(self,status='completed'):
        rows=self.value['stages']
        if rows and rows[-1]['status']=='running':
            rows[-1].update(status=status,finished_at=stamp(),elapsed_ms=round(max(0,time.monotonic()-self.phase_started)*1000,2))
    def begin(self,name,*,cached=None):
        if name not in STAGES:raise ValueError('Unknown initialization stage')
        rows=self.value['stages']
        if rows and rows[-1]['phase']==name and rows[-1]['status']=='running':return False
        if len(rows)>=MAX_STAGES:return False
        self.close();self.phase_started=time.monotonic()
        row={'phase':name,'status':'running','started_at':stamp()}
        if type(cached) is bool:row['module_cached']=cached
        rows.append(row);return True
    def fail(self,exc):
        self.close('failed')
        if self.value['stages']:
            self.value['stages'][-1]['exception_type']=type(exc).__name__[:80]
    def finish(self,status):
        self.close('failed' if status=='paused' else 'completed')
        self.value.update(status=status,elapsed_ms=round(max(0,time.monotonic()-self.started)*1000,2))

@contextmanager
def recording(timeline,save):
    token=_CURRENT.set((timeline,save))
    try:yield
    finally:_CURRENT.reset(token)

async def advance(name,*,cached=None):
    context=_CURRENT.get()
    if context is None:return
    timeline,save=context
    if not timeline.begin(name,cached=cached):return
    started=time.monotonic()
    try:saved=await save()
    except Exception as exc:raise Unavailable() from exc
    if not saved:raise Superseded()
    timeline.value['record_write_ms']=round(timeline.value['record_write_ms']+max(0,time.monotonic()-started)*1000,2)
    timeline.ready()

def failed(exc):
    context=_CURRENT.get()
    if context is not None:context[0].fail(exc)
