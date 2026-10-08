import asyncio,base64,json,unittest
from site_sync.tests import test_admin
from site_sync.core.settings import size,validate,defaults
from site_sync.runtime.schedules import Schedules
from site_sync.runtime.bridge import NativeBridge
run=asyncio.run
class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.fixture=test_admin.AdminTests();self.fixture.setUp()
        self.admin=self.fixture.admin;self.repo=self.fixture.repo;self.actor=self.fixture.actor
    def tearDown(self):self.fixture.tearDown()
    def test_units_and_range(self):
        for value,expected in [('4KiB',4096),('4m',4194304),('256 kib',262144),('4194304',4194304)]:self.assertEqual(size(value),expected)
        for value in ('3KiB','5m',True,0,'nan','4.5m'):
            with self.assertRaises(ValueError):size(value)
        with self.assertRaises(ValueError):validate({**defaults('worker'),'slice_bytes':'4k','min_slice_bytes':'8k'})
    def test_site_defaults_frozen_task_and_explicit_override(self):
        config={**defaults('worker'),'slice_bytes':'4m','fast_retries':7}
        run(self.admin.save_defaults(self.actor,config))
        body={'peer_id':'peer','scope':['news'],'request_id':'settings-task-1'}
        uid=run(self.admin.create(self.actor,body))['task_id']
        self.assertEqual(run(self.repo.read(uid))['initial_slice_bytes'],4194304)
        run(self.admin.save_defaults(self.actor,{**defaults('worker'),'slice_bytes':'64k'}))
        self.assertEqual(run(self.repo.read(uid))['slice_bytes'],4194304)
        self.assertEqual(run(self.admin.create(self.actor,body))['task_id'],uid)
        other=run(self.admin.create(self.actor,{**body,'request_id':'settings-task-2','settings':{'slice_bytes':'128k','fast_retries':0}}))
        task=run(self.repo.read(other['task_id']));self.assertEqual((task['slice_bytes'],task['fast_retries'],task['min_slice_bytes']),(131072,0,4096))
    def test_schedule_sparse_override_inherits_at_creation(self):
        run(self.admin.save_defaults(self.actor,{**defaults('worker'),'slice_bytes':'64k'}))
        body={**self.fixture.schedule(),'settings':{'fast_retries':2},'enabled':True}
        sid=run(self.admin.save_schedule(self.actor,body))['schedule_id']
        schedule=run(self.admin.schedules(self.actor))['items'][0]
        self.assertEqual(schedule['settings'],{'fast_retries':2})
        run(self.admin.save_defaults(self.actor,{**defaults('worker'),'slice_bytes':'4m'}))
        r=run(Schedules(self.repo).tick(100));task=run(self.repo.read(r['task_id']))
        self.assertEqual((task['slice_bytes'],task['fast_retries'],task['auto_confirm']),(4194304,2,1))
    def test_shrink_floor_and_opt_out(self):
        for op,shrink,expected in [('shrink',True,4096),('fixed',False,8192)]:
            t=run(self.repo.create(peer_id='peer',grant_id='g',scope=['news'],operation_id=op,now=100,settings={'slice_bytes':8192,'min_slice_bytes':4096,'auto_shrink':shrink}))
            for now in (100,10000,20000):
                task=run(self.repo.claim(now));run(self.repo.finish(task,now,error='ResourceError',resource=True))
            self.assertEqual(run(self.repo.read(t['task_id']))['slice_bytes'],expected)
            run(self.repo.pause(t['task_id'],'g',30000))
    def test_native_bridge_above_old_64k_limit(self):
        data=b'x'*200000
        class Binding:
            async def read(_,raw):return data
        self.assertEqual(run(NativeBridge(Binding(),None,{}).read({'kind':'slice','length':len(data)})),data)
