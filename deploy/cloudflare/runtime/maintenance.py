"""One maintenance job per minute slot; no counters or full resource graph."""
import time

def job_for(controller=None):
    # The deployed schedule is every minute. Use event time so delayed deliveries
    # retain their slot; fallback supports local/manual scheduler tests.
    stamp = getattr(controller, 'scheduledTime', None)
    minute = int((float(stamp) / 1000 if stamp is not None else time.time()) // 60)
    return ('transfer', 'history', 'logs', 'uploads')[minute % 10] if minute % 10 < 4 else 'sync'

async def run(sql, bindings, controller=None):
    job = job_for(controller)
    if job == 'sync':
        if str(getattr(bindings,'TEACHER_SYNC_EXECUTOR_MODE','inline'))=='separate':
            return job, {'action':'delegated','skipped':'separate-executor'}
        from site_sync.integration.worker_schedule import run as sync
        result = await sync(sql, bindings)
    elif job == 'uploads':
        from backend.maintenance.media_uploads import scheduled
        result = await scheduled(sql, bindings)
    elif job == 'logs':
        from backend.maintenance.log_retention import scheduled
        result = await scheduled(sql)
    elif job == 'history':
        from site_sync.integration.worker_schedule import history
        result = await history(sql, bindings)
    else:
        from worker_runtime.cleanup import run as cleanup
        from worker_runtime.storage import TransferStore
        store = TransferStore(getattr(bindings, str(bindings.TEACHER_MEDIA_BINDING)), 'transfer/media/')
        result = await cleanup(sql, store)
    return job, result
