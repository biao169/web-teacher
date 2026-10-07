import asyncio,unittest,tempfile
from unittest.mock import AsyncMock
from types import SimpleNamespace
from site_sync.core.engine import Engine
from site_sync.adapters.local_media import LocalMedia
class BudgetTests(unittest.TestCase):
 def test_emergency_pause_does_not_touch_database(self):
  from site_sync.integration.worker_schedule import run
  db=SimpleNamespace(query=AsyncMock())
  result=asyncio.run(run(db,SimpleNamespace(TEACHER_SYNC_PAUSED='1')))
  self.assertEqual(result['action'],'disabled');db.query.assert_not_awaited()

 def test_timeout_cancels_handler_and_preserves_resource_recovery(self):
  closed=[]
  async def handler(ctx):
   try:await asyncio.sleep(10)
   finally:closed.append(True)
  repo=SimpleNamespace(reconcile_one=AsyncMock(return_value=False),claim=AsyncMock(return_value={'task_id':'t','phase':'transfer'}),finish=AsyncMock())
  asyncio.run(Engine(repo,{'transfer':handler},lambda:100,step_timeout=.01).tick())
  self.assertEqual(closed,[True]);self.assertTrue(repo.finish.call_args.kwargs['resource'])
 def test_cleanup_is_bounded_and_preserves_owner_until_complete(self):
  with tempfile.TemporaryDirectory() as root:
   media=LocalMedia(SimpleNamespace(db=None),root);f={'operation_id':'a'*64,'staging_key':'sync/'+'a'*64,'source_version':'v','total_bytes':33}
   directory=media.directory(f)
   for n in range(33):(directory/('part-'+str(n))).write_bytes(b'x')
   self.assertFalse(media._discard(f));self.assertEqual(len(list(directory.glob('part-*'))),17);self.assertTrue((directory/'owner.json').exists())
   self.assertFalse(media._discard(f));self.assertTrue(media._discard(f));self.assertFalse(directory.exists())

class ReturningOwnerTests(unittest.TestCase):
 def test_cancel_releases_only_returning_owner_and_cleanup_claims_immediately(self):
  from site_sync.tests.test_engine import EngineTests
  f=EngineTests();f.setUp()
  try:
   original=f.create();task=f.claim()
   asyncio.run(f.repo.cancel(task['task_id'],'grant',100))
   self.assertGreater(f.read(task)['lease_until'],100)
   self.assertTrue(asyncio.run(f.repo.finish(task,100)))
   self.assertEqual(f.read(task)['status'],'cancel_requested')
   cleanup=f.claim();self.assertEqual(cleanup['phase'],'cleanup')
   self.assertFalse(asyncio.run(f.repo.finish(task,100)))
   self.assertEqual(f.read(task)['lease_token'],cleanup['lease_token'])
  finally:f.tearDown()
