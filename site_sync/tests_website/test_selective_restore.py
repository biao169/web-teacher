"""Signed selective restores against two complete website databases."""
import json,unittest
from . import test_clone_acceptance as fixture
from .test_full_clone import run
from site_sync.core.selection import RESTORE_SCOPES,normalize,meta_record
from site_sync.integration.host import grant_id,secret
from site_sync.integration.proposals import receive
from site_sync.transport.protocol import encode,request_headers
from site_sync.runtime.schedules import Schedules

class SelectiveRestoreTests(unittest.TestCase):
 setUp=fixture.CloneAcceptanceTests.setUp
 reopen=fixture.CloneAcceptanceTests.reopen
 drive=fixture.CloneAcceptanceTests.drive
 def create(self,scope,mode='manual'):
  return run(self.rt.repo.create(peer_id='peer',grant_id=grant_id(self.target.p),scope=scope,operation_id='selective',mode=mode,auto_confirm=True,now=self.clock[0]))['task_id']
 def test_media_only_signed_retry_retains_accounts_and_unselected_content(self):
  self.fail_slice=True
  uid=self.create(['restore_media_assets']);reopened=[False]
  def hook(row):
   if self.failed and not reopened[0]:self.reopen();reopened[0]=True
  row=self.drive(uid,hook)
  self.assertEqual(row['status'],'done');self.assertTrue(reopened[0])
  self.assertEqual(run(self.target.sql.query('SELECT uid FROM news')),[{'uid':'target'}])
  self.assertIsNotNone(run(self.target.auth.principal('test-token')))
  asset=run(self.target.sql.query('SELECT object_key FROM media_assets'))[0]
  self.assertEqual(self.target.media_store.path(asset['object_key']).read_bytes(),b'example media'*7000)
  self.assertFalse(run(self.target.sql.query("SELECT * FROM service_meta WHERE key='sync:clone-lock'")))
 def test_selected_news_schedule_adds_dependencies_and_preserves_extra_rows(self):
  run(self.source.sql.batch([("INSERT INTO students(uid,name,avatar_key) VALUES('student','Student','acceptance.bin')",()),("UPDATE news SET related_student_uid='student',cover_key='acceptance.bin' WHERE uid='source'",())]))
  schedules=Schedules(self.rt.repo)
  run(schedules.put(schedule_id='selected',peer_id='peer',grant_id=grant_id(self.target.p),scope=['restore_news'],interval_seconds=3600,now=self.clock[0]))
  uid=run(schedules.tick(self.clock[0]))['task_id']
  self.assertEqual(set(json.loads(run(self.rt.repo.read(uid))['scope_json'])),set(normalize(['restore_news'])))
  self.assertEqual(self.drive(uid)['status'],'done')
  self.assertEqual({r['uid'] for r in run(self.target.sql.query('SELECT uid FROM news'))},{'source','target'})
  news=run(self.target.sql.query("SELECT related_student_uid,cover_key FROM news WHERE uid='source'"))[0]
  self.assertEqual(news['related_student_uid'],'student');self.assertTrue(self.target.media_store.path(news['cover_key']).is_file())
  self.assertEqual(run(self.target.sql.query('PRAGMA foreign_key_check')),[])
  self.assertIsNotNone(run(self.target.auth.principal('test-token')))
 def test_accounts_push_approves_once_and_does_not_transfer_media_or_news(self):
  result=run(receive(self.target,dict(kind='proposal',version='proposal-v1',request_id='selective-proposal',scope=['restore_auth_users'])))
  self.assertTrue(result['approval_required']);uid=result['task_id']
  self.assertEqual(set(json.loads(run(self.rt.repo.read(uid))['scope_json'])),{'restore_auth_users','restore_auth_roles','restore_auth_permissions'})
  self.assertEqual(self.drive(uid)['status'],'done')
  token=run(self.target.auth.login('admin','SourcePassword123','127.0.0.1'))
  self.assertEqual(run(self.target.auth.principal(token))['uid'],'source-admin')
  self.assertEqual(run(self.target.sql.query('SELECT uid FROM news')),[{'uid':'target'}])
  self.assertEqual(run(self.target.sql.query('SELECT uid FROM media_assets')),[])
  self.assertEqual(run(self.target.sql.query('PRAGMA foreign_key_check')),[])
 def test_all_individual_scopes_perform_full_clone(self):
  uid=self.create(list(RESTORE_SCOPES));self.assertEqual(self.drive(uid)['status'],'done')
  fixture.CloneAcceptanceTests.assert_restored(self,uid)
 def test_inventory_and_record_cannot_expand_export_authority(self):
  allowed=json.dumps(['restore_media_assets'])
  run(self.source.sql.batch([('UPDATE sync_connections SET export_scope_json=?',(allowed,)),('UPDATE sync_grants SET scopes_json=?',(allowed,))]))
  key=run(secret(self.target))
  for q in [dict(kind='manifest',module='restore_media_assets',record=meta_record(list(RESTORE_SCOPES)),version='v1'),dict(kind='manifest',module='restore_media_assets',record='auth_users:source-admin',version='v1'),dict(kind='clone_check',scope=list(RESTORE_SCOPES),expected='v1')]:
   body=encode(q);response=self.client.post('/sync/v1/read',content=body,headers=request_headers(key,body))
   self.assertEqual(response.status_code,403,response.text)
 def test_push_auto_approval_checks_expanded_scope(self):
  # An account-only allowlist must not implicitly authorize role/permission replacement.
  run(self.target.sql.batch([("UPDATE sync_connections SET incoming_auto_scope=?,incoming_auto_delete=1",(json.dumps(['restore_auth_users']),))]))
  result=run(receive(self.target,dict(kind='proposal',version='proposal-v1',request_id='selective-auto',scope=['restore_auth_users'])))
  self.assertTrue(result['approval_required'])
  run(self.rt.repo.cancel(result['task_id'],grant_id(self.target.p),self.clock[0]))
  self.assertEqual(self.drive(result['task_id'])['status'],'cancelled')
  run(self.target.sql.batch([('UPDATE sync_connections SET incoming_auto_scope=?',(json.dumps(normalize(['restore_auth_users'])),))]))
  result=run(receive(self.target,dict(kind='proposal',version='proposal-v1',request_id='selective-auto-allowed',scope=['restore_auth_users'])))
  self.assertFalse(result['approval_required'])
 def test_missing_dependency_permission_rejects_creation(self):
  from site_sync.core.authority import AuthorizationError
  run(self.target.sql.batch([('UPDATE sync_grants SET scopes_json=?',(json.dumps(['restore_news']),))]))
  with self.assertRaises(AuthorizationError):self.create(['restore_news'])
  self.assertEqual(run(self.target.sql.query('SELECT task_id FROM sync_tasks')),[])
