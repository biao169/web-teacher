"""Recover receipts before importing the full business resource graph."""
async def run(sql, bindings,*,source='worker',staged=False):
    from backend.app.native.site_sync_dispatch import run as dispatch
    async def execute(uid):
        import sys
        from backend.app.native.site_sync_initialization import advance
        await advance('latest_gate')
        from backend.app.native.site_sync_latest_gate import select
        choice=await select(sql,uid)
        if choice:
            await advance('latest_modules',cached='backend.app.native.site_sync_latest_runtime' in sys.modules)
            from backend.app.native.site_sync_latest_runtime import run as latest
            await advance('latest_resources')
            return await latest(sql,choice,kind='r2')
        await advance('resource_modules',cached='worker_runtime.sync_resources' in sys.modules)
        from worker_runtime.sync_resources import resource_factory
        await advance('schedule_modules',cached='backend.app.native.site_sync_schedule' in sys.modules)
        from backend.app.native.site_sync_schedule import tick
        await advance('resource_factory')
        base=resource_factory(sql,bindings)
        await advance('dispatch')
        return await tick(base,prune_history=False,dispatch_uid=uid)
    from worker_runtime.diagnostics import emit
    try:
        result=await dispatch(sql,execute,kind=source,staged=staged)
        emit('SYNC-CRON','PAUSED' if result.get('status')=='paused' else 'OK')
        return result
    except Exception as exc:
        emit('SYNC-CRON','FAILED',reason=type(exc).__name__)
        raise
