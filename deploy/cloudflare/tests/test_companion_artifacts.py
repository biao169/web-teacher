"""API payload fidelity and unsafe/incomplete artifact rejection, without uploads."""
import copy,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from deploy.cloudflare.companions import inspect_artifact,upload_request,names

class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/'upload.multipart'
        self.cfg={'name':'teacher-sync-native','main':'worker.mjs','workers_dev':False,'preview_urls':False,
                  'compatibility_date':'2026-09-14','compatibility_flags':['global_fetch_strictly_public'],
                  'vars':{'TEACHER_MEDIA_PREFIX':'media/'},'d1_databases':[{'binding':'DB','database_id':'id'}],
                  'r2_buckets':[{'binding':'MEDIA','bucket_name':'media'}]}
        self.cfg.update(durable_objects={'bindings':[{'name':'SYNC_COORDINATOR','class_name':'SyncCoordinator'}]},migrations=[{'tag':'teacher-sync-alarm-v1','new_sqlite_classes':['SyncCoordinator']}])
        self.meta={'main_module':'worker.js','compatibility_date':'2026-09-14','compatibility_flags':['global_fetch_strictly_public'],
                   'bindings':[{'name':'DB','type':'d1','id':'id'},{'name':'MEDIA','type':'r2_bucket','bucket_name':'media'},
                               {'name':'TEACHER_MEDIA_PREFIX','type':'plain_text','text':'media/'}]}
        self.meta['bindings'].append({'name':'SYNC_COORDINATOR','type':'durable_object_namespace','class_name':'SyncCoordinator'})
        self.parts=[('worker.js','application/javascript+module',b'export default {}'),('binary.bin','application/octet-stream',b'\x00\xff\r\n\x80')]
    def write(self):
        items=[('metadata','application/json',json.dumps(self.meta).encode()),*self.parts]
        raw=b''
        for name,mime,body in items:
            raw+=b'--test_boundary\r\n'+f'Content-Disposition: form-data; name="{name}"\r\nContent-Type: {mime}\r\n\r\n'.encode()+body+b'\r\n'
        raw+=b'--test_boundary--\r\n';self.path.write_bytes(raw);return raw
    def test_original_binary_body_and_explicit_api_target(self):
        original=self.write()
        with patch.dict('os.environ',{'WRANGLER_CI_OVERRIDE_NAME':'teacher','WRANGLER_CI_MATCH_TAG':'main-identity'}):
            req=upload_request(self.path,self.cfg,'teacher','native','a'*32,'test-token')
        self.assertEqual(req.data,original)
        self.assertEqual(req.method,'PUT')
        self.assertEqual(req.full_url,'https://api.cloudflare.com/client/v4/accounts/'+'a'*32+'/workers/scripts/teacher-sync-native')
        self.assertEqual(req.get_header('Content-type'),'multipart/form-data; boundary=test_boundary')
        info=inspect_artifact(self.path,self.cfg,'teacher','native')
        self.assertNotIn('test-token',json.dumps(info));self.assertEqual(info['cloud_upload'],'not_run')
    def test_wrong_target_never_constructs_request(self):
        self.write();self.cfg['name']='teacher'
        with self.assertRaisesRegex(ValueError,'target'):upload_request(self.path,self.cfg,'teacher','native','a'*32,'test')
    def test_missing_entrypoint(self):
        self.meta['main_module']='missing.js';self.write()
        with self.assertRaisesRegex(ValueError,'Entrypoint'):inspect_artifact(self.path,self.cfg,'teacher','native')
    def test_truncation_and_duplicates(self):
        self.write();self.path.write_bytes(self.path.read_bytes()[:-20])
        with self.assertRaisesRegex(ValueError,'Truncated'):inspect_artifact(self.path,self.cfg,'teacher','native')
        self.parts.append(self.parts[0]);self.write()
        with self.assertRaisesRegex(ValueError,'duplicated'):inspect_artifact(self.path,self.cfg,'teacher','native')
    def test_secret_or_website_binding_rejected(self):
        self.meta['bindings'].append({'name':'KEY','type':'secret_text','text':'hidden'});self.write()
        with self.assertRaisesRegex(ValueError,'secret binding'):inspect_artifact(self.path,self.cfg,'teacher','native')
    def test_resource_binding_drift(self):
        self.meta['bindings'][0]['id']='other';self.write()
        with self.assertRaisesRegex(ValueError,'bindings differ'):inspect_artifact(self.path,self.cfg,'teacher','native')
    def test_python_dependencies_required(self):
        self.cfg.pop('durable_objects');self.cfg.pop('migrations');self.meta['bindings']=[b for b in self.meta['bindings'] if b['name']!='SYNC_COORDINATOR']
        self.cfg['name']='teacher-sync-executor';self.cfg['compatibility_flags'].append('python_workers')
        self.meta['compatibility_flags'].append('python_workers');self.meta['main_module']='executor.py'
        self.parts=[('executor.py','text/x-python',b'pass'),('worker_runtime/sync_executor.py','text/x-python',b'pass'),
                    ('site_sync/integration/worker_schedule.py','text/x-python',b'pass')];self.write()
        with self.assertRaisesRegex(ValueError,'dependencies missing'):inspect_artifact(self.path,self.cfg,'teacher','executor')
        self.parts.append(('python_modules/workers_runtime_sdk/__init__.py','application/octet-stream',b''));self.write()
        self.assertEqual(inspect_artifact(self.path,self.cfg,'teacher','executor')['artifact_validation'],'passed')
    def test_long_names_are_stable_and_bounded(self):
        for value in names('a'*63).values():self.assertLessEqual(len(value),63)
        self.assertNotEqual(names('a'*62+'b'),names('a'*63))
