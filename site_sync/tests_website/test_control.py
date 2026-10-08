import asyncio,time,unittest
from unittest.mock import patch
from site_sync.tests_website.test_credentials_api import CredentialAPITests
from site_sync.integration.host import runtime,grant_id,tick
from site_sync.transport.protocol import encode,request_headers
from site_sync.integration.control import paused
run=asyncio.run
URL='/api/admin/site-sync/control'
class ControlTests(CredentialAPITests):
 def test_pause_fences_claim_and_export_without_changing_task_intent(self):
  rt=runtime(self.r);now=int(time.time())
  task=run(rt.repo.create(peer_id='peer',grant_id=grant_id(self.r.p),scope=['news'],operation_id='pause-test',now=now,mode='manual'))
  self.assertEqual(self.client.post(URL,json={'paused':True}).status_code,403)
  response=self.client.post(URL,json={'paused':True},headers=self.headers)
  self.assertEqual(response.status_code,200,response.text);self.assertTrue(response.json()['paused'])
  self.assertIsNone(run(rt.repo.claim(now)))
  self.assertEqual(run(tick(self.r))['action'],'disabled')
  self.assertEqual(run(rt.repo.read(task['task_id']))['status'],'ready')
  q=encode({'kind':'probe','scope':['news'],'version':'probe-v1'})
  response=self.client.post('/sync/v1/read',content=q,headers=request_headers(bytes.fromhex('6a'*32),q))
  self.assertEqual(response.status_code,503);self.assertEqual(response.headers['x-sync-error'],'SYNC_PAUSED')
  self.assertEqual(self.client.get('/').status_code,200)
  self.assertEqual(self.client.get('/admin/site-sync').status_code,200)
  response=self.client.post(URL,json={'paused':False},headers=self.headers)
  self.assertFalse(response.json()['paused']);self.assertIsNotNone(run(rt.repo.claim(now)))
 def test_active_owner_drains_and_manual_pause_is_preserved(self):
  rt=runtime(self.r);now=int(time.time())
  task=run(rt.repo.create(peer_id='peer',grant_id=grant_id(self.r.p),scope=['news'],operation_id='drain',now=now,mode='manual'))
  owner=run(rt.repo.claim(now))
  response=self.client.post(URL,json={'paused':True},headers=self.headers)
  self.assertEqual(response.json()['active_leases'],1)
  self.assertEqual(run(rt.repo.read(task['task_id']))['lease_token'],owner['lease_token'])
  run(rt.repo.finish(owner,now))
  self.assertEqual(self.client.get(URL).json()['active_leases'],0)
  run(rt.repo.pause(task['task_id'],grant_id(self.r.p),now))
  self.client.post(URL,json={'paused':False},headers=self.headers)
  self.assertEqual(run(rt.repo.read(task['task_id']))['status'],'paused')
 def test_environment_override_and_validation(self):
  with patch.dict('os.environ',{'TEACHER_SYNC_PAUSED':'1'}):
   result=self.client.post(URL,json={'paused':False},headers=self.headers).json()
   self.assertTrue(result['paused']);self.assertTrue(result['environment_paused'])
  self.assertEqual(self.client.post(URL,json={'paused':'true'},headers=self.headers).status_code,400)
  self.client.cookies.clear();self.assertEqual(self.client.get(URL).status_code,401)
