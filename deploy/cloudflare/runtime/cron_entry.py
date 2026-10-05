"""Minimal scheduled entry; only SQL/bridge/diagnostics before the heartbeat."""
from worker_runtime.diagnostics import phase,emit

async def run(controller,env):
    with phase('CRON',progress=False):
        with phase('CRON-MODULES'):
            from worker_runtime.bridge import Environment
            from backend.app.adapters.d1.sql import D1SQL
            from worker_runtime import cron_health
        with phase('CRON-DATABASE'):
            bindings=Environment(env)
            sql=D1SQL(getattr(bindings,str(getattr(bindings,'TEACHER_DATABASE_BINDING','DB'))))
        watchdog=str(getattr(controller,'cron',''))==cron_health.WATCHDOG_CRON
        health_key=cron_health.WATCHDOG_KEY if watchdog else cron_health.KEY
        receipt=await cron_health.start(sql,'watchdog' if watchdog else 'dispatch',key=health_key)
        patrol_receipt=None
        try:
            with phase('CRON-DISPATCH'):
                if not watchdog and str(getattr(controller,'cron',''))==cron_health.FREE_CRON:
                    period=await cron_health.due_period(sql,controller)
                    if period is not None:
                        watchdog=True
                        patrol_receipt=await cron_health.start(sql,'watchdog',key=cron_health.WATCHDOG_KEY,period=period)
                if watchdog:
                    from worker_runtime.watchdog import run as patrol
                    job='watchdog';result=await patrol(sql,bindings)
                else:
                    from worker_runtime.maintenance import run as maintain
                    job,result=await maintain(sql,bindings,controller)
        except Exception as exc:
            await cron_health.finish(sql,patrol_receipt,error=exc,key=cron_health.WATCHDOG_KEY)
            await cron_health.finish(sql,receipt,error=exc,key=health_key)
            raise
        await cron_health.finish(sql,patrol_receipt,result=result,job=job,key=cron_health.WATCHDOG_KEY)
        await cron_health.finish(sql,receipt,result=result,job=job,key=health_key)
        reason=result.get('skipped')
        emit('CRON','SKIPPED' if reason else 'OK',job=job,
             reason=reason if reason in ('not-initialized','disabled','interval','busy','waiting') else '')
        return result
