import asyncio,unittest
from fastapi.testclient import TestClient
from backend.app.native.web import create_app
from site_sync.tests_website import test_integration as fixture
from site_sync.integration.credentials import save
from site_sync.integration.host import runtime
from site_sync.transport.protocol import encode,request_headers
run=asyncio.run
class RotationTests(unittest.TestCase):
    def test_same_runtime_new_key_and_signed_endpoint(self):
        f=fixture.IntegrationTests();f.setUp();self.addCleanup(f.tearDown)
        r=f.target;rt=runtime(r)
        old=run(rt.peer_factory({'peer_id':'peer'}))
        run(save(r,'cd'*32))
        new=run(rt.peer_factory({'peer_id':'peer'}))
        self.assertNotEqual(old.secret,new.secret)
        self.assertEqual(new.secret,bytes.fromhex('cd'*32))
        body=encode({'kind':'candidates','scope':['profiles'],'version':'catalog-v1'})
        with TestClient(create_app(lambda req:r),base_url=r.config.origin) as client:
            self.assertEqual(client.post('/sync/v1/read',content=body,headers=request_headers(old.secret,body)).status_code,403)
            self.assertEqual(client.post('/sync/v1/read',content=body,headers=request_headers(new.secret,body)).status_code,200)
