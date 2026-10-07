"""Two real website schemas and signed ASGI peer calls; no cloud quota simulation."""
import asyncio,io,json,time,unittest
from types import SimpleNamespace
from fastapi.testclient import TestClient
from backend.app.native.web import create_app
from site_sync.tests_website import test_full_clone as clone_fixture
from site_sync.integration.host import runtime,grant_id,secret
from site_sync.integration.credentials import save
from site_sync.integration.proposals import receive
from site_sync.runtime.schedules import Schedules
from site_sync.transport.protocol import encode,request_headers,verify_response
from site_sync.core.authority import ResourceError,ConflictError,AuthorizationError
run=asyncio.run
class CloneAcceptanceTests(unittest.TestCase):
 def setUp(self):
  clone_fixture.FullCloneTests.setUp(self)
  self.client=TestClient(create_app(lambda req:self.source),base_url=self.source.config.origin)
  self.client.__enter__();self.addCleanup(self.client.__exit__,None,None,None)
  run(self.source.sql.batch([("INSERT INTO news(uid,title,slug,content) VALUES('source','Source','source',?)",('正文'*18000,))]))
  run(self.target.sql.batch([("INSERT INTO news(uid,title,slug) VALUES('target','Target','target')",())]))
  data=b'example media'*7000
  path=self.source.media_store.path('acceptance.bin');path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
  run(self.source.sql.batch([("INSERT INTO media_assets(uid,object_key,title,mime_type,size,storage_kind,status) VALUES('asset','acceptance.bin','file','application/octet-stream',?,'local','active')",(len(data),))]))
  self.clock=[int(time.time())];self.fail_slice=False;self.failed=False;self.calls=0
  self.reopen()
 def reopen(self):
  self.rt=runtime(self.target);self.rt.clock=lambda:self.clock[0];self.rt.engine.clock=self.rt.clock
  owner=self
  class Peer:
   async def read(self,q):
    if q['kind']=='slice' and owner.fail_slice and not owner.failed:
     owner.failed=True;raise ResourceError('Injected resource exhaustion')
    body=encode(q);key=await secret(owner.target);headers=request_headers(key,body)
    response=owner.client.post('/sync/v1/read',content=body,headers=headers);owner.calls+=1
    if response.status_code==409:raise ConflictError('Peer conflict')
    if response.status_code==403:raise AuthorizationError('Peer authorization denied')
    if response.status_code!=200:raise OSError('Peer HTTP '+str(response.status_code))
    verify_response(key,headers['x-sync-nonce'],200,response.headers,response.content,stream=q['kind']=='media')
    return response.content
   async def candidates(self,q):return json.loads(await self.read(q))
   async def manifest(self,i):return json.loads(await self.read(dict(kind='manifest',module=i['module'],record=i['record_id'],version=i['source_version'],task=i['task_id'])))
   async def slice(self,i,field,offset,length):return await self.read(dict(kind='slice',module=i['module'],record=i['record_id'],version=i['source_version'],task=i['task_id'],field=field,offset=offset,length=length,snapshot_hash=json.loads(i['manifest_json'])['snapshot_hash']))
   def media(self,i,f,offset,length):
    q=dict(kind='media',module=i['module'],record=i['record_id'],version=f['source_version'],record_version=i['source_version'],task=i['task_id'],file=f['source_file_id'],offset=offset,length=length,total=f['total_bytes'],snapshot_hash=json.loads(i['manifest_json'])['snapshot_hash'])
    # Local media adapter invokes this on a worker thread, outside the event loop.
    return SimpleNamespace(close=lambda:None),io.BytesIO(run(self.read(q)))
  async def factory(t):return Peer()
  self.rt.peer_factory=factory
 def start(self,mode):
  gid=grant_id(self.target.p);now=self.clock[0]
  if mode=='proposal':
   result=run(receive(self.target,dict(kind='proposal',version='proposal-v1',request_id='acceptance-proposal',scope=['site_clone'])))
   self.assertTrue(result['approval_required']);return result['task_id']
  if mode=='scheduled':
   s=Schedules(self.rt.repo);run(s.put(schedule_id='clone-plan',peer_id='peer',grant_id=gid,scope=['site_clone'],interval_seconds=3600,now=now))
   return run(s.tick(now))['task_id']
  return run(self.rt.repo.create(peer_id='peer',grant_id=gid,scope=['site_clone'],operation_id='acceptance',mode='manual',auto_confirm=True,now=now))['task_id']
 def drive(self,uid,hook=None,expect_pause=False):
  approved=False
  for n in range(1800):
   row=run(self.rt.repo.read(uid))
   if row['status'] in ('done','cancelled') or (expect_pause and row['status']=='paused'):return row
   self.assertNotEqual(row['status'],'paused',str(run(self.rt.db.query('SELECT detail FROM sync_events WHERE task_id=? ORDER BY event_id DESC LIMIT 2',(uid,)))));self.assertLess(row['total_errors'],3,str(run(self.rt.db.query('SELECT detail FROM sync_events WHERE task_id=? ORDER BY event_id DESC LIMIT 2',(uid,)))))
   if row['phase']=='await_confirmation':
    self.assertFalse(approved);run(self.rt.repo.confirm(uid,grant_id(self.target.p),['*'],self.clock[0]));approved=True
   if hook:hook(row)
   self.clock[0]=max(self.clock[0]+1,row['created_at'],row['next_run_at'],row['lease_until'])
   run(self.rt.tick())
  self.fail('Task stalled')
 def assert_restored(self,uid):
  self.assertEqual(run(self.target.sql.query('SELECT uid FROM news')),[{'uid':'source'}])
  self.assertIsNone(run(self.target.auth.principal('test-token')))
  token=run(self.target.auth.login('admin','SourcePassword123','127.0.0.1'))
  principal=run(self.target.auth.principal(token));self.assertEqual(principal['uid'],'source-admin')
  asset=run(self.target.sql.query('SELECT object_key FROM media_assets'))[0]
  self.assertEqual(self.target.media_store.path(asset['object_key']).read_bytes(),b'example media'*7000)
  self.assertEqual(run(self.target.sql.query('PRAGMA foreign_key_check')),[])
  self.assertEqual(run(self.rt.repo.read(uid))['grant_id'],'website:source-admin')
 def test_manual_signed_clone_resource_retry_restart_rotation_and_login(self):
  self.fail_slice=True;uid=self.start('manual');changed=[False]
  def hook(row):
   if not changed[0] and run(self.rt.db.query('SELECT 1 FROM sync_parts WHERE task_id=? LIMIT 1',(uid,))):
    changed[0]=True;before=row['progress_seq']
    run(save(self.source,'ab'*32));run(save(self.target,'ab'*32));self.reopen()
    self.assertEqual(run(self.rt.repo.read(uid))['progress_seq'],before)
  done=self.drive(uid,hook);self.assertTrue(changed[0]);self.assertTrue(self.failed);self.assertGreater(done['total_errors'],0);self.assertLess(done['slice_bytes'],done['initial_slice_bytes']);self.assert_restored(uid)
  self.assertEqual(run(secret(self.target)),bytes.fromhex('ab'*32))
 def test_scheduled_signed_clone_and_schedule_ownership(self):
  uid=self.start('scheduled');self.drive(uid);self.assert_restored(uid)
  self.assertEqual(run(self.target.sql.query('SELECT grant_id FROM sync_schedules')),[{'grant_id':'website:source-admin'}])
  next_run=run(self.target.sql.query('SELECT next_run_at FROM sync_schedules'))[0]['next_run_at']
  result=run(Schedules(self.rt.repo).tick(max(self.clock[0]+1,next_run)))
  self.assertEqual(result['action'],'scheduled');self.assertNotEqual(result['task_id'],uid)
 def test_push_one_approval_signed_clone_and_login(self):
  uid=self.start('proposal');self.drive(uid);self.assert_restored(uid)
 def test_cancel_transfer_cleans_parts_without_overwriting_target(self):
  uid=self.start('manual');cancelled=[False]
  def hook(row):
   if not cancelled[0] and run(self.rt.db.query('SELECT 1 FROM sync_parts WHERE task_id=? LIMIT 1',(uid,))):
    cancelled[0]=True;run(self.rt.repo.cancel(uid,grant_id(self.target.p),self.clock[0]))
  done=self.drive(uid,hook);self.assertEqual(done['status'],'cancelled')
  self.assertEqual(run(self.target.sql.query('SELECT uid FROM news')),[{'uid':'target'}])
  self.assertEqual(run(self.target.sql.query('SELECT count(*) n FROM sync_parts')),[{'n':0}])
  self.assertIsNotNone(run(self.target.auth.principal('test-token')))

 def test_cancel_apply_retains_published_media_and_releases_lock(self):
  uid=self.start('manual');cancelled=[False];published=[]
  def hook(row):
   assets=run(self.target.sql.query('SELECT object_key FROM media_assets'))
   if not cancelled[0] and assets:
    cancelled[0]=True;published.extend(assets)
    run(self.rt.repo.cancel(uid,grant_id(self.target.p),self.clock[0]))
  done=self.drive(uid,hook);self.assertEqual(done['status'],'cancelled');self.assertTrue(published)
  self.assertTrue(self.target.media_store.path(published[0]['object_key']).is_file())
  self.assertFalse(run(self.target.sql.query("SELECT 1 FROM service_meta WHERE key='sync:clone-lock'")))
  self.assertIsNotNone(run(self.target.auth.principal('test-token')))
 def test_source_business_change_stops_before_target_restore(self):
  uid=self.start('manual');changed=[False]
  def hook(row):
   if not changed[0] and row['phase']=='apply':
    changed[0]=True;run(self.source.sql.batch([("UPDATE news SET title='Changed',updated_at='2090-01-01T00:00:00.000Z' WHERE uid='source'",())]))
  done=self.drive(uid,hook,expect_pause=True);self.assertEqual(done['status'],'paused')
  self.assertEqual(run(self.target.sql.query('SELECT uid FROM news')),[{'uid':'target'}])
  self.assertIsNotNone(run(self.target.auth.principal('test-token')))
