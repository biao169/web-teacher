"""Long recovery/dual-executor contract, independent of live Worker quotas."""
import asyncio,json,unittest
from pathlib import Path
from site_sync.adapters.sqlite import SQLite
from site_sync.adapters.d1 import D1
from site_sync.adapters.tasks import Tasks
from site_sync.tests.test_database import Binding
from site_sync.tests.schema_fixture import core_plan
from site_sync.deploy.schema import ensure
from site_sync.transport.protocol import request_headers,verify_request,encode
from site_sync.core.authority import AuthorizationError
run=asyncio.run

class RecoveryTests(unittest.TestCase):
    def test_many_expired_attempts_dual_executors_eventually_progress(self):
        db=SQLite()
        try:
            run(ensure(db,core_plan(Path(__file__).resolve().parents[2]/'database/schema.sql')))
            db.connection.execute("INSERT INTO sync_peers VALUES('p','https://peer.invalid','env:KEY','r',1)")
            main=Tasks(D1(Binding(db)),lease_seconds=10,platform='worker')
            extra=Tasks(D1(Binding(db)),lease_seconds=10,platform='worker')
            run(main.put_grant(grant_id='g',principal_id='admin',scope=['profiles'],can_write=True,can_delete=True))
            task=run(main.create(peer_id='p',grant_id='g',scope=['profiles'],operation_id='slow',mode='scheduled',now=100,settings={'fast_retries':1,'slice_bytes':4*1024*1024,'min_slice_bytes':4096,'slow_retry_seconds':60,'auto_shrink':True}))
            now=100
            for n in range(40):
                owner=main if n%2 else extra;other=extra if n%2 else main
                t=run(owner.claim(now));self.assertIsNotNone(t);self.assertIsNone(run(other.claim(now)))
                # No finish: emulate the durable state left by isolate termination.
                self.assertTrue(run(other.reconcile_one(now+10)))
                self.assertFalse(run(other.reconcile_one(now+10)))
                row=run(main.read(task['task_id']));self.assertEqual(row['status'],'waiting');now=row['next_run_at']
            self.assertEqual(row['no_progress_count'],40);self.assertEqual(row['slice_bytes'],4096)
            t=run(extra.claim(now));run(extra.add_item(t,item_id='p',module='profiles',record_id='p',source_version='v',now=now))
            run(main.reconcile_one(now+10));row=run(main.read(task['task_id']))
            self.assertEqual(row['no_progress_count'],0);self.assertEqual(row['write_authorized'],1)
            self.assertIsNotNone(run(extra.claim(row['next_run_at'])))
        finally:db.close()

    def test_long_task_renews_signature_without_renewing_revoked_authority(self):
        key=b'x'*32;body=encode({'kind':'manifest','task':'same-long-task'})
        old=request_headers(key,body,clock=lambda:100)
        with self.assertRaises(AuthorizationError):verify_request(key,old,body,clock=lambda:1000000)
        fresh=request_headers(key,body,clock=lambda:1000000)
        self.assertNotEqual(old['x-sync-nonce'],fresh['x-sync-nonce'])
        self.assertEqual(verify_request(key,fresh,body,clock=lambda:1000000),fresh['x-sync-nonce'])

    def test_native_rpc_termination_becomes_resource_retry(self):
        from site_sync.runtime.bridge import NativeBridge,NativeError
        class Binding:
            async def read(self,raw):raise RuntimeError('Worker exceeded CPU limit 1102')
        with self.assertRaises(NativeError) as error:run(NativeBridge(Binding(),None).read({'kind':'manifest'}))
        self.assertEqual(error.exception.kind,'resource')
