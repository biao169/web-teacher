import asyncio,json,unittest,os
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app.native.web import create_app
from site_sync.tests_website import test_integration as fixture
from site_sync.integration.credentials_api import PREFIX
from site_sync.integration import credentials
run=asyncio.run

class CredentialAPITests(unittest.TestCase):
    def setUp(self):
        self.f=fixture.IntegrationTests();self.f.setUp();self.addCleanup(self.f.tearDown)
        self.r=self.f.target
        self.client=TestClient(create_app(lambda req:self.r),base_url=self.r.config.origin)
        self.client.__enter__();self.addCleanup(self.client.__exit__,None,None,None)
        self.client.cookies.set(self.r.config.name('session'),'test-token')
        self.headers={'x-csrf-token':self.r.p['csrf'],'origin':self.r.config.origin}
    def check(self,response,code):
        self.assertEqual(response.status_code,code,response.text)
        self.assertIn('no-store',response.headers['cache-control'])
        self.assertNotIn('6a'*32,response.text)
    def test_status_save_and_explicit_reveal(self):
        response=self.client.get(PREFIX);self.check(response,200)
        self.assertEqual(response.json()['source'],'environment')
        self.assertNotIn('key',response.json())
        saved=self.client.post(PREFIX,json={'key':'CD'*32},headers=self.headers);self.check(saved,200)
        self.assertNotIn('cd'*32,saved.text)
        self.assertEqual(saved.json()['runtime_integration'],'active')
        read=self.client.post(PREFIX+'/reveal',json={},headers=self.headers);self.check(read,200)
        self.assertEqual(read.json()['key'],'cd'*32)
        logs=run(self.r.sql.query("SELECT * FROM operation_logs WHERE action LIKE 'sync-key-%'"))
        self.assertEqual([x['action'] for x in logs],['sync-key-save','sync-key-reveal'])
        self.assertNotIn('cd'*32,json.dumps(logs))
    def test_csrf_origin_get_and_anonymous(self):
        for route in (PREFIX,PREFIX+'/reveal'):
            self.check(self.client.post(route,json={}),403)
            self.check(self.client.post(route,json={},headers=dict(self.headers,origin='https://hostile.invalid')),403)
        self.check(self.client.get(PREFIX+'/reveal'),405)
        self.client.cookies.clear()
        self.check(self.client.get(PREFIX),401)
        self.check(self.client.post(PREFIX+'/reveal',json={},headers=self.headers),401)
    def test_permissions_and_session_revocation(self):
        run(self.r.sql.batch([("UPDATE auth_permissions SET can_edit=0 WHERE module='data_tools'",())]))
        self.check(self.client.get(PREFIX),403)
        self.check(self.client.post(PREFIX+'/reveal',json={},headers=self.headers),403)
        run(self.r.sql.batch([("UPDATE auth_sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revoke_reason='logout'",())]))
        self.check(self.client.get(PREFIX),401)
    def test_invalid_body_and_failure_redaction(self):
        for value in ('','secret-input',None):
            self.check(self.client.post(PREFIX,json={'key':value},headers=self.headers),400)
        self.check(self.client.post(PREFIX,content='{"key":"a","key":"b"}',headers=dict(self.headers,**{'content-type':'application/json'})),422)
        self.check(self.client.post(PREFIX,json={'key':'a'*2048},headers=self.headers),413)
        with patch.object(credentials,'save',side_effect=RuntimeError('6a'*32)):
            self.check(self.client.post(PREFIX,json={'key':'cd'*32},headers=self.headers),503)
        with patch.object(credentials,'reveal',side_effect=RuntimeError('6a'*32)):
            self.check(self.client.post(PREFIX+'/reveal',json={},headers=self.headers),503)

    def test_non_system_admin_denied(self):
        run(self.r.sql.batch([("UPDATE auth_roles SET is_system=0",())]))
        self.check(self.client.get(PREFIX),403)
        self.check(self.client.post(PREFIX,json={'key':'cd'*32},headers=self.headers),403)
        self.check(self.client.post(PREFIX+'/reveal',json={},headers=self.headers),403)

    def test_configure_in_admin_without_environment_key(self):
        with patch.dict(os.environ,{'TEACHER_SYNC_KEY':''}):
            response=self.client.get(PREFIX);self.check(response,200)
            self.assertFalse(response.json()['configured'])
            response=self.client.post(PREFIX,json={'key':'cd'*32},headers=self.headers);self.check(response,200)
            self.assertEqual(response.json()['source'],'database')
            response=self.client.post('/api/admin/site-sync/connection',json={'origin':'https://peer.example','enabled':True},headers=self.headers)
            self.assertEqual(response.status_code,200)
            self.assertEqual(run(credentials.require_secret(self.r)),bytes.fromhex('cd'*32))
