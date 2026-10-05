"""Rate-limited browser wake; never enroll, resume or approve a task here.

The caller checks session, CSRF and data_tools edit; normal dispatch revalidates
saved grants. SQL CAS throttles multiple tabs, including interrupted wake calls.
"""
from .catalog import now
from .site_sync_gate import load
KEY='site-sync:browser-wake'
async def claim(sql):
    health=await load(sql,'site-sync:scheduler-health')
    if health.get('arrived_at','')>now(seconds=-180):return False
    result=await sql.batch([("INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE service_meta.value<=? RETURNING key",(KEY,now(seconds=180),now()))])
    return bool(result[0])
