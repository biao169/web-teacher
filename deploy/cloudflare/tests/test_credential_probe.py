import io,json,sqlite3,unittest
from companion_release import Client
from credential_probe import SQL
class ProbeTests(unittest.TestCase):
    def test_sql_returns_only_status_and_is_read_only(self):
        with sqlite3.connect(':memory:') as db:
            db.execute('CREATE TABLE service_meta(key TEXT PRIMARY KEY,value TEXT)')
            self.assertEqual(db.execute(SQL).fetchone()[0],'missing')
            valid={'version':1,'key':'cd'*32,'revision':'r','updated_at':'now','updated_by':'admin'}
            for value,state in [('broken','invalid'),('{}','invalid'),(json.dumps(valid),'valid'),(json.dumps(dict(valid,version=True)),'invalid'),(json.dumps(dict(valid,key='g'*64)),'invalid')]:
                db.execute('INSERT OR REPLACE INTO service_meta VALUES(?,?)',('site_sync.credentials.v1',value))
                changed=db.total_changes
                self.assertEqual(db.execute(SQL).fetchone(),(state,))
                self.assertEqual(db.total_changes,changed)
    def test_fixed_d1_api_contract(self):
        class Response(io.BytesIO):status=200
        class Opener:
            def open(self,req,timeout):
                self.req=req
                return Response(b'{"success":true,"result":[{"success":true,"results":[{"state":"valid"}]}]}')
        opener=Opener();client=Client('a'*32,'token',opener=opener)
        self.assertEqual(client.credential_status('12345678-1234-1234-1234-123456789abc'),'valid')
        self.assertIn('/d1/database/',opener.req.full_url)
        self.assertEqual(json.loads(opener.req.data),{'sql':SQL})
