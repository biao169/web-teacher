"""One maintenance job per scheduled slot; no counters or full resource graph."""
import time

def job_for(controller=None):
    # Use event time so delayed deliveries
    # retain their slot; fallback supports local/manual scheduler tests.
    stamp = getattr(controller, 'scheduledTime', None)
    minute = int((float(stamp) / 1000 if stamp is not None else time.time()) // 60)
    # Five-minute events need logical slots; wall minute % 10 would starve history.
    slot=minute//5 if str(getattr(controller,'cron',''))=='*/5 * * * *' else minute
    return ('transfer', 'history')[slot % 10] if slot % 10 < 2 else 'sync'

async def run(sql, bindings, controller=None):
    job = job_for(controller)
    if job == 'sync':
        from worker_runtime.sync_schedule import run as sync
        result = await sync(sql, bindings,staged=True)
    elif job == 'history':
        from backend.app.native.site_sync_history import prune
        from backend.app.native.site_sync_limits import WORKER
        result = await prune(sql, batch=WORKER['history_batch'])
    else:
        from worker_runtime.cleanup import run as cleanup
        from worker_runtime.storage import TransferStore
        store = TransferStore(getattr(bindings, str(bindings.TEACHER_MEDIA_BINDING)), 'transfer/media/')
        result = await cleanup(sql, store)
    return job, result
