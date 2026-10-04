"""Cheap scheduler gate: no application, storage or synchronization graph imports."""
import json
from datetime import datetime, timezone

KEY = 'site-sync:schedule'
STATE = 'site-sync:schedule-state'
TURN = 'site-sync:dispatch'

def dispatch(kind,at):
    return ('INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(TURN,json.dumps({'kind':kind,'at':at},separators=(',',':'))))

async def load(sql, key=KEY):
    rows = await sql.query('SELECT value FROM service_meta WHERE key=?', (key,))
    return json.loads(rows[0]['value']) if rows else {}

async def active(sql):
    return await sql.query("SELECT uid FROM sync_tasks WHERE json_extract(state,'$.execution.phase') IS NOT NULL AND json_extract(state,'$.execution.phase') NOT IN ('done','cancelled') LIMIT 1")

async def probe(sql,*,include_manual=True):
    from .site_sync_manual_gate import candidate
    stamp=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    manual=await candidate(sql,stamp) if include_manual else None
    if manual:
        deadline=await lease_until(sql,manual['uid'])
        return {'skipped':'busy'} if deadline and deadline>stamp else {}
    policy = await load(sql)
    if not policy.get('enabled'):
        pending=await sql.query("SELECT 1 FROM service_meta WHERE key LIKE 'site-sync:manual:%' AND json_extract(value,'$.enabled')=1 LIMIT 1")
        return {'skipped': 'interval' if pending else 'disabled'}
    state = await load(sql, STATE)
    at = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    jobs=await active(sql)
    uid=jobs[0]['uid'] if jobs else state.get('preview_uid') if policy.get('auto_pull') and state.get('preview_uid') else state.get('task_uid') if state.get('task_uid')!=state.get('last_task_uid') else None
    if uid:
        if await load(sql,'site-sync:manual:'+uid):return {'skipped':'manual'}
        row=await checkpoint(sql,uid)
        if not policy.get('auto_pull') and row and not row.get('execution_phase'):return {'skipped':'waiting'}
        reason,deadline=waiting(row,at)
        if deadline:return {'skipped':'interval'}
        if reason=='needs_attention':return {'skipped':'attention'}
        until=await lease_until(sql,uid)
        if until and until>at:return {'skipped':'busy'}
        # Durable task state takes priority over a stale scheduler retry deadline.
        return {}
    if state.get('retry_after', '') > at:return {'skipped':'interval'}
    if not policy.get('auto_pull'):
        return {'skipped': 'waiting'}
    if not state.get('preview_uid') and state.get('next_due', '') > at:
        return {'skipped': 'interval'}
    return {}


async def checkpoint(sql,uid):
    """One small read shared by Cron gating and monitoring; no business payloads."""
    fields={'work_attempt':'work.attempt','work_failed_at':'work.failed_at','execution_phase':'execution.phase','committed':'execution.committed','work_status':'work.status',
            'pace_after':'work.pace_after','retryable':'work.retryable','retry_after':'work.retry_after','recover_after':'work.recover_after',
            'prepared_uid':'prepared_uid','restart_uid':'restart_uid','parent_uid':'parent_uid',
            'completed_at':'work.completed_at','error_code':'work.error_code'}
    projection=','.join("json_extract(state,'$."+path+"') AS "+key for key,path in fields.items())
    rows=await sql.query('SELECT uid,status,'+projection+",substr(coalesce(json_extract(state,'$.work.error'),json_extract(state,'$.execution.error'),''),1,500) AS error FROM sync_tasks WHERE uid=? AND coalesce(json_extract(state,'$.history_deleting'),0)=0",(uid,))
    return rows[0] if rows else None


def waiting(row,at):
    """Earliest eligible time, not a promise that a Cron invocation will occur."""
    if not row:return 'missing',None
    if row.get('status')=='expired':return 'needs_attention',None
    if row.get('work_status')=='running':
        deadline=row.get('recover_after')
        return ('receipt_wait',deadline) if deadline and deadline>at else ('reconcile',None)
    if row.get('execution_phase') in ('done','cancelled'):return 'complete',None
    if row.get('work_status')=='paused' and row.get('retryable') and (row.get('retry_after') or '')>at:
        return 'retry_wait',row['retry_after']
    if row.get('restart_uid') or (row.get('prepared_uid') and not row.get('execution_phase')):return 'linked',None
    if row.get('work_status')=='paused' and not row.get('retryable'):return 'needs_attention',None
    deadline=row.get('recover_after') if row.get('work_status')=='running' else row.get('retry_after') if row.get('work_status')=='paused' else None
    if deadline and deadline>at:return ('receipt_wait' if row.get('work_status')=='running' else 'retry_wait'),deadline
    if (row.get('pace_after') or '')>at:return 'retry_wait',row['pace_after']
    return ('reconcile' if row.get('work_status')=='running' else 'ready'),None


async def lease_until(sql,uid=None):
    keys=['site-sync:schedule-run','site-sync:run']
    if uid:keys.append('site-sync:task:'+uid)
    rows=await sql.query("SELECT max(strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+300 seconds')) AS deadline FROM admin_mutation_guards WHERE uid IN ("+','.join('?' for _ in keys)+')',tuple(keys))
    return rows[0]['deadline'] if rows else None
