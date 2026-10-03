"""Resource-only Cron integration: never construct an HTTP or transfer application."""
async def run(sql,bindings):
    from backend.app.native.site_sync_schedule import load,tick
    from worker_runtime.diagnostics import emit
    try:
        # Skip before importing the resource graph when scheduling is not enabled.
        if not (await load(sql)).get('enabled'):
            from backend.app.native.site_sync_history import prune
            await prune(sql)
            return
        from types import SimpleNamespace
        from worker_runtime.resources import resource_factory
        base=resource_factory(SimpleNamespace(scope={'env':bindings}))
        base.sql=sql
        result=await tick(base)
        emit('SYNC-CRON','PAUSED' if result.get('status')=='paused' else 'OK')
    except Exception as exc:
        # No arbitrary binding values or peer response data in observability output.
        emit('SYNC-CRON','FAILED',reason=type(exc).__name__)
