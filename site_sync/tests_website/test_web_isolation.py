import asyncio,time
from unittest.mock import patch,AsyncMock
from site_sync.tests_website.test_credentials_api import CredentialAPITests
from site_sync.integration.host import runtime,grant_id
run=asyncio.run
class WebIsolationTests(CredentialAPITests):
 def test_pending_and_running_tasks_are_not_resumed_by_pages(self):
  repo=runtime(self.r).repo;now=int(time.time())
  task=run(repo.create(peer_id='peer',grant_id=grant_id(self.r.p),scope=['news'],operation_id='isolation',now=now,mode='manual'))
  owner=run(repo.claim(now))
  run(self.r.sql.batch([("UPDATE sync_tasks SET discovery_cursor=? WHERE task_id=?",('["broken-checkpoint"]',task['task_id']))]))
  before=run(repo.read(task['task_id']))
  with patch('site_sync.integration.host.tick',new_callable=AsyncMock,side_effect=AssertionError('page tick')) as tick,patch('site_sync.runtime.service.Runtime.tick',new_callable=AsyncMock,side_effect=AssertionError('page runtime')) as rt,patch('site_sync.integration.worker_schedule.arm',new_callable=AsyncMock) as arm:
   for path in ['/','/en/profiles','/en/students','/en/publications','/en/projects','/en/news','/auth/login', '/admin/site-sync','/admin/site-sync/api/tasks','/admin/site-sync/api/tasks/'+task['task_id'],'/admin/site-sync/api/schedules']:
    response=self.client.get(path);self.assertEqual(response.status_code,200,(path,response.text[:200]))
   self.assertEqual(self.client.post('/admin/site-sync/api/tasks/'+task['task_id']+'/logs',json={},headers=self.headers).status_code,200)
   arm.assert_not_awaited();tick.assert_not_awaited();rt.assert_not_awaited()
  self.assertEqual(run(repo.read(task['task_id'])),before)
