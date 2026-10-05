"""Read-only scheduler status without loading the execution graph."""
from .catalog import now
from .site_sync_gate import load,STATE,active,checkpoint,waiting,lease_until

async def status(sql):
    p=await load(sql);s=await load(sql,STATE);jobs=await active(sql)
    uid=jobs[0]['uid'] if jobs else s.get('preview_uid') if p.get('auto_pull') and s.get('preview_uid') else s.get('task_uid') if s.get('task_uid')!=s.get('last_task_uid') else None
    row=await checkpoint(sql,uid) if uid else None
    at=now();reason,deadline=waiting(row,at) if uid else ('next_cycle' if p.get('auto_pull') else 'waiting_confirmation',s.get('next_due') if p.get('auto_pull') else None)
    if not p.get('enabled'):reason,deadline='disabled',None
    elif s.get('error') and s.get('retryable') is False:reason,deadline='needs_attention',None
    elif uid and not p.get('auto_pull') and row and not row.get('execution_phase'):reason,deadline='waiting_confirmation',None
    elif not uid and s.get('error'):
        reason='retry_wait' if s.get('retryable') else 'needs_attention';deadline=s.get('retry_after') if s.get('retryable') else None
    if p.get('enabled') and reason in ('ready','reconcile','receipt_wait','retry_wait','linked','complete'):
        lease_deadline=await lease_until(sql,uid)
        if lease_deadline and lease_deadline>at and (not deadline or lease_deadline>deadline):
            reason,deadline='lease_wait',lease_deadline
    HEALTH='site-sync:scheduler-health';ATTEMPT='site-sync:scheduler-attempt:'
    health=await load(sql,HEALTH)
    health['attempt']=await load(sql,ATTEMPT+(health.get('task_uid') or 'scheduled'))
    return {'scheduler':health,**{k:p.get(k) for k in ('enabled','auto_pull','interval','scopes','revision')},
            'state':s,'current_task':row,'wait_reason':reason,'next_attempt_at':deadline}

