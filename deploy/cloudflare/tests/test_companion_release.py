"""Release API contract, interruption and credential isolation without cloud writes."""
import io,json,copy,tempfile,unittest
from pathlib import Path
from email.parser import BytesParser
from email import policy
from unittest.mock import patch
from urllib.error import HTTPError
from deploy.cloudflare.companion_release import Client,Release,APIError
from deploy.cloudflare.deploy_config import validate
from test_companion_artifacts import ArtifactTests


class Response(io.BytesIO):
    status=200

class FakeAPI:
    def __init__(self):self.scripts={};self.calls=[];self.fail=None
    def migration_tag(self,worker):return self.scripts[worker]['settings'].get('migration_tag')
    def credential_status(self,database):return 'missing'
    def request(self,method,name,suffix='',body=None,content_type=None,missing=False):
        self.calls.append((method,name,suffix))
        if self.fail==(method,suffix):raise APIError(403)
        if method=='GET' and suffix=='/settings':return copy.deepcopy(self.scripts.get(name,{}).get('settings'))
        if method=='PUT' and suffix=='':
            msg=BytesParser(policy=policy.default).parsebytes(('Content-Type: '+content_type+'\r\n\r\n').encode()+body)
            metadata=json.loads(next(p.get_payload(decode=True) for p in msg.iter_parts() if p.get_param('name',header='content-disposition')=='metadata'))
            previous=self.scripts.get(name,{}).get('settings',{}).get('bindings',[])
            if metadata.get('keep_bindings'):
                metadata['bindings'].extend(b for b in previous if b.get('type') in metadata['keep_bindings'] and b['name'] not in {x['name'] for x in metadata['bindings']})
            old_tag=self.scripts.get(name,{}).get('settings',{}).get('migration_tag')
            if metadata.get('migrations'):
                assert old_tag is None, 'migration must not be replayed'
                metadata['migration_tag']=metadata['migrations']['new_tag']
            elif old_tag:metadata['migration_tag']=old_tag
            self.scripts.setdefault(name,{})['settings']=metadata
            return {'id':'version-one'}
        obj=self.scripts[name]
        if method=='POST':obj['subdomain']=body;return body
        if suffix=='/subdomain':return obj['subdomain']
        if method=='PUT' and suffix=='/schedules':obj['schedules']={'schedules':body};return obj['schedules']
        if suffix=='/schedules':return obj.get('schedules',{'schedules':[]})
        raise AssertionError((method,name,suffix))


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.fixture=ArtifactTests();self.fixture.setUp();self.addCleanup(self.fixture.doCleanups)
        self.root=Path(self.fixture.tmp.name);self.stage=self.root/'stage';self.stage.mkdir();(self.stage/'sync-native').mkdir()
        self.fixture.write();(self.root/'native.multipart').write_bytes(self.fixture.path.read_bytes())
        (self.stage/'sync-native/wrangler.jsonc').write_text(json.dumps(self.fixture.cfg))
        self.env={'CLOUDFLARE_ACCOUNT_ID':'a'*32,'TEACHER_AUX_API_TOKEN':'sensitive-api-token','TEACHER_SYNC_KEY':'ab'*32,
                  'WRANGLER_CI_OVERRIDE_NAME':'teacher','WRANGLER_CI_MATCH_TAG':'keep-this-tag'}
        self.api=FakeAPI();self.logs=[]
    def release(self,mode='inline'):
        return Release(self.env,{'name':'teacher','sync_executor':mode},lambda *a,**kw:self.logs.append((a,kw)),client=self.api,sleep=lambda _:None)
    def add_executor_artifact(self):
        f=self.fixture
        f.cfg.pop('durable_objects');f.cfg.pop('migrations');f.meta['bindings']=[b for b in f.meta['bindings'] if b['name']!='SYNC_COORDINATOR']
        f.cfg['name']='teacher-sync-executor';f.cfg['compatibility_flags'].append('python_workers')
        f.meta['compatibility_flags'].append('python_workers');f.meta['main_module']='executor.py'
        f.parts=[('executor.py','text/x-python',b'pass'),('worker_runtime/sync_executor.py','text/x-python',b'pass'),
                 ('site_sync/integration/worker_schedule.py','text/x-python',b'pass'),
                 ('python_modules/workers_runtime_sdk/__init__.py','application/octet-stream',b'\x00\xff')]
        f.write();(self.root/'executor.multipart').write_bytes(f.path.read_bytes())
        (self.stage/'wrangler.sync-executor.jsonc').write_text(json.dumps(f.cfg))
    def test_first_and_repeated_inline_deploy_is_private_with_atomic_secret(self):
        release=self.release();release.preflight();release.prepare(self.stage,self.root);release.activate()
        script=self.api.scripts['teacher-sync-native'];self.assertEqual(script['subdomain'],{'enabled':False,'previews_enabled':False})
        self.assertEqual(script['schedules'],{'schedules':[]})
        bindings={b['name']:b for b in script['settings']['bindings']}
        self.assertEqual(bindings['TEACHER_SYNC_KEY']['text'],self.env['TEACHER_SYNC_KEY'])
        release.prepare(self.stage,self.root)
        self.assertEqual(len(self.api.scripts),1)
        self.assertFalse(any(name=='teacher' for _,name,_ in self.api.calls))
        self.assertNotIn('sensitive-api-token',repr(self.logs));self.assertNotIn('ab'*32,repr(self.logs))
        self.assertEqual(self.env['WRANGLER_CI_MATCH_TAG'],'keep-this-tag')
    def test_separate_activation_and_return_to_inline(self):
        self.add_executor_artifact();release=self.release('separate');release.prepare(self.stage,self.root)
        worker=self.api.scripts['teacher-sync-executor'];self.assertEqual(worker['schedules']['schedules'],[])
        release.activate();self.assertEqual(worker['schedules']['schedules'],[{'cron':'* * * * *'}])
        self.release().prepare(self.stage,self.root)
        self.assertEqual(worker['schedules']['schedules'],[])
        self.assertEqual(len(self.api.scripts),2)
    def test_unowned_name_is_rejected_before_upload(self):
        self.api.scripts['teacher-sync-native']={'settings':{'bindings':[]}}
        with self.assertRaisesRegex(ValueError,'ownership'):self.release().prepare(self.stage,self.root)
        self.assertTrue(all(method=='GET' for method,_,_ in self.api.calls))
    def test_permission_failure_stops_release(self):
        self.api.fail=('GET','/settings')
        with self.assertRaises(APIError):self.release().preflight()
        self.assertFalse(self.api.scripts)
    def test_privacy_failure_can_be_retried(self):
        self.api.fail=('POST','/subdomain')
        with self.assertRaises(APIError):self.release().prepare(self.stage,self.root)
        self.api.fail=None;self.release().prepare(self.stage,self.root)
        self.assertFalse(self.api.scripts['teacher-sync-native']['subdomain']['enabled'])
        self.assertEqual(sum(m=='PUT' and suffix=='' for m,_,suffix in self.api.calls),1)
    def test_boundary_changes_reuse_but_key_and_code_changes_upload(self):
        self.release().prepare(self.stage,self.root)
        path=self.root/'native.multipart'
        path.write_bytes(path.read_bytes().replace(b'test_boundary',b'another_boundary'))
        self.release().prepare(self.stage,self.root)
        uploads=lambda:sum(m=='PUT' and s=='' for m,_,s in self.api.calls)
        self.assertEqual(uploads(),1)
        self.env['TEACHER_SYNC_KEY']='cd'*32
        self.release().prepare(self.stage,self.root);self.assertEqual(uploads(),2)
        path.write_bytes(path.read_bytes().replace(b'export default {}',b'export default {newVersion:true}'))
        self.release().prepare(self.stage,self.root);self.assertEqual(uploads(),3)

    def test_wrong_uploaded_revision_stops_before_main_release(self):
        original=self.api.request
        def request(method,name,suffix='',*args,**kwargs):
            result=original(method,name,suffix,*args,**kwargs)
            if method=='PUT' and suffix=='':
                for binding in self.api.scripts[name]['settings']['bindings']:
                    if binding['name']=='TEACHER_AUX_REVISION':binding['text']='stale-artifact'
            return result
        self.api.request=request
        with self.assertRaisesRegex(ValueError,'AUX-CONFIG-CHECK not confirmed'):
            self.release().prepare(self.stage,self.root)
        self.assertFalse(any(args[0]=='AUX-READY' for args,kw in self.logs))

    def test_activation_failure_rerun_reuses_both_artifacts(self):
        self.add_executor_artifact();release=self.release('separate')
        release.prepare(self.stage,self.root);self.api.fail=('PUT','/schedules')
        with self.assertRaises(APIError):release.activate()
        self.api.fail=None;release=self.release('separate')
        release.prepare(self.stage,self.root);release.activate()
        self.assertEqual(sum(m=='PUT' and s=='' for m,_,s in self.api.calls),3)
        self.assertEqual(self.api.scripts['teacher-sync-executor']['schedules']['schedules'],[{'cron':'* * * * *'}])

    def test_optional_key_new_deploy_and_preserved_existing_secret(self):
        self.env.pop('TEACHER_SYNC_KEY')
        release=self.release();release.prepare(self.stage,self.root)
        self.assertFalse(any(b['name']=='TEACHER_SYNC_KEY' for b in self.api.scripts['teacher-sync-native']['settings']['bindings']))
        self.env['TEACHER_SYNC_KEY']='ab'*32;self.release().prepare(self.stage,self.root)
        del self.env['TEACHER_SYNC_KEY'];self.release().prepare(self.stage,self.root)
        bindings={b['name']:b for b in self.api.scripts['teacher-sync-native']['settings']['bindings']}
        self.assertEqual(bindings['TEACHER_SYNC_KEY']['text'],'ab'*32)
        self.add_executor_artifact();self.release('separate').prepare(self.stage,self.root)
        self.assertIn('teacher-sync-executor',self.api.scripts)

    def test_invalid_identity_or_credentials(self):
        for key,value in [('WRANGLER_CI_OVERRIDE_NAME','wrong'),('TEACHER_AUX_API_TOKEN',''),('CLOUDFLARE_ACCOUNT_ID','bad'),('TEACHER_SYNC_KEY','bad')]:
            with self.subTest(key=key),self.assertRaises(ValueError):validate(dict(self.env,**{key:value}),'teacher')

    def test_callback_delayed_reads_then_cron_delayed_reads(self):
        self.add_executor_artifact();release=self.release('separate');release.prepare(self.stage,self.root)
        original=self.api.request;remaining={'binding':0,'cron':0}
        def request(method,name,suffix='',*args,**kwargs):
            value=original(method,name,suffix,*args,**kwargs)
            if method=='PUT' and suffix=='':remaining['binding']=3
            if method=='PUT' and suffix=='/schedules':remaining['cron']=2
            if method=='GET' and suffix=='/settings' and remaining['binding']:
                remaining['binding']-=1
                value['bindings']=[b for b in value['bindings'] if b['name']!='SYNC_RUNNER']
            if method=='GET' and suffix=='/schedules' and remaining['cron']:
                remaining['cron']-=1;return {'schedules':[]}
            return value
        self.api.request=request;delays=[];release.sleep=delays.append;release.activate()
        self.assertEqual(delays,[1,2,4,1,2]);self.assertEqual(release.cron_status,'confirmed')
        self.assertEqual(release.activation_stage,'completed')
        self.assertNotIn(self.env['TEACHER_SYNC_KEY'],repr(self.logs))

    def test_permanent_mismatch_is_bounded_and_rerun_restores_cron(self):
        self.add_executor_artifact();release=self.release('separate');release.prepare(self.stage,self.root)
        original=self.api.request
        def request(method,name,suffix='',*args,**kwargs):
            value=original(method,name,suffix,*args,**kwargs)
            if method=='GET' and suffix=='/settings':
                for binding in value['bindings']:
                    if binding['name']=='SYNC_RUNNER':binding['service']='wrong-worker'
            return value
        self.api.request=request;delays=[];release.sleep=delays.append
        with self.assertRaisesRegex(ValueError,'AUX-CALLBACK-CHECK not confirmed'):release.activate()
        self.assertEqual(delays,[1,2,4,8,15])
        self.assertEqual(self.api.scripts['teacher-sync-executor']['schedules']['schedules'],[])
        self.assertEqual(self.logs[-1][1]['executor_cron'],'not_confirmed')
        self.assertFalse(self.logs[-1][1]['callback_confirmed'])
        self.api.request=original;release=self.release('separate');release.prepare(self.stage,self.root);release.activate()
        self.assertEqual(release.cron_status,'confirmed')

    def test_code_update_preserves_existing_callback(self):
        release=self.release();release.prepare(self.stage,self.root);release.activate()
        path=self.root/'native.multipart';path.write_bytes(path.read_bytes().replace(b'export default {}',b'export default {updated:true}'))
        release=self.release();release.prepare(self.stage,self.root)
        bindings=self.api.scripts['teacher-sync-native']['settings']['bindings']
        self.assertEqual([b['service'] for b in bindings if b['name']=='SYNC_RUNNER'],['teacher'])
        count=sum(m=='PUT' and s=='' for m,_,s in self.api.calls)
        release.activate()
        self.assertEqual(sum(m=='PUT' and s=='' for m,_,s in self.api.calls),count)

    def test_wrong_binding_type_is_not_accepted(self):
        from deploy.cloudflare.companion_release import callback,callback_view
        data={'bindings':[{'name':'SYNC_RUNNER','type':'secret_text','service':'teacher','text':'never-log-me'}]}
        self.assertFalse(callback(data,'teacher'))
        self.assertNotIn('never-log-me',repr(callback_view(data)))

    def test_cron_unconfirmed_never_reports_active(self):
        self.add_executor_artifact();release=self.release('separate');release.prepare(self.stage,self.root)
        original=self.api.request
        def request(method,name,suffix='',*args,**kwargs):
            result=original(method,name,suffix,*args,**kwargs)
            if method=='GET' and suffix=='/schedules':return {'schedules':[]}
            return result
        self.api.request=request
        with self.assertRaisesRegex(ValueError,'AUX-CRON-CHECK not confirmed'):release.activate()
        self.assertTrue(release.callback_confirmed)
        self.assertEqual(release.cron_status,'written_unconfirmed')
        self.assertEqual(self.logs[-1][1]['stage'],'executor_cron')
        self.assertFalse(any(a[0]=='AUX-ACTIVE' for a,kw in self.logs))

    def test_prepare_retries_stale_release_and_revision(self):
        cfg=json.loads((self.stage/'sync-native/wrangler.jsonc').read_text())
        cfg['vars']['TEACHER_RELEASE']='0.16.070'
        self.fixture.cfg=cfg
        self.fixture.meta['bindings'].append({'name':'TEACHER_RELEASE','type':'plain_text','text':'0.16.070'})
        self.fixture.write();(self.root/'native.multipart').write_bytes(self.fixture.path.read_bytes())
        (self.stage/'sync-native/wrangler.jsonc').write_text(json.dumps(cfg))
        original=self.api.request;remaining=[2]
        def request(method,name,suffix='',*args,**kwargs):
            result=original(method,name,suffix,*args,**kwargs)
            if method=='GET' and suffix=='/settings' and result and remaining[0]:
                remaining[0]-=1
                for b in result['bindings']:
                    if b['name']=='TEACHER_RELEASE':b['text']='0.16.069'
                    if b['name']=='TEACHER_AUX_REVISION':b['text']='stale'
            return result
        self.api.request=request;release=self.release();delays=[];release.sleep=delays.append
        release.prepare(self.stage,self.root)
        self.assertEqual(delays,[1,2])
        checks=[kw for a,kw in self.logs if a[0]=='AUX-CONFIG-CHECK']
        self.assertEqual(checks[0]['actual']['release']['actual'],'0.16.069')
        self.assertFalse(checks[0]['actual']['revision_match'])
        self.assertTrue(checks[-1]['confirmed'])

    def test_config_view_redacts_values_and_checks_types(self):
        from deploy.cloudflare.companion_release import configuration_view
        cfg={'vars':{'TEACHER_RELEASE':'0.16.070','OTHER':'sensitive-value'}}
        actual={'bindings':[{'name':'TEACHER_RELEASE','type':'secret_text','text':'secret-value'},
                            {'name':'OTHER','type':'plain_text','text':'unexpected-sensitive'}]}
        view=configuration_view(actual,cfg,'sensitive-hash',True)
        self.assertIsNone(view['release']['actual'])
        self.assertEqual(len(view['differences']),3)
        for text in ('sensitive-value','secret-value','unexpected-sensitive','sensitive-hash'):
            self.assertNotIn(text,repr(view))


