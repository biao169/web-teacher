"""SQL-only interrupted-step recovery, before constructing business resources.

One conditional update is the linearization point: authorization, task binding,
old work, checkpoint and absence of live execution leases are checked together.
No peer request, business write or proposal approval can occur on this path.
"""
import json,hashlib
from datetime import datetime,timezone,timedelta
from .site_sync_checkpoint import PROJECTION,observe
from .site_sync_limits import for_resource,pressured
from .site_sync_gate import load,KEY,STATE,active,lease_until,TURN,probe
from .site_sync_manual_gate import candidate,binding,PREFIX

MODULES=('profiles','students','student_category_displays','research_interests','projects',
 'publications','patents','courses','news','navigation_items','site_settings',
 'global_settings','translation_cache','media_assets')
CODES=('sync_timeout','sync_overloaded','sync_locked','sync_network','sync_stream',
 'sync_http_429','sync_http_502','sync_http_503','sync_http_504','sync_unconfirmed','1101','1102')
def now(seconds=0):return (datetime.now(timezone.utc)+timedelta(seconds=seconds)).isoformat(timespec='milliseconds').replace('+00:00','Z')
def encoded(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'),sort_keys=True,allow_nan=False)

def retry(code,prior,resource=None,*,checkpointed=False,progressed=False,clock=None):
    limits=for_resource(resource);delays=limits['retry_seconds']
    count=0 if checkpointed and progressed else prior.get('retry_count',0)+1
    slow=checkpointed and count>limits['no_progress_retry_limit']
    allowed=str(code) in CODES and (checkpointed or count<=len(delays))
    delay=max(delays[-1],3600 if limits['mode']=='ultra_low' else 900) if slow else delays[min(max(count-1,0),len(delays)-1)]
    return dict(retry_count=count,retryable=allowed,slow_retry=bool(slow and allowed),retry_after=(clock or now)(seconds=delay) if allowed else None)

def recovered(row,resource):
    prior=row['work'];at=now();evidence=observe(prior,row['checkpoint'],at,uncertain=True)
    progressed=evidence['progress_events']>prior.get('progress_events',0)
    saved={**prior,**evidence,'resource_level':pressured(resource,prior,'sync_unconfirmed'),'reconciled_at':at,'last_error_code':'sync_unconfirmed','last_error_at':at}
    saved.pop('recover_after',None)
    if row['execution_phase'] in ('done','cancelled'):
        saved.update(status='saved',completed_at=at,retry_count=0 if progressed else prior.get('retry_count',0),slow_retry=False)
        for key in ('error','error_code','retryable','retry_after'):saved.pop(key,None)
    else:
        saved.update(retry('sync_unconfirmed',prior,resource,checkpointed=True,progressed=progressed))
        saved.update(status='paused',failed_at=at,error_code='sync_unconfirmed',error='已核对中断进度；后台低频重试' if saved['slow_retry'] else '已核对中断进度；等待冷却后继续')
    return saved

async def selected(sql):
    manual=await candidate(sql,now())
    if manual:
        previous=await load(sql,TURN)
        if previous.get('kind')!='manual' or await probe(sql,include_manual=False):
            return manual['uid'],manual['key'],json.loads(manual['value'])
    policy=await load(sql)
    if not policy.get('enabled'):return None
    s=await load(sql,STATE);jobs=await active(sql)
    uid=jobs[0]['uid'] if jobs else s.get('preview_uid') if policy.get('auto_pull') and s.get('preview_uid') else s.get('task_uid') if s.get('task_uid')!=s.get('last_task_uid') else None
    if not uid or await load(sql,PREFIX+uid):return None
    return uid,KEY,policy

async def reconcile(sql,selection,resource):
    if not selection:return None
    uid,key,policy=selection
    rows=await sql.query("SELECT "+PROJECTION+" AS checkpoint,json_extract(state,'$.work') AS work,json_extract(state,'$.execution.phase') AS execution_phase,json_extract(state,'$.preview_format') AS task_format FROM sync_tasks WHERE uid=? AND status IN ('reading','ready') AND coalesce(json_extract(state,'$.history_deleting'),0)=0",(uid,))
    if not rows:return None
    row=rows[0];old=row['work'];row['work']=json.loads(old or '{}')
    if row['work'].get('status')!='running':return None
    if key==KEY and not policy.get('auto_pull') and not row['execution_phase']:return None
    if row['work'].get('recover_after','')>now():return {'skipped':'interval'}
    deadline=await lease_until(sql,uid)
    if deadline and deadline>now():return {'skipped':'busy'}
    if row['task_format']!=8:raise PermissionError('task-format')
    raw=row['checkpoint'];row['checkpoint']=hashlib.sha256(raw.encode()).hexdigest()
    saved=recovered(row,resource);owner=policy['owner']
    # All modules required by the normal background context, plus exact owner stamps.
    modules=(*MODULES,'data_tools');placeholders=','.join('?' for _ in modules)
    auth="EXISTS(SELECT 1 FROM auth_users u JOIN auth_roles r ON r.uid=u.role_uid WHERE u.uid=? AND u.role_uid=? AND u.updated_at=? AND r.updated_at=? AND u.status='active' AND u.must_change_password=0 AND r.is_active=1 AND r.is_system=1 AND (SELECT count(DISTINCT module) FROM auth_permissions WHERE role_uid=r.uid AND module IN ("+placeholders+") AND can_view=1 AND can_edit=1 AND can_export=1)=?)"
    args=tuple(owner[k] for k in ('uid','role_uid','user_stamp','role_stamp'))+modules+(len(modules),)
    cond=auth+" AND EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM sync_peers WHERE id=1 AND enabled=1 AND revision=?)"
    args+=(key,encoded(policy),policy['peer_revision'])
    if key!=KEY:
        cond+=' AND '+binding(policy['mode'])+'=json(?)';args+=(encoded(policy['binding']),)
    else:
        cond+=' AND NOT EXISTS(SELECT 1 FROM service_meta WHERE key=?)';args+=(PREFIX+uid,)
    # Atomic CAS also prevents double accounting and completion of a newer attempt.
    result=await sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?),'$._sync_revision',lower(hex(randomblob(16)))) WHERE uid=? AND status IN ('reading','ready') AND coalesce(json_extract(state,'$.history_deleting'),0)=0 AND json_extract(state,'$.work')=? AND "+PROJECTION+"=? AND NOT EXISTS(SELECT 1 FROM admin_mutation_guards WHERE uid IN ('site-sync:run','site-sync:schedule-run',?) AND created_at>=?) AND "+cond+' RETURNING uid',
        (encoded(saved),uid,old,raw,'site-sync:task:'+uid,now(-300),*args))])
    if not result[0]:
        authorized=await sql.query('SELECT uid FROM sync_tasks WHERE uid=? AND '+cond,(uid,*args))
        if not authorized:raise PermissionError('authorization-changed')
        return {'skipped':'checkpoint-changed','task_uid':uid}
    return {'status':'reconciled','task_uid':uid,'work':saved}
