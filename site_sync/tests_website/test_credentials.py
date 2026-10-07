import asyncio,json,os,unittest,sqlite3
from unittest.mock import patch
from site_sync.tests_website import test_integration as fixture
from site_sync.integration import credentials as c
from backend.app.native.data_tools import BUSINESS
from backend.app.native.catalog import Error
from site_sync.integration.catalog import SCOPES
run=asyncio.run

class CredentialTests(unittest.TestCase):
    def setUp(self):
        self.f=fixture.IntegrationTests();self.f.setUp();self.addCleanup(self.f.tearDown)
        self.r=self.f.target
    def test_generation_and_validation(self):
        self.assertNotEqual(c.generate(),c.generate())
        self.assertEqual(len(c.generate()),64)
        self.assertEqual(c.normalize(' '+ 'AB'*32+'\n'),'ab'*32)
        for value in ('',None,123,'g'*64,'ab '*32,'a'*63,'a'*65):
            with self.subTest(value=value),self.assertRaises(ValueError):c.normalize(value)
    def test_priority_rotation_and_redaction(self):
        self.assertEqual(run(c.resolve(self.r)).source,'environment')
        state=run(c.save(self.r,'cd'*32))
        self.assertNotIn('cd'*32,json.dumps(state))
        self.assertNotIn('cd'*32,repr(run(c.resolve(self.r))))
        self.assertEqual(run(c.require_secret(self.r)),bytes.fromhex('cd'*32))
        run(c.save(self.r,'ef'*32))
        self.assertEqual(run(c.require_secret(self.r)),bytes.fromhex('ef'*32))
        logs=run(self.r.sql.query('SELECT * FROM operation_logs'))
        self.assertNotIn('cd'*32,json.dumps(logs));self.assertNotIn('ef'*32,json.dumps(logs))
        self.assertNotIn('service_meta',BUSINESS);self.assertNotIn('service_meta',SCOPES)
    def test_missing_and_corruption_never_fallback(self):
        with patch.dict(os.environ,{'TEACHER_SYNC_KEY':''}):
            self.assertFalse(run(c.status(self.r))['configured'])
            with self.assertRaises(c.AuthorizationError):run(c.require_secret(self.r))
        run(self.r.sql.batch([('INSERT INTO service_meta VALUES(?,?)',(c.STORAGE_KEY,'bad'))]))
        with self.assertRaises(c.AuthorizationError):run(c.resolve(self.r))
    def test_empty_save_preserves_key(self):
        run(c.save(self.r,'cd'*32))
        with self.assertRaises(ValueError):run(c.save(self.r,''))
        self.assertEqual(run(c.require_secret(self.r)),bytes.fromhex('cd'*32))
    def test_non_admin_and_revoked_session_cannot_save(self):
        self.r.p['is_system']=False
        with self.assertRaises(Error):run(c.save(self.r,'cd'*32))
        self.r.p['is_system']=True
        run(self.r.sql.batch([("UPDATE auth_sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revoke_reason='logout'",())]))
        with self.assertRaises(sqlite3.IntegrityError):run(c.save(self.r,'cd'*32))
        self.assertEqual(run(self.r.sql.query('SELECT value FROM service_meta WHERE key=?',(c.STORAGE_KEY,))),[])

    def test_boolean_schema_version_rejected(self):
        record={'version':True,'key':'cd'*32,'revision':'r','updated_at':'now','updated_by':'admin'}
        run(self.r.sql.batch([('INSERT INTO service_meta VALUES(?,?)',(c.STORAGE_KEY,json.dumps(record)))]))
        with self.assertRaises(c.AuthorizationError):run(c.resolve(self.r))
