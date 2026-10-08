import asyncio,unittest,tempfile
from unittest.mock import AsyncMock
from types import SimpleNamespace
from site_sync.core.engine import Engine
from site_sync.adapters.local_media import LocalMedia
class BudgetTests(unittest.TestCase):
 def test_emergency_pause_does_not_touch_database(self):
  from site_sync.integration.worker_schedule import run,history
  db=SimpleNamespace(query=AsyncMock())
  result=asyncio.run(run(db,SimpleNamespace(TEACHER_SYNC_PAUSED='1')))
  self.assertEqual(result['action'],'disabled');db.query.assert_not_awaited()
  self.assertEqual(asyncio.run(history(db,SimpleNamespace(TEACHER_SYNC_PAUSED='1')))['action'],'disabled');db.query.assert_not_awaited()

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

class DeferredPauseTests(unittest.TestCase):
 def test_peer_pause_releases_lease_without_error_or_slice_penalty(self):
  from site_sync.tests.test_engine import EngineTests
  f=EngineTests();f.setUp()
  try:
   task=f.create();before=f.read(task)
   async def handler(ctx):
    error=RuntimeError('peer paused');error.code='SYNC_PAUSED';raise error
   result=asyncio.run(Engine(f.repo,{'discover':handler},f.clock).tick())
   after=f.read(task)
   self.assertEqual(result['action'],'deferred');self.assertEqual(after['total_errors'],0)
   self.assertEqual(after['slice_bytes'],before['slice_bytes']);self.assertIsNone(after['lease_token'])
   self.assertEqual(after['next_run_at'],160)
  finally:f.tearDown()

class LocalCloseTests(unittest.TestCase):
 def test_secondary_close_failure_keeps_original_and_closes_connection(self):
  from unittest.mock import Mock
  with tempfile.TemporaryDirectory() as root:
   media=LocalMedia(SimpleNamespace(db=None),root)
   response=SimpleNamespace(read=Mock(side_effect=IOError('original read error')),close=Mock(side_effect=RuntimeError('PRIVATE')))
   connection=SimpleNamespace(close=Mock())
   f={'operation_id':'a'*64,'staging_key':'sync/'+'a'*64,'source_version':'v','total_bytes':1,'committed_bytes':0,'part_bytes':65536}
   peer=SimpleNamespace(media=lambda *args:(connection,response))
   with self.assertLogs('teacher-site',level='WARNING') as logs:
    with self.assertRaisesRegex(IOError,'original read error'):media.store_part(f,{},peer,4096)
   connection.close.assert_called_once();self.assertNotIn('PRIVATE',''.join(logs.output))
   self.assertEqual(list(media.directory(f).glob('pending-*')),[])

 def test_http_error_closes_once_without_masking_request_error(self):
  from unittest.mock import Mock,patch
  from site_sync.transport.http import HTTPPeer
  connection=SimpleNamespace(request=Mock(side_effect=IOError('request failed')),close=Mock(side_effect=RuntimeError('PRIVATE')))
  with patch('http.client.HTTPSConnection',return_value=connection),self.assertLogs('teacher-site') as logs:
   with self.assertRaisesRegex(IOError,'request failed'):HTTPPeer('https://peer.invalid',bytes(32)).open({'kind':'candidates','version':'v'})
  connection.close.assert_called_once();self.assertNotIn('PRIVATE',''.join(logs.output))
