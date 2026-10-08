import asyncio
import unittest
from site_sync.tests.test_admin import AdminTests
from site_sync.core.authority import AuthorizationError,ConflictError
run=asyncio.run

class DeleteScheduleTests(AdminTests):
    def saved(self):
        run(self.admin.save_schedule(self.actor,self.schedule()))
        return run(self.admin.schedules(self.actor))['items'][0]
    def test_delete_preserves_tasks_and_blocks_stale_scheduler(self):
        s=self.saved();uid=self.create()
        run(self.admin.delete_schedule(self.actor,s['schedule_id'],{'revision':s['revision']}))
        self.assertEqual(self.task(uid)['task_id'],uid)
        self.assertEqual(run(self.admin.schedules(self.actor))['items'],[])
        with self.assertRaises((AuthorizationError,ConflictError)):
            run(self.repo.create(peer_id='peer',grant_id='g',scope=['news'],operation_id='stale-schedule',now=100,mode='scheduled',expected_schedule=s))
    def test_revision_and_owner_are_required(self):
        s=self.saved()
        for actor,revision in [(self.actor,'stale'),(self.other,s['revision'])]:
            with self.assertRaises(ConflictError):run(self.admin.delete_schedule(actor,s['schedule_id'],{'revision':revision}))
        self.assertEqual(len(run(self.admin.schedules(self.actor))['items']),1)
    def test_schedule_cannot_be_created_after_delete_without_active_task(self):
        s=self.saved();run(self.admin.delete_schedule(self.actor,s['schedule_id'],{'revision':s['revision']}))
        with self.assertRaises(AuthorizationError):run(self.repo.create(peer_id='peer',grant_id='g',scope=['news'],operation_id='deleted-schedule',now=100,mode='scheduled',expected_schedule=s))
        self.assertEqual(run(self.db.query('SELECT count(*) n FROM sync_tasks'))[0]['n'],0)

class D1DeleteScheduleTests(DeleteScheduleTests):d1=True
