"""Best-effort Cron heartbeat; failures here never replace the original failure."""
import json,secrets
from datetime import datetime,timezone
from backend.app.native.runtime_version import VERSION
from worker_runtime.diagnostics import emit
KEY='site-sync:cron-health'
WATCHDOG_KEY='site-sync:watchdog-health'
WATCHDOG_CRON='0 */3 * * *'
FREE_CRON='*/5 * * * *'

def stamp():return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')

async def start(sql,job,*,key=KEY,period=None):
    value={'arrived_at':stamp(),'version':VERSION,'job':job,'status':'running','token':secrets.token_hex(16)}
    if period is not None:value['period']=period
    try:
        raw=json.dumps(value,separators=(',',':'))
        await sql.batch([('INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,raw))])
        return raw
    except Exception as exc:
        emit('CRON-HEARTBEAT','ERROR',reason=type(exc).__name__)
        return None

async def finish(sql,before,*,result=None,error=None,job=None,key=KEY):
    if before is None:return
    value=json.loads(before);value.update(finished_at=stamp(),status='failed' if error else 'finished')
    if job:value['job']=job
    if error:value['error_type']=type(error).__name__
    if result:
        value['result']=str(result.get('skipped') or result.get('status') or 'ok')[:80]
        if result.get('error_code'):value['error_code']=str(result['error_code'])[:80]
    try:
        await sql.batch([('UPDATE service_meta SET value=? WHERE key=? AND value=?',(json.dumps(value,separators=(',',':')),key,before))])
    except Exception as exc:emit('CRON-HEARTBEAT','ERROR',reason=type(exc).__name__)


async def due_period(sql,controller):
    """UTC three-hour buckets catch up at the next received five-minute event."""
    from backend.app.native.site_sync_gate import load
    stamp_ms=getattr(controller,'scheduledTime',None)
    if stamp_ms is None:stamp_ms=datetime.now(timezone.utc).timestamp()*1000
    period=int(float(stamp_ms)//10800000)
    previous=(await load(sql,WATCHDOG_KEY)).get('period')
    return period if type(previous) is not int or period>previous else None
