"""Bounded deployment defaults, persisted site policy and sparse task overrides."""
import json,re
KEY='sync:execution-settings'
MIN_SLICE=4096
MAX_SLICE=4*1024*1024
FIELDS=('fast_retries','slice_bytes','min_slice_bytes','slow_retry_seconds','auto_shrink')
def size(value):
    if isinstance(value,str):
        m=re.fullmatch(r'\s*(\d+)\s*(b|k|kib|kb|m|mib|mb)?\s*',value,re.I)
        if not m:raise ValueError('Use bytes, KiB or MiB')
        value=int(m[1])*({'k':1024,'kib':1024,'kb':1024,'m':1048576,'mib':1048576,'mb':1048576}.get((m[2] or 'b').lower(),1))
    if type(value)!=int or not MIN_SLICE<=value<=MAX_SLICE:raise ValueError('Slice must be 4 KiB to 4 MiB')
    return value
def validate(values,*,partial=False):
    if not isinstance(values,dict) or set(values)-set(FIELDS) or (not partial and set(values)!=set(FIELDS)):raise ValueError('Invalid execution settings')
    out={}
    for k,v in values.items():
        if k in ('slice_bytes','min_slice_bytes'):v=size(v)
        elif k=='auto_shrink':
            if type(v)!=bool:raise ValueError('Invalid auto_shrink')
        else:
            lo,hi=(0,1000) if k=='fast_retries' else (60,86400)
            if type(v)!=int or not lo<=v<=hi:raise ValueError('Invalid retry setting')
        out[k]=v
    if 'slice_bytes' in out and 'min_slice_bytes' in out and out['min_slice_bytes']>out['slice_bytes']:raise ValueError('Minimum exceeds initial slice')
    return out
def defaults(platform):
    return dict(fast_retries=30 if platform=='worker' else 8,slice_bytes=32768 if platform=='worker' else 262144,min_slice_bytes=4096,slow_retry_seconds=900,auto_shrink=True)
async def site(db,platform):
    rows=await db.query('SELECT value FROM service_meta WHERE key=?',(KEY,))
    return validate(json.loads(rows[0]['value'])) if rows else defaults(platform)
async def resolve(db,platform,overrides=None):
    return validate({**await site(db,platform),**validate(overrides or {},partial=True)})
