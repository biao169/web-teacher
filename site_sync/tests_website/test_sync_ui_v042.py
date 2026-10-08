import asyncio
from unittest.mock import patch,AsyncMock
from site_sync.tests_website.test_credentials_api import CredentialAPITests
from site_sync.core.selection import RESTORE_SCOPES
from site_sync.integration.host import configure
run=asyncio.run
class SyncUI042(CredentialAPITests):
 def test_scope_cards_and_delete_endpoint_with_csrf(self):
  run(configure(self.r,{'origin':'https://peer.example','enabled':True}))
  page=self.client.get('/admin/site-sync')
  self.assertEqual(page.status_code,200)
  self.assertIn('data-auto-refresh',page.text)
  self.assertRegex(page.text,r'/assets/site-sync/panel\.css\?v=0\.16\.\d+')
  options=self.client.get('/admin/site-sync/api/options').json()
  self.assertEqual(set(options['modules']),set(RESTORE_SCOPES))
  body={'schedule_id':None,'revision':None,'peer_id':'peer','scope':['restore_media_assets'],'interval_seconds':3600,'enabled':True}
  from types import SimpleNamespace
  from site_sync.integration.capabilities import published
  remote=SimpleNamespace(peer_factory=AsyncMock(return_value=SimpleNamespace(candidates=AsyncMock(return_value=run(published(self.r))))))
  with patch('site_sync.integration.host.runtime',return_value=remote):saved=self.client.post('/admin/site-sync/api/schedules',json=body,headers=self.headers)
  self.assertEqual(saved.status_code,200,saved.text)
  schedule=self.client.get('/admin/site-sync/api/schedules').json()['items'][0]
  url='/admin/site-sync/api/schedules/'+schedule['schedule_id']+'/delete'
  self.assertEqual(self.client.post(url,json={'revision':schedule['revision']}).status_code,403)
  with patch('site_sync.integration.worker_schedule.arm',new_callable=AsyncMock) as arm:
   deleted=self.client.post(url,json={'revision':schedule['revision']},headers=self.headers)
   self.assertEqual(deleted.status_code,200,deleted.text)
   arm.assert_not_awaited()
  self.assertEqual(self.client.get('/admin/site-sync/api/schedules').json()['items'],[])
