"""Private executor wiring without initializing the website application."""
import asyncio,importlib.util,sys,types,unittest
from pathlib import Path
from unittest.mock import patch,AsyncMock
ROOT=Path(__file__).resolve().parents[3]

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

class ExecutorTests(unittest.TestCase):
    def test_main_cron_delegates_without_invoking_sync(self):
        maintenance=load('maintenance_isolated',ROOT/'deploy/cloudflare/runtime/maintenance.py')
        bindings=types.SimpleNamespace(TEACHER_SYNC_EXECUTOR_MODE='separate')
        with patch('site_sync.integration.worker_schedule.run',new_callable=AsyncMock) as tick:
            job,value=asyncio.run(maintenance.run(None,bindings,types.SimpleNamespace(scheduledTime=4*60000)))
            self.assertEqual((job,value['action']),('sync','delegated'));tick.assert_not_awaited()

    def test_executor_scheduled_uses_same_db_without_http_factory(self):
        workers=types.ModuleType('workers');workers.WorkerEntrypoint=object;workers.asgi=types.SimpleNamespace(fetch=AsyncMock())
        bridge=types.ModuleType('worker_runtime.bridge');bridge.Environment=lambda env:env
        package=types.ModuleType('worker_runtime');package.__path__=[str(ROOT/'deploy/cloudflare/runtime')]
        with patch.dict(sys.modules,{'workers':workers,'worker_runtime':package,'worker_runtime.bridge':bridge}):
            executor=load('executor_isolated',ROOT/'deploy/cloudflare/runtime/sync_executor.py')
            env=types.SimpleNamespace(TEACHER_DATABASE_BINDING='DB',DB=object())
            instance=executor.Default();instance.env=env
            with patch('site_sync.integration.worker_schedule.run',new_callable=AsyncMock) as tick:
                asyncio.run(instance.scheduled(None));self.assertIs(tick.call_args.args[0].binding,env.DB)
                self.assertIs(tick.call_args.args[1],env)

    def test_due_tick_constructs_only_sync_resources(self):
        from site_sync.integration.worker_schedule import run
        sql=types.SimpleNamespace(query=AsyncMock(side_effect=[[],[{'due':1}]]))
        env=object()
        with patch('site_sync.integration.host.tick',new_callable=AsyncMock,return_value={'action':'stepped'}) as tick:
            asyncio.run(run(sql,env));r=tick.call_args.args[0]
            self.assertEqual(set(vars(r)),{'sql','kind','sync_env'})
            self.assertIs(r.sync_env,env)
