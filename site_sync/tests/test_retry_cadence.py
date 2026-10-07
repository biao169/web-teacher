import asyncio,unittest,json
from site_sync.core.policy import recover
from site_sync.core.retry_settings import validate,KEY
from site_sync.tests.test_engine import EngineTests
class RetryCadenceTests(unittest.TestCase):
 def test_fast_cap_and_progress(self):
  self.assertEqual(recover(0,0,0,failed=True).delay,10)
  self.assertEqual(recover(0,0,900,failed=True,slow_seconds=86400).delay,1800)
  self.assertEqual(recover(0,1,900,failed=True).consecutive,0)
  for value in (True,0,9,301):
   with self.assertRaises(ValueError):validate({'fast_retry_seconds':value})
 def test_existing_task_reads_new_cadence_without_recreation(self):
  f=EngineTests();f.setUp()
  try:
   task=f.create();owned=f.claim()
   asyncio.run(f.db.batch([('INSERT INTO service_meta(key,value) VALUES(?,?)',(KEY,json.dumps({'fast_retry_seconds':17})))]))
   asyncio.run(f.repo.finish(owned,100,error='NetworkError'))
   self.assertEqual(f.read(task)['next_run_at'],117)
  finally:f.tearDown()