class ClientTests(unittest.TestCase):
    def test_exact_endpoint_and_token_with_bounded_retry(self):
        class Opener:
            def __init__(self):self.calls=[]
            def open(self,req,timeout):
                self.calls.append(req)
                if len(self.calls)==1:raise HTTPError(req.full_url,503,'',{},io.BytesIO(b'{"success":false}'))
                return Response(b'{"success":true,"result":{"ok":true}}')
        opener=Opener();client=Client('a'*32,'token',opener=opener,sleep=lambda _:None)
        self.assertEqual(client.request('PUT','teacher-sync-native',body=b'raw',content_type='multipart/form-data; boundary=x'),{'ok':True})
        req=opener.calls[-1];self.assertEqual(req.data,b'raw');self.assertEqual(req.get_header('Authorization'),'Bearer token')
        self.assertEqual(req.full_url,'https://api.cloudflare.com/client/v4/accounts/'+'a'*32+'/workers/scripts/teacher-sync-native')
    def test_unauthorized_is_not_absence_and_never_echoes_response(self):
        class Opener:
            def open(self,req,timeout):raise HTTPError(req.full_url,403,'',{},io.BytesIO(b'{"success":false,"errors":[{"code":10000,"message":"secret-echo"}]}'))
        client=Client('a'*32,'token',opener=Opener())
        with self.assertRaises(APIError) as result:client.request('GET','teacher-sync-native','/settings',missing=True)
        self.assertNotIn('secret-echo',str(result.exception));self.assertEqual(result.exception.status,403)
    def test_unknown_404_not_accepted_as_new_worker(self):
        class Opener:
            def open(self,req,timeout):raise HTTPError(req.full_url,404,'',{},io.BytesIO(b'{"success":false,"errors":[]}'))
        with self.assertRaises(APIError):Client('a'*32,'token',opener=Opener()).request('GET','teacher','/settings',missing=True)
