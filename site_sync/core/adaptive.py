"""Small durable load policy. No isolate state, payloads or additional task scans."""
import json,hashlib
from .policy import smaller

PREFIX='sync:adaptive:'
KINDS={'none','credential','cpu','memory','resource_unknown','interrupted','rpc_unknown','timeout','http','network','exception','state','authorization','database','json'}
ACTIONS={'hold','shrink','floor','grow','disabled'}

def classify(diagnostic=None,*,resource=False,uncertain=False):
    if uncertain:return 'interrupted'
    d=diagnostic or {};causes=d.get('causes') or []
    # Access problems never become resource evidence, including remote HTTP 403.
    if d.get('error_category')=='credential' or any(c.get('type')=='CredentialRetryError' or c.get('http_status') in (401,403) for c in causes):return 'credential'
    if d.get('evidence_source')=='cloudflare-telemetry':
        if d.get('platform_outcome')=='exceededCpu':return 'cpu'
        if d.get('platform_outcome')=='exceededMemory':return 'memory'
    if any(c.get('platform_code')==1102 for c in causes):return 'resource_unknown'
    codes={c.get('code') for c in causes}
    if 'SYNC_RPC_FAILED' in codes:return 'rpc_unknown'
    if 'REQUEST_TIMEOUT' in codes or any(c.get('type') in ('TimeoutError','TimeoutError_') for c in causes):return 'timeout'
    if any(c.get('platform_code')==1101 for c in causes):return 'exception'
    kind=d.get('error_category')
    if kind in ('http','network','exception','state','authorization','database','json'):return kind
    return 'resource_unknown' if resource else 'none'

def empty():
    return dict(version=1,success_streak=0,last_pressure_at=0,last_adjusted_at=0,classification='none',last_pressure_kind='none',action='hold',failure_fingerprint='',same_checkpoint_errors=0,quarantined=False)

async def read(db,task_id):
    rows=await db.query('SELECT substr(value,1,2049) AS value FROM service_meta WHERE key=?',(PREFIX+task_id,))
    if not rows:return empty()
    raw=rows[0]['value']
    try:
        if not isinstance(raw,str) or len(raw)>2048:raise ValueError('state bound')
        s=json.loads(raw)
        if not isinstance(s,dict) or s.get('version')!=1:raise ValueError('state version')
        for k in ('success_streak','last_pressure_at','last_adjusted_at'):
            if type(s.get(k))!=int or not 0<=s[k]<=2**53-1:raise ValueError('state value')
        if s['success_streak']>8 or s.get('last_pressure_kind') not in KINDS or s.get('classification') not in KINDS or s.get('action') not in ACTIONS:raise ValueError('state enum')
        defaults=empty()
        for k in ('failure_fingerprint','same_checkpoint_errors','quarantined'):s.setdefault(k,defaults[k])
        if not isinstance(s['failure_fingerprint'],str) or len(s['failure_fingerprint'])>64 or type(s['same_checkpoint_errors'])!=int or not 0<=s['same_checkpoint_errors']<=1000000 or type(s['quarantined'])!=bool:raise ValueError('breaker state')
        return {k:s[k] for k in empty()}
    except (ValueError,TypeError,KeyError):
        # Policy metadata is safely reconstructible; task/body checkpoints are not touched.
        return dict(empty(),state_reset=True)

def adjust(task,state,now,classification,*,progress=False,failed=False,body_success=False):
    s=dict(state);s['classification']=classification;s['action']='hold'
    size=task['slice_bytes'];minimum=max(4096,task['min_slice_bytes']);ceiling=task['initial_slice_bytes']
    pressure=classification in ('cpu','memory','resource_unknown','interrupted','rpc_unknown','timeout')
    if pressure:s['last_pressure_at']=int(now);s['last_pressure_kind']=classification
    if not task['auto_shrink']:
        s['success_streak']=0;s['action']='disabled';return size,s
    if pressure:
        size=smaller(size,minimum);s['success_streak']=0
        s['action']='shrink' if size<task['slice_bytes'] else 'floor';s['last_adjusted_at']=int(now)
    elif failed:s['success_streak']=0
    elif progress and body_success and size<ceiling:
        s['success_streak']=min(8,s['success_streak']+1)
        # Only durable successful BODY slices count; idle ticks and manifest/media
        # success cannot be used as evidence that larger Python bodies are safe.
        if s['success_streak']>=8 and now-max(s['last_pressure_at'],s['last_adjusted_at'])>=300:
            size=min(ceiling,size+max(4096,size//4));s['success_streak']=0
            s['last_adjusted_at']=int(now);s['action']='grow'
    return size,s

def credential_wait(count,fast,slow):
    if count<=3:return fast
    return min(1800,max(fast,min(slow,60*(2**min(5,count-4)))))

def save(task_id,state):
    raw=json.dumps({k:state[k] for k in empty()},separators=(',',':'))
    # Immediately follows the task CAS UPDATE in the same transaction. A stale
    # finisher cannot mutate adaptation or produce a success/error journal row.
    return ('''INSERT INTO service_meta(key,value) SELECT ?,? WHERE changes()=1
      ON CONFLICT(key) DO UPDATE SET value=excluded.value''',(PREFIX+task_id,raw))

def quarantine(task,state,diagnostic,*,failed,progress,permanent=False):
    # Scheduling timestamps, request IDs and stack line numbers are not identity.
    if progress or not failed or permanent:
        state.update(failure_fingerprint='',same_checkpoint_errors=0,quarantined=False);return False
    d=diagnostic or {};context=d.get('context') or {}
    checkpoint=context.get('checkpoint_before',context.get('checkpoint',{}))
    if isinstance(checkpoint,dict):checkpoint={k:v for k,v in checkpoint.items() if k not in ('next_run_at','retry_count')}
    signature=[task['phase'],context.get('sub_stage'),context.get('table'),checkpoint,task['progress_seq'],d.get('error'),d.get('error_category'),[(c.get('type'),c.get('code'),(c.get('d1') or {}).get('sql_type')) for c in d.get('causes',[])]]
    fingerprint=hashlib.sha256(json.dumps(signature,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    count=min(1000000,state['same_checkpoint_errors']+1) if state['failure_fingerprint']==fingerprint else 1
    state.update(failure_fingerprint=fingerprint,same_checkpoint_errors=count,quarantined=count>=6)
    return state['quarantined']
