import asyncio,json,unittest,io
from types import SimpleNamespace
from site_sync.tests_website import test_integration as fixture
from site_sync.integration.host import configure,runtime,grant_id
from site_sync.integration.website import TeacherWebsite
from site_sync.integration.database import adapter
from site_sync.integration.clone import SCOPE,check_source
run=asyncio.run
class FullCloneTests(unittest.TestCase):
 def setUp(self):
  self.f=fixture.IntegrationTests();self.f.setUp();self.addCleanup(self.f.tearDown)
  self.source,self.target=self.f.source,self.f.target
  encoded=run(self.source.passwords.hash('SourcePassword123'))
  run(self.source.sql.batch([('UPDATE auth_users SET password_hash=?',(encoded,))]))
  run(adapter(self.source).batch([('PRAGMA defer_foreign_keys=ON',()),("UPDATE auth_users SET uid='source-admin'",()),("UPDATE auth_sessions SET user_uid='source-admin'",()),("UPDATE sync_connections SET owner_uid='source-admin'",()),('DELETE FROM sync_grants',())]))
  self.source.p=run(self.source.auth.principal('test-token'))
  run(configure(self.source,{'origin':'https://peer.example','enabled':True}))
 def drive(self,limit=2500):
  source=TeacherWebsite(adapter(self.source),self.source)
  class Peer:
   async def candidates(_,q):return await check_source(source,q) if q['kind']=='clone_check' else await source.source_candidates(q)
   async def manifest(_,i):return await source.snapshot(dict(kind='manifest',module=i['module'],record=i['record_id'],version=i['source_version'],task=i['task_id']))
   async def slice(_,i,field,offset,length):return await source.source_read(dict(kind='slice',module=i['module'],record=i['record_id'],version=i['source_version'],task=i['task_id'],field=field,offset=offset,length=length,snapshot_hash=json.loads(i['manifest_json'])['snapshot_hash']))
   def media(_,i,f,offset,length):
    row=run(self.source.sql.query('SELECT object_key FROM media_assets WHERE uid=?',(f['source_file_id'],)))[0]
    h=self.source.media_store.path(row['object_key']).open('rb');h.seek(offset)
    return SimpleNamespace(close=lambda:None),h
  rt=runtime(self.target);clock=[100];rt.clock=lambda:clock[0];rt.engine.clock=rt.clock
  async def factory(t):return Peer()
  rt.peer_factory=factory
  task=run(rt.repo.create(peer_id='peer',grant_id=grant_id(self.target.p),scope=[SCOPE],operation_id='clone',mode='manual',auto_confirm=True,auto_delete=True,now=100))
  for _ in range(limit):
   row=run(rt.repo.read(task['task_id']))
   if row['status']=='done':return row
   if row['status']=='paused' or row['total_errors']>2:
    logs=run(rt.db.query('SELECT detail FROM sync_events WHERE task_id=? ORDER BY event_id DESC LIMIT 1',(row['task_id'],)))
    self.fail(str(row['last_error'])+' '+str(logs))
   clock[0]=max(clock[0]+1,row['next_run_at'],row['lease_until'])
   run(rt.tick())
  self.fail('Clone did not finish '+str(run(rt.repo.read(task['task_id']))))
 def test_accounts_content_unreferenced_media_and_target_prune(self):
  run(self.source.sql.batch([("INSERT INTO news(uid,title,slug,content) VALUES('source-news','Source','source','hello')",())]))
  run(self.target.sql.batch([("INSERT INTO news(uid,title,slug,content) VALUES('extra-news','Remove me','source','extra')",())]))
  for uid,data in [('unreferenced',b'not referenced anywhere'),('empty',b'')]:
   path=self.source.media_store.path(uid+'.bin');path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
   run(self.source.sql.batch([("INSERT INTO media_assets(uid,object_key,title,mime_type,size,storage_kind,status) VALUES(?,?,?,'application/octet-stream',?,'local','active')",(uid,uid+'.bin',uid,len(data)))]))
  run(self.source.sql.batch([("INSERT INTO profiles(uid,name,avatar_key,bio) VALUES('teacher','Teacher','unreferenced.bin',?)",('long content '*20000,)),("INSERT INTO site_settings(uid,site_name,is_active) VALUES('source-settings','Source',1)",())]))
  run(self.target.sql.batch([("INSERT INTO site_settings(uid,site_name,is_active) VALUES('target-settings','Target',1)",())]))
  old=self.target.media_store.path('old-avatar.bin');old.parent.mkdir(parents=True,exist_ok=True);old.write_bytes(b'old')
  run(self.target.sql.batch([("INSERT INTO media_assets(uid,object_key,title,mime_type,size,storage_kind,status) VALUES('unreferenced','old-avatar.bin','old','application/octet-stream',3,'local','active')",()),("INSERT INTO profiles(uid,name,avatar_key) VALUES('teacher','Old','old-avatar.bin')",())]))
  row=self.drive();self.assertEqual(row['phase'],'done')
  self.assertEqual([r['uid'] for r in run(self.target.sql.query('SELECT uid FROM news'))],['source-news'])
  users=run(self.target.sql.query('SELECT * FROM auth_users'));self.assertTrue(run(self.target.passwords.verify('SourcePassword123',users[0]['password_hash'])))
  self.assertEqual(run(self.target.sql.query('SELECT count(*) n FROM auth_sessions'))[0]['n'],0)
  for asset in run(self.target.sql.query('SELECT * FROM media_assets')):
   expected=b'' if asset['uid']=='empty' else b'not referenced anywhere'
   self.assertEqual(self.target.media_store.path(asset['object_key']).read_bytes(),expected)
  self.assertFalse(run(self.target.sql.query("SELECT * FROM service_meta WHERE key='sync:clone-lock'")))
  self.assertEqual(run(self.target.sql.query('SELECT owner_uid FROM sync_connections')),[{'owner_uid':'source-admin'}])
  self.assertEqual(row['grant_id'],'website:source-admin')
  self.assertEqual(run(self.target.sql.query('PRAGMA foreign_key_check')),[])
  self.assertEqual(run(self.target.sql.query("SELECT kind FROM sync_events WHERE kind='clone-complete'")),[{'kind':'clone-complete'}])
  profile=run(self.target.sql.query('SELECT * FROM profiles'))[0]
  self.assertEqual(profile['bio'],'long content '*20000)
  self.assertTrue(self.target.media_store.path(profile['avatar_key']).is_file())
  self.assertEqual(run(self.target.sql.query('SELECT uid FROM site_settings')),[{'uid':'source-settings'}])
 def test_discovery_exceeds_old_500_limit(self):
  for offset in range(0,510,20):
   run(self.source.sql.batch([("INSERT INTO news(uid,title,slug) VALUES(?,?,?)",(f'n{i:04}',str(i),f's{i}')) for i in range(offset,min(offset+20,510))]))
  source=TeacherWebsite(adapter(self.source),self.source);cursor=None;records=[]
  for _ in range(700):
   page=run(source.source_candidates({'scope':[SCOPE],'cursor':cursor}))
   if page['item'] is None:break
   records.append(page['item']['id']);cursor=page['cursor']
  self.assertEqual(len([x for x in records if x.startswith('news:')]),510)
  self.assertEqual(len(records),len(set(records)))
 def test_source_change_rejected(self):
  import hashlib
  from site_sync.integration.clone import inventory,inventory_version
  from site_sync.transport.protocol import encode
  from site_sync.core.authority import ConflictError
  source=TeacherWebsite(adapter(self.source),self.source)
  version=inventory_version(run(inventory(source.db)))
  run(self.source.sql.batch([("INSERT INTO news(uid,title,slug) VALUES('later','later','later')",())]))
  with self.assertRaises(ConflictError):run(check_source(source,{'expected':version}))
 def test_previous_schema_upgrade_preserves_durable_parts(self):
  import sqlite3
  from site_sync.integration.migration import definitions
  from backend.app.native.database import Database
  path=self.f.root/'previous.db';c=sqlite3.connect(path)
  for sql in definitions('teacher-v0.16.021.json').values():c.execute(sql)
  c.execute("INSERT INTO sync_schema VALUES(1,4,0)")
  c.execute("INSERT INTO profiles(uid,name) VALUES('keep','Keep')")
  c.execute("INSERT INTO sync_peers VALUES('p','https://peer.invalid','env:KEY','r1',1)")
  c.execute("INSERT INTO sync_grants VALUES('g','admin','g1',1,'[\"news\"]',1,1,0)")
  c.execute("INSERT INTO sync_tasks(task_id,peer_id,peer_revision,direction,phase,status,grant_id,grant_revision,scope_json,created_at,operation_id) VALUES('t','p','r1','pull','transfer','ready','g','g1','[\"news\"]',1,'op')")
  c.execute("INSERT INTO sync_items(task_id,item_id,module,record_id,action,source_version,apply_key,staged_bytes) VALUES('t','i','news','n','upsert','v1','apply1',3)")
  c.execute("INSERT INTO sync_parts VALUES('t','i','payload',0,x'616263')")
  c.commit();c.close();db=Database(path);db.initialize();db.initialize()
  self.assertEqual(run(db.query('SELECT data FROM sync_parts')),[{'data':b'abc'}])
  self.assertEqual(run(db.query('SELECT name FROM profiles')),[{'name':'Keep'}])
  self.assertEqual(len(list(self.f.root.glob('previous.db.before-v0.16.022-*'))),1)
  run(db.batch([('UPDATE sync_items SET staged_bytes=1048576',())]))
  self.assertEqual(run(db.query('PRAGMA foreign_key_check')),[])
 def test_clone_lock_blocks_edits_but_allows_monitoring(self):
  from backend.app.native.web import create_app
  from fastapi.testclient import TestClient
  rt=runtime(self.target)
  task=run(rt.repo.create(peer_id='peer',grant_id=grant_id(self.target.p),scope=[SCOPE],operation_id='lock',mode='manual',auto_confirm=True,auto_delete=True,now=100))
  run(self.target.sql.batch([("UPDATE sync_tasks SET phase='apply',status='ready' WHERE task_id=?",(task['task_id'],)),("INSERT INTO service_meta VALUES('sync:clone-lock',?)",(task['task_id'],))]))
  with TestClient(create_app(lambda req:self.target),base_url=self.target.config.origin) as client:
   client.cookies.set(self.target.config.name('session'),'test-token')
   self.assertEqual(client.post('/api/admin/records/news',json={}).status_code,409)
   self.assertEqual(client.get('/admin/site-sync/api/tasks').status_code,200)
   self.assertNotEqual(client.get('/').status_code,409)
 def test_push_requires_one_whole_task_approval(self):
  from site_sync.integration.proposals import receive
  import time
  now=int(time.time())
  result=run(receive(self.target,dict(kind='proposal',version='proposal-v1',request_id='full-clone-push',scope=[SCOPE])))
  self.assertTrue(result['approval_required']);repo=runtime(self.target).repo
  task=run(repo.claim(now));self.assertIsNotNone(task)
  run(repo.add_item(task,item_id='meta',module=SCOPE,record_id='00meta',source_version='v1',now=now))
  run(repo.advance(task,'await_confirmation',now));run(repo.finish(task,now))
  for _ in range(2):
   row=run(repo.confirm(task['task_id'],grant_id(self.target.p),['*'],now))
   self.assertEqual(row['phase'],'transfer');self.assertEqual(row['write_authorized'],1)
  self.assertEqual(run(repo.db.query('SELECT selected FROM sync_items')),[{'selected':1}])
 def test_clone_monitor_exposes_only_safe_state(self):
  from site_sync.admin.service import Admin,Actor
  rt=runtime(self.target);gid=grant_id(self.target.p)
  task=run(rt.repo.create(peer_id='peer',grant_id=gid,scope=[SCOPE],operation_id='monitor',mode='manual',auto_confirm=True,now=100))
  run(self.target.sql.batch([('INSERT INTO service_meta VALUES(?,?)',('sync:clone-state:'+task['task_id'],json.dumps({'phase':'restore','table':2,'after':'secret-marker'}))),('INSERT INTO service_meta VALUES(?,?)',('sync:clone:'+task['task_id']+':auth_users:private',json.dumps({'password_hash':'never-return-this'})))]))
  detail=run(Admin(rt.repo,lambda:100).detail(Actor(self.target.p['uid'],gid),task['task_id']))
  self.assertEqual(detail['clone']['table'],'students');self.assertEqual(detail['clone']['completed_tables'],2)
  self.assertNotIn('never-return-this',json.dumps(detail));self.assertNotIn('secret-marker',json.dumps(detail))
