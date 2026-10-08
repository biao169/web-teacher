"""Durable, site-wide admission switch. In-flight bounded steps drain safely."""
import time
from .database import adapter
KEY='site_sync.paused.v1'
async def paused(db):
    rows=await db.query("SELECT value FROM service_meta WHERE key=?",(KEY,))
    return bool(rows and rows[0]['value']!='0')
async def stopped(r):
    from .host import environment
    return environment(r,'TEACHER_SYNC_PAUSED','0')=='1' or await paused(adapter(r))
async def status(r):
    from .host import environment
    env=environment(r,'TEACHER_SYNC_PAUSED','0')=='1'
    saved=await paused(adapter(r))
    rows=await adapter(r).query("SELECT lease_until FROM sync_tasks WHERE status IN ('running','paused','cancel_requested') AND lease_token IS NOT NULL AND lease_until>? LIMIT 51",(int(time.time()),))
    return {'paused':env or saved,'saved_paused':saved,'environment_paused':env,'active_leases':min(50,len(rows)),'active_leases_truncated':len(rows)>50,'earliest_lease_until':min((x['lease_until'] for x in rows),default=None)}
async def save(r,value):
    from backend.app.native.data_tools import authorize
    authorize(r,'edit')
    if not r.p.get('is_system'):raise ValueError('Only system administrator can control site-wide synchronization')
    if type(value)!=bool:raise ValueError('paused must be boolean')
    gid,guard=r.auth.guard(r.p,'data_tools','edit')
    await adapter(r).batch([guard,("INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(KEY,'1' if value else '0')),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
    result=await status(r);result['coordinator_notified']=False
    if hasattr(r,'sync_env'):
        import asyncio
        try:
            await asyncio.wait_for(r.sync_env.SYNC_NATIVE.control(),2)
            result['coordinator_notified']=True
        except Exception:pass # Durable DB switch still gates every subsequent delivery.
    return result
