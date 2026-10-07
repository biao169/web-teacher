"""Read-only cloud configuration diagnostics with platform API responses."""
import copy,unittest
from cloud_check import check
from test_companion_release import FakeAPI

class CloudCheckTests(unittest.TestCase):
    def run_check(self,mode='inline',break_main=False):
        api=FakeAPI()
        for role,name in [('main','teacher'),('native','teacher-sync-native'),('executor','teacher-sync-executor')]:
            if role=='executor' and mode=='inline':continue
            bindings=[{'name':'DB','id':'database'},{'name':'MEDIA','bucket_name':'media'},
                      {'name':'TEACHER_SYNC_KEY','type':'secret_text'},
                      {'name':'SYNC_NATIVE','service':'teacher-sync-native'}]
            if role=='main':
                bindings.extend([{'name':'TEACHER_SYNC_EXECUTOR_MODE','text':mode},
                                 {'name':'TRANSFER_COORDINATOR','class_name':'TransferCoordinator'}])
                if break_main:bindings.pop()
            else:bindings.extend([{'name':'TEACHER_AUX_OWNER','type':'plain_text','text':'teacher'},
                                  {'name':'TEACHER_AUX_ROLE','type':'plain_text','text':role}])
            api.scripts[name]={'settings':{'bindings':bindings},'subdomain':{'enabled':False,'previews_enabled':False},
                              'schedules':{'schedules':[] if role=='native' else [{'cron':'* * * * *'}]}}
        before=copy.deepcopy(api.scripts)
        result=check({},dict(name='teacher',sync_executor=mode,database='database',bucket='media'),lambda *a,**k:None,client=api)
        self.assertEqual(api.scripts,before)
        self.assertTrue(all(m=='GET' for m,_,_ in api.calls))
        self.assertEqual(result['runtime_execution'],'not_checked')
        return result
    def test_both_modes_read_only(self):
        for mode in ('inline','separate'):
            with self.subTest(mode=mode):self.assertTrue(self.run_check(mode)['passed'])
    def test_missing_durable_object_reports_failure(self):
        result=self.run_check(break_main=True)
        self.assertFalse(result['passed'])
        self.assertIn('transfer_coordinator_missing',result['workers'][0]['problems'])
