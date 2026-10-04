"""Check eligibility before constructing sync resources; no HTTP application."""
async def run(sql, bindings):
    from backend.app.native.site_sync_gate import probe
    from worker_runtime.diagnostics import emit
    try:
        result = await probe(sql)
        if result.get('skipped'):
            return result
        from types import SimpleNamespace
        from worker_runtime.resources import resource_factory
        from backend.app.native.site_sync_schedule import tick
        base = resource_factory(SimpleNamespace(scope={'env': bindings}))
        base.sql = sql
        # History has its own Cron slot. tick rechecks policy/leases before writes.
        result = await tick(base, prune_history=False)
        emit('SYNC-CRON', 'PAUSED' if result.get('status') == 'paused' else 'OK')
        return result
    except Exception as exc:
        emit('SYNC-CRON', 'FAILED', reason=type(exc).__name__)
        raise
