"""Cron shares the site's D1/R2 bindings; one bounded action, no HTTP app."""
from types import SimpleNamespace
async def _run(sql,bindings):
    from .control import paused
    if str(getattr(bindings,'TEACHER_SYNC_PAUSED','0'))=='1' or await paused(sql):return {'action':'disabled','skipped':'sync-paused'}
    import time
    now=int(time.time())
    due=await sql.query("SELECT EXISTS(SELECT 1 FROM sync_tasks WHERE (status IN ('ready','waiting','cancel_requested') AND next_run_at<=?) OR (status='running' AND lease_until<=?)) OR EXISTS(SELECT 1 FROM sync_tasks WHERE status='waiting' AND phase!='await_confirmation' AND no_progress_count>0 AND next_run_at>strftime('%s','now')+1800) OR EXISTS(SELECT 1 FROM sync_schedules WHERE enabled=1 AND next_run_at<=?) OR EXISTS(SELECT 1 FROM sync_tasks WHERE delete_requested=1 AND status IN ('done','cancelled')) AS due",(now,now,now))
    if not due[0]['due']:return {'action':'idle','skipped':'not-due'}
    from .host import tick
    # Sync only needs the database, native stream service and storage kind.
    # Do not load templates, authentication, translation or the HTTP resource graph.
    r=SimpleNamespace(sql=sql,kind='r2',sync_env=bindings)
    return await tick(r)
async def history(sql,bindings):
    from .control import paused
    if str(getattr(bindings,'TEACHER_SYNC_PAUSED','0'))=='1' or await paused(sql):return {'action':'disabled','skipped':'sync-paused'}
    from site_sync.admin.retention import Retention
    from site_sync.adapters.d1 import D1
    now=int(__import__('time').time());db=D1(sql.binding)
    result=await db.batch([('DELETE FROM sync_exports WHERE rowid IN (SELECT rowid FROM sync_exports WHERE expires_at<? ORDER BY expires_at LIMIT 1)',(now,))])
    if result[0]['meta']['changes']:return {'action':'export-trimmed'}
    return await Retention(db,int(getattr(bindings,'SYNC_HISTORY_DAYS','90'))).step(now)

async def _wrapped_run(sql,bindings,*,wake=True):
    try:return await _run(sql,bindings)
    finally:
        if wake:
            try:await bindings.SYNC_NATIVE.wake()
            except Exception:pass  # Cron remains a durable fallback.

async def arm(r):
    if not hasattr(r,'sync_env'):return False
    import asyncio
    try:
        await asyncio.wait_for(r.sync_env.SYNC_NATIVE.wake(),2)
        return True
    except Exception:return False  # Saving the task must survive a failed wake; Cron retries.

async def run(sql,bindings,*,wake=True):
    from site_sync.core.trace import current,scope,invocation
    data=current() or invocation('sync-runner',str(getattr(bindings,'TEACHER_SYNC_EXECUTOR_MODE','inline')))
    with scope(**data):return await _wrapped_run(sql,bindings,wake=wake)
