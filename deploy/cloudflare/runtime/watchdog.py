"""Three-hour recovery opportunity; reuse the bounded, authorized dispatcher.

No broad cleanup, force-unlock, retry reset or implicit grant is performed.
An event runs one reconcile/preflight/business step even without minute events.
"""
async def run(sql,bindings):
    from worker_runtime.sync_schedule import run as sync
    return await sync(sql,bindings,source='worker-watchdog',staged=True)
