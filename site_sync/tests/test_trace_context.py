import asyncio,json,unittest
from types import SimpleNamespace
from site_sync.core.trace import scope,current,category
from site_sync.core.journal import failure
class TraceTests(unittest.TestCase):
 def test_concurrent_context_reset(self):
  async def one(uid):
   with scope(request_id=uid):
    await asyncio.sleep(0)
    self.assertEqual(current()['request_id'],uid)
   self.assertEqual(current(),{})
  async def run():await asyncio.gather(one('a'*32),one('b'*32))
  asyncio.run(run());self.assertEqual(current(),{})
 def test_resource_evidence_is_not_guessed_from_message(self):
  e=RuntimeError('PRIVATE1102 exceededCpu secret');d=failure(e)
  self.assertNotIn('platform_code',d['causes'][0]);self.assertNotIn('PRIVATE',json.dumps(d))
  e.platform_code=1102
  self.assertEqual(category(e)['resource_kind'],'unknown')
  e.platform_outcome='exceededMemory'
  self.assertIsNone(category(e)['platform_outcome'])
  e.evidence_source='cloudflare-telemetry'
  self.assertEqual(category(e)['resource_kind'],'memory')
 def test_task_journal_keeps_request_and_checkpoint(self):
  from site_sync.tests.test_engine import EngineTests
  f=EngineTests();f.setUp()
  try:
   t=f.create()
   with scope(request_id='a'*32,component='sync-executor',executor_mode='separate'):
    owner=f.claim();asyncio.run(f.repo.finish(owner,100))
   rows=asyncio.run(f.db.query('SELECT detail FROM sync_events WHERE task_id=? ORDER BY event_id DESC LIMIT 1',(t['task_id'],)))
   detail=json.loads(rows[0]['detail'])
   self.assertEqual(detail['trace']['request_id'],'a'*32)
   self.assertEqual(detail['checkpoint']['progress_seq'],0)
   self.assertEqual(detail['task_id'],t['task_id'])
  finally:f.tearDown()
