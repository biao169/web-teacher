from site_sync.tests.schema_fixture import core_plan
import asyncio
import json
import re
from pathlib import Path
import tempfile
import unittest
from site_sync.adapters.sqlite import SQLite
from site_sync.adapters.d1 import D1
from site_sync.adapters.tasks import Tasks
from site_sync.adapters.staging import StagingStore
from site_sync.core.engine import Engine
from site_sync.core.authority import AuthorizationError,ConflictError,ResourceError
from site_sync.deploy.schema import Plan,ensure,Migration,objects,CATALOG
from site_sync.deploy.migrations import registered
from site_sync.tests.test_database import Binding

ROOT=Path(__file__).resolve().parents[2]
run=asyncio.run


class Clock:
    def __init__(self):self.now=100
    def __call__(self):return self.now
    def step(self,n=1):self.now+=n


class EngineTests(unittest.TestCase):
    use_d1=False
    def setUp(self):
        self.raw=SQLite();run(ensure(self.raw,core_plan(ROOT/'database/schema.sql')))
        self.binding=Binding(self.raw)
        self.db=D1(self.binding,backup_callback=self.raw.backup) if self.use_d1 else self.raw
        self.raw.connection.execute("INSERT INTO sync_peers VALUES('peer','https://peer.invalid','env:KEY','p1',1)")
        self.raw.connection.execute('INSERT INTO sync_grants VALUES(?,?,?,?,?,?,?,?)',('grant','admin','g1',1,'["news"]',1,1,0))
        self.raw.connection.execute('CREATE TABLE news(id TEXT PRIMARY KEY,body TEXT,version INTEGER)')
        self.clock=Clock();self.repo=Tasks(self.db,lease_seconds=10)
    def tearDown(self):self.raw.close()
    def create(self,mode='manual',operation='op'):
        return run(self.repo.create(peer_id='peer',grant_id='grant',scope=['news'],operation_id=operation,now=self.clock(),mode=mode))
    def read(self,task):return run(self.repo.read(task['task_id']))
    def claim(self):return run(self.repo.claim(self.clock()))
    def candidate(self,task,item='i'):
        return run(self.repo.add_item(task,item_id=item,module='news',record_id=item,source_version='v1',now=self.clock()))
    def prepared(self,mode='manual'):
        original=self.create(mode);task=self.claim();self.candidate(task)
        run(self.repo.advance(task,'await_confirmation',self.clock()));run(self.repo.finish(task,self.clock()))
        if mode!='scheduled':run(self.repo.confirm(task['task_id'],'grant',['i'],self.clock()))
        self.clock.step();return original
    def append(self,task):
        return run(StagingStore(self.db).append(task_id=task['task_id'],item_id='i',field='body',lease=task['lease_token'],grant_revision=task['grant_revision'],source_version='v1',expected_seq=task['progress_seq'],offset=0,data=b'abc',now=self.clock()))

    def test_create_idempotency_and_operation_conflict(self):
        a=self.create();b=self.create();self.assertEqual(a['task_id'],b['task_id'])
        with self.assertRaises(ConflictError):self.create('scheduled')

    def test_manual_waits_for_confirmation(self):
        original=self.create();task=self.claim();self.candidate(task)
        run(self.repo.advance(task,'await_confirmation',self.clock()));run(self.repo.finish(task,self.clock()))
        self.clock.step(100)
        self.assertIsNone(self.claim())
        self.assertEqual(self.read(original)['write_authorized'],0)

    def test_confirmation_replay_and_unknown_selection(self):
        original=self.create();task=self.claim();self.candidate(task)
        run(self.repo.advance(task,'await_confirmation',self.clock()));run(self.repo.finish(task,self.clock()))
        with self.assertRaises(ConflictError):run(self.repo.confirm(task['task_id'],'grant',['missing'],self.clock()))
        a=run(self.repo.confirm(task['task_id'],'grant',['i'],self.clock()))
        b=run(self.repo.confirm(task['task_id'],'grant',['i'],self.clock()))
        self.assertEqual(a['revision'],b['revision'])

    def test_single_global_lease_and_expiry_not_blindly_reclaimed(self):
        first=self.create();self.create(operation='op2')
        owned=self.claim();self.assertIsNotNone(owned)
        self.assertIsNone(self.claim())
        self.clock.step(10)
        self.assertTrue(run(self.repo.reconcile_one(self.clock())))
        self.assertFalse(run(self.repo.reconcile_one(self.clock())))
        self.assertEqual(self.read(owned)['total_errors'],1)

    def test_pause_fences_existing_writer_and_resume_waits_for_lease(self):
        original=self.prepared();task=self.claim()
        run(self.repo.pause(task['task_id'],'grant',self.clock()))
        with self.assertRaises(ValueError):self.append(task)
        with self.assertRaises(ConflictError):run(self.repo.resume(task['task_id'],'grant',self.clock()))
        self.clock.step(10);run(self.repo.resume(task['task_id'],'grant',self.clock()))
        self.assertIsNotNone(self.claim())
        with self.assertRaises(ValueError):self.append(task)

    def test_live_revocation_blocks_staging(self):
        self.prepared();task=self.claim()
        self.raw.connection.execute("UPDATE sync_grants SET enabled=0,revision='g2'")
        with self.assertRaises(ValueError):self.append(task)
        run(self.repo.finish(task,self.clock(),error='AuthorizationError'))
        self.assertEqual(self.read(task)['status'],'paused')

    def test_reauthorization_requires_confirmation(self):
        self.prepared();task=self.claim()
        run(self.repo.pause(task['task_id'],'grant',self.clock()))
        self.raw.connection.execute("UPDATE sync_grants SET revision='g2'")
        self.clock.step(10);run(self.repo.resume(task['task_id'],'grant',self.clock()))
        row=self.read(task);self.assertEqual(row['phase'],'await_confirmation');self.assertEqual(row['write_authorized'],0)

    def test_cancel_does_not_clear_active_lease(self):
        self.prepared();task=self.claim();self.append(task)
        run(self.repo.cancel(task['task_id'],'grant',self.clock()))
        self.assertIsNone(self.claim())
        self.assertEqual(self.read(task)['lease_token'],task['lease_token'])
        self.clock.step(10);clean=self.claim()
        self.assertEqual(clean['phase'],'cleanup')
        self.assertTrue(run(self.repo.cleanup_one(clean,self.clock())))
        run(self.repo.advance(clean,'done',self.clock()));run(self.repo.finish(clean,self.clock()))
        self.assertEqual(self.read(task)['status'],'cancelled')

    def test_lost_response_progress_reconciled_once(self):
        self.prepared();task=self.claim();self.append(task)
        before=self.read(task)['progress_seq'];self.clock.step(10)
        run(self.repo.reconcile_one(self.clock()));row=self.read(task)
        self.assertEqual(row['progress_seq'],before);self.assertEqual(row['no_progress_count'],0)
        self.assertEqual(row['total_errors'],1);self.assertFalse(run(self.repo.reconcile_one(self.clock())))

    def test_resource_error_shrinks_slice_and_slow_retry_keeps_grant(self):
        original=self.create();self.raw.connection.execute('UPDATE sync_tasks SET fast_retries=0')
        task=self.claim();run(self.repo.finish(task,self.clock(),error='ResourceError',resource=True))
        row=self.read(task);self.assertEqual(row['slice_bytes'],16384)
        self.assertEqual(row['next_run_at'],self.clock()+900);self.assertEqual(row['grant_enabled'],1)
        self.assertIsNone(self.claim())

    def test_apply_is_atomic_and_replay_does_not_write_twice(self):
        original=self.prepared();task=self.claim();self.append(task)
        run(self.repo.mark_staged(task,'i',3,self.clock()))
        run(self.repo.advance(task,'apply',self.clock()))
        statement=("INSERT INTO news VALUES('i','abc',1)",())
        self.assertTrue(run(self.repo.commit_item(task,'i',statement,self.clock())))
        self.assertFalse(run(self.repo.commit_item(task,'i',statement,self.clock())))
        self.assertEqual(self.raw.connection.execute('SELECT count(*) FROM news').fetchone()[0],1)

    def test_target_conflict_rolls_back_item_and_progress(self):
        self.prepared();task=self.claim();self.append(task)
        run(self.repo.mark_staged(task,'i',3,self.clock()));run(self.repo.advance(task,'apply',self.clock()))
        before=self.read(task)['progress_seq']
        with self.assertRaises(Exception):run(self.repo.commit_item(task,'i',("UPDATE news SET version=2 WHERE id='missing'",()),self.clock()))
        self.assertEqual(self.read(task)['progress_seq'],before)
        self.assertEqual(self.raw.connection.execute('SELECT status FROM sync_items').fetchone()[0],'staged')

    def test_engine_one_handler_per_tick_and_no_sleep(self):
        original=self.create();calls=[]
        async def discover(ctx):
            calls.append(ctx.task['task_id']);await ctx.add_item(item_id='i',module='news',record_id='i',source_version='v1')
            await ctx.advance('await_confirmation')
        engine=Engine(self.repo,{'discover':discover},self.clock)
        run(engine.tick());self.assertEqual(len(calls),1)
        self.clock.step(100);self.assertEqual(run(engine.tick())['action'],'idle')

    def test_scheduled_and_proposal_confirmation_rules(self):
        self.prepared('scheduled');task=self.claim()
        self.assertEqual(task['phase'],'transfer');self.assertEqual(task['write_authorized'],1)
        self.append(task)

    def test_foreign_grant_cannot_control_task(self):
        task=self.create()
        with self.assertRaises(AuthorizationError):run(self.repo.cancel(task['task_id'],'someone_else',self.clock()))

    def test_engine_hard_termination_leaves_recoverable_attempt(self):
        class Terminated(BaseException):pass
        original=self.create()
        async def handler(ctx):await ctx.add_item(item_id='i',module='news',record_id='i',source_version='v1');raise Terminated()
        engine=Engine(self.repo,{'discover':handler},self.clock)
        with self.assertRaises(Terminated):run(engine.tick())
        self.assertEqual(self.read(original)['status'],'running')
        self.clock.step(10);self.assertEqual(run(engine.tick())['action'],'reconciled')
        self.assertEqual(self.read(original)['no_progress_count'],0)

    def test_concurrent_claims_have_only_one_winner(self):
        self.create();self.create(operation='second')
        database=self.db
        class Delayed:
            async def query(self,*args):
                result=await database.query(*args);await asyncio.sleep(0);return result
            async def batch(self,*args):
                await asyncio.sleep(0);return await database.batch(*args)
        a=Tasks(Delayed());b=Tasks(Delayed())
        async def race():return await asyncio.gather(a.claim(self.clock()),b.claim(self.clock()))
        results=run(race());self.assertEqual(sum(r is not None for r in results),1)

    def test_full_scheduled_pipeline(self):
        original=self.create('scheduled')
        async def discover(ctx):
            await ctx.add_item(item_id='i',module='news',record_id='i',source_version='v1')
            await ctx.advance('await_confirmation')
        async def transfer(ctx):
            t=ctx.task
            await StagingStore(self.db).append(task_id=t['task_id'],item_id='i',field='body',lease=t['lease_token'],grant_revision=t['grant_revision'],source_version='v1',expected_seq=t['progress_seq'],offset=0,data=b'abc',now=self.clock())
            await self.repo.mark_staged(t,'i',3,self.clock());await ctx.advance('apply')
        async def apply(ctx):
            await ctx.commit_item('i',("INSERT INTO news VALUES('i','abc',1)",()))
            await ctx.advance('cleanup')
        async def cleanup(ctx):
            if not await self.repo.cleanup_one(ctx.task,self.clock()):await ctx.advance('done')
        engine=Engine(self.repo,{'discover':discover,'transfer':transfer,'apply':apply,'cleanup':cleanup},self.clock)
        for _ in range(8):run(engine.tick());self.clock.step()
        self.assertEqual(self.read(original)['status'],'done')
        self.assertEqual(self.raw.connection.execute('SELECT count(*) FROM sync_parts').fetchone()[0],0)
        self.assertEqual(self.raw.connection.execute('SELECT count(*) FROM news').fetchone()[0],1)

    def test_many_progress_errors_use_real_task_checkpoints(self):
        task=self.create();self.raw.connection.execute('UPDATE sync_tasks SET fast_retries=0')
        counter=iter(range(40))
        async def discover(ctx):
            i=str(next(counter));await ctx.add_item(item_id=i,module='news',record_id=i,source_version='v1')
            raise ResourceError('1102')
        engine=Engine(self.repo,{'discover':discover},self.clock)
        for _ in range(40):
            run(engine.tick());self.clock.now=self.read(task)['next_run_at']
        row=self.read(task)
        self.assertEqual(row['no_progress_count'],0);self.assertEqual(row['total_errors'],40)
        self.assertEqual(row['progress_seq'],40);self.assertEqual(row['slice_bytes'],4096)

    def test_proposal_still_requires_receiver_confirmation(self):
        self.prepared('proposal');task=self.claim()
        self.assertEqual(task['mode'],'proposal');self.assertEqual(task['write_authorized'],1)

    def test_live_grant_api_invalidates_existing_task(self):
        original=self.create()
        run(self.repo.put_grant(grant_id='grant',principal_id='admin',scope=['news'],can_write=False,can_delete=False))
        self.assertIsNone(self.claim());self.assertEqual(self.read(original)['status'],'paused')

    def test_unauthorized_delete_not_selected_for_schedule(self):
        self.raw.connection.execute('UPDATE sync_grants SET can_delete=0')
        self.create('scheduled');task=self.claim()
        run(self.repo.add_item(task,item_id='d',module='news',record_id='d',source_version='v1',action='delete',now=self.clock()))
        self.assertEqual(self.raw.connection.execute('SELECT selected FROM sync_items').fetchone()[0],0)

    def test_body_cleanup_required_before_done(self):
        self.prepared();task=self.claim();self.append(task)
        self.raw.connection.execute("UPDATE sync_tasks SET phase='cleanup'")
        with self.assertRaises(Exception):run(self.repo.advance(task,'done',self.clock()))

    def test_lost_business_commit_response_does_not_duplicate(self):
        self.prepared();task=self.claim();self.append(task)
        run(self.repo.mark_staged(task,'i',3,self.clock()));run(self.repo.advance(task,'apply',self.clock()))
        stmt=("INSERT INTO news VALUES('i','abc',1)",())
        original_batch=self.db.batch
        if self.use_d1:self.binding.lose=True
        else:
            async def lose_response(statements):
                await original_batch(statements)
                raise RuntimeError('local response lost after commit')
            self.db.batch=lose_response
        with self.assertRaises(RuntimeError):run(self.repo.commit_item(task,'i',stmt,self.clock()))
        self.db.batch=original_batch
        self.clock.step(10);run(self.repo.reconcile_one(self.clock()));self.clock.now=self.read(task)['next_run_at']
        new=self.claim();self.assertFalse(run(self.repo.commit_item(new,'i',stmt,self.clock())))
        self.assertEqual(self.raw.connection.execute('SELECT count(*) FROM news').fetchone()[0],1)

    def test_conflict_pauses_engine_instead_of_retrying(self):
        task=self.create()
        async def handler(ctx):raise ConflictError('source changed')
        run(Engine(self.repo,{'discover':handler},self.clock).tick())
        self.assertEqual(self.read(task)['status'],'paused')

    def test_local_profile_and_no_progress_success(self):
        self.repo=Tasks(self.db,lease_seconds=10,platform='local')
        task=self.create();owned=self.claim()
        self.assertEqual(owned['fast_retries'],8);self.assertEqual(owned['slow_retry_seconds'],900)
        run(self.repo.finish(owned,self.clock(),error='NetworkError'))
        self.clock.step(5);owned=self.claim();run(self.repo.finish(owned,self.clock()))
        self.assertEqual(self.read(task)['no_progress_count'],1)

    def test_expired_grant_and_manual_delete_not_approved(self):
        original=self.create();task=self.claim()
        run(self.repo.add_item(task,item_id='d',module='news',record_id='d',source_version='v1',action='delete',now=self.clock()))
        run(self.repo.advance(task,'await_confirmation',self.clock()));run(self.repo.finish(task,self.clock()))
        self.raw.connection.execute('UPDATE sync_grants SET can_delete=0')
        with self.assertRaises(AuthorizationError):run(self.repo.confirm(task['task_id'],'grant',['d'],self.clock()))
        self.raw.connection.execute('UPDATE sync_grants SET expires_at=?',(self.clock(),))
        with self.assertRaises(AuthorizationError):self.create(operation='new-expired')


class D1EngineTests(EngineTests):
    use_d1=True


class MigrationTests(unittest.TestCase):
    def test_legacy_schema_is_not_silently_reinitialized(self):
        old=json.loads((ROOT/'site_sync/deploy/schema_v1.json').read_text())
        db=SQLite()
        try:
            for name,sql in sorted(old.items(),key=lambda x:x[1][1]!='table'):
                db.connection.execute(re.sub(r'([<>!=]) ([=>])',r'\1\2',' '.join(sql)))
            db.connection.execute('INSERT INTO sync_schema(singleton,version) VALUES(1,1)')
            db.connection.execute("INSERT INTO sync_peers VALUES('p','https://peer.invalid','env:KEY','r',1)")
            db.connection.execute("INSERT INTO sync_tasks(task_id,peer_id,peer_revision,direction,grant_revision,scope_json,created_at,operation_id) VALUES('old','p','r','pull','g','[]',0,'old-op')")
            plan=core_plan(ROOT/'database/schema.sql')
            before=list(db.connection.iterdump())
            with self.assertRaises(ValueError):run(ensure(db,plan,migrations=registered(plan)))
            self.assertEqual(list(db.connection.iterdump()),before)
        finally:db.close()


if __name__=='__main__':unittest.main()
