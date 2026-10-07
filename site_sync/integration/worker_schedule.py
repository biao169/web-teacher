"""Cron shares the site's D1/R2 bindings; one bounded action, no HTTP app."""
from types import SimpleNamespace
async def run(sql,bindings):
    import time
    now=int(time.time())
    due=await sql.query("SELECT EXISTS(SELECT 1 FROM sync_tasks WHERE (status IN ('ready','waiting','cancel_requested') AND next_run_at<=?) OR (status='running' AND lease_until<=?)) OR EXISTS(SELECT 1 FROM sync_schedules WHERE enabled=1 AND next_run_at<=?) OR EXISTS(SELECT 1 FROM sync_tasks WHERE delete_requested=1 AND status IN ('done','cancelled')) AS due",(now,now,now))
    if not due[0]['due']:return {'action':'idle','skipped':'not-due'}
    from .host import tick
    # Sync only needs the database, native stream service and storage kind.
    # Do not load templates, authentication, translation or the HTTP resource graph.
    r=SimpleNamespace(sql=sql,kind='r2',sync_env=bindings)
    return await tick(r)
async def history(sql,bindings):
    from site_sync.admin.retention import Retention
    from site_sync.adapters.d1 import D1
    now=int(__import__('time').time());db=D1(sql.binding)
    result=await db.batch([('DELETE FROM sync_exports WHERE rowid IN (SELECT rowid FROM sync_exports WHERE expires_at<? ORDER BY expires_at LIMIT 1)',(now,))])
    if result[0]['meta']['changes']:return {'action':'export-trimmed'}
    return await Retention(db,int(getattr(bindings,'SYNC_HISTORY_DAYS','90'))).step(now)
