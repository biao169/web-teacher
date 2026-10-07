from site_sync.tests.schema_fixture import core_plan
import asyncio
from dataclasses import replace
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from site_sync.adapters.sqlite import SQLite
from site_sync.adapters.d1 import D1
from site_sync.adapters.staging import StagingStore
from site_sync.deploy.schema import Plan, Migration, ensure, CATALOG, objects

ROOT = Path(__file__).resolve().parents[2]
run = asyncio.run


class Prepared:
    def __init__(self, owner, sql, args=()): self.owner,self.sql,self.args = owner,sql,args
    def bind(self,*args): return Prepared(self.owner,self.sql,tuple(bytes(v) if isinstance(v,list) else v for v in args))
    async def all(self): return {'success': True, 'results': await self.owner.db.query(self.sql,self.args)}


class Binding:
    """Contract double only, not a Cloudflare or Pyodide emulator."""
    def __init__(self, db): self.db=db;self.lose=False
    def prepare(self, sql): return Prepared(self,sql)
    async def batch(self, statements):
        result=await self.db.batch([(s.sql,s.args) for s in statements])
        if self.lose:
            self.lose=False
            raise RuntimeError('response lost after commit')
        return result


class SchemaTests(unittest.TestCase):
    def setUp(self):
        self.db=SQLite(); self.plan=core_plan(ROOT/'database/schema.sql')
    def tearDown(self): self.db.close()

    def test_init_repeat_and_plan_roundtrip(self):
        self.assertEqual(run(ensure(self.db,self.plan))['action'],'initialized')
        self.assertEqual(run(ensure(self.db,Plan.load(self.plan.dump())))['action'],'unchanged')

    def test_check_only_does_not_initialize(self):
        with self.assertRaises(ValueError):run(ensure(self.db,self.plan,check_only=True))
        self.assertEqual(run(self.db.query(CATALOG)),[])

    def test_business_tables_preserved_and_backed_up(self):
        self.db.connection.execute('CREATE TABLE teachers(name TEXT)')
        self.db.connection.execute("INSERT INTO teachers VALUES('teacher')")
        self.assertIsNotNone(run(ensure(self.db,self.plan))['backup'])
        self.assertEqual(run(self.db.query('SELECT name FROM teachers')),[{'name':'teacher'}])

    def test_unknown_sync_table_is_not_overwritten(self):
        self.db.connection.execute('CREATE TABLE sync_tasks(legacy TEXT)')
        with self.assertRaises(ValueError):run(ensure(self.db,self.plan))
        self.assertEqual(len(run(self.db.query(CATALOG))),1)

    def test_drift_is_rejected(self):
        run(ensure(self.db,self.plan))
        self.db.connection.execute('DROP INDEX sync_tasks_due')
        with self.assertRaises(ValueError):run(ensure(self.db,self.plan))

    def test_failed_initialization_rolls_back_all_ddl(self):
        broken=replace(self.plan,statements=(*self.plan.statements,'INSERT INTO missing_table VALUES(1)'))
        with self.assertRaises(sqlite3.Error):run(ensure(self.db,broken))
        self.assertEqual(run(self.db.query(CATALOG)),[])
        self.assertEqual(run(ensure(self.db,self.plan))['action'],'initialized')

    def test_explicit_future_migration_preserves_data_and_can_repeat(self):
        # Synthetic future revision, not a claim that step 1 had a released schema.
        run(ensure(self.db,self.plan))
        self.db.connection.execute("INSERT INTO sync_peers VALUES('p','https://peer.invalid','env:KEY','r1',1)")
        reference=SQLite();run(ensure(reference,self.plan))
        reference.connection.execute('ALTER TABLE sync_peers ADD COLUMN label TEXT')
        nextplan=replace(self.plan,version=5,expected=objects(run(reference.query(CATALOG))))
        reference.close()
        migration=Migration(self.plan.version,self.plan.expected,('ALTER TABLE sync_peers ADD COLUMN label TEXT',))
        self.assertEqual(run(ensure(self.db,nextplan,migrations=(migration,)))['action'],'upgraded')
        self.assertEqual(run(ensure(self.db,nextplan))['action'],'unchanged')
        self.assertEqual(run(self.db.query('SELECT peer_id FROM sync_peers')),[{'peer_id':'p'}])

    def test_failed_upgrade_rolls_back_version_and_ddl(self):
        run(ensure(self.db,self.plan))
        future=replace(self.plan,version=5)
        migration=Migration(self.plan.version,self.plan.expected,('ALTER TABLE sync_peers ADD COLUMN label TEXT','INSERT INTO missing VALUES(1)'))
        with self.assertRaises(sqlite3.Error):run(ensure(self.db,future,migrations=(migration,)))
        self.assertEqual(run(ensure(self.db,self.plan))['action'],'unchanged')

    def test_lost_init_receipt_recovers_from_schema(self):
        binding=Binding(self.db); binding.lose=True
        d1=D1(binding,backup_callback=self.db.backup)
        with self.assertRaises(RuntimeError):run(ensure(d1,self.plan))
        self.assertEqual(run(ensure(d1,self.plan))['action'],'unchanged')

    def test_d1_existing_database_requires_recovery_reference(self):
        self.db.connection.execute('CREATE TABLE teachers(name TEXT)')
        with self.assertRaises(RuntimeError):run(ensure(D1(Binding(self.db)),self.plan))
        self.assertEqual(run(self.db.query(CATALOG)),[])

    def test_sqlite_backup_is_readable(self):
        with tempfile.TemporaryDirectory() as folder:
            db=SQLite(Path(folder)/'site.db')
            db.connection.execute('CREATE TABLE teachers(name TEXT)')
            result=run(ensure(db,self.plan))
            with sqlite3.connect(result['backup']) as saved:
                self.assertEqual(saved.execute("SELECT count(*) FROM sqlite_schema WHERE name='teachers'").fetchone()[0],1)
                self.assertEqual(saved.execute("SELECT count(*) FROM sqlite_schema WHERE name='sync_tasks'").fetchone()[0],0)
            db.close()

    def test_only_one_sql(self):
        self.assertEqual([str(p.relative_to(ROOT)) for p in ROOT.rglob('*.sql')],['database/schema.sql'])


class StagingTests(unittest.TestCase):
    use_d1=False
    def setUp(self):
        self.db=SQLite();run(ensure(self.db,core_plan(ROOT/'database/schema.sql')))
        c=self.db.connection
        c.execute("INSERT INTO sync_peers VALUES('p','https://peer.invalid','env:KEY','r1',1)")
        c.execute("INSERT INTO sync_grants VALUES('g','admin','g1',1,'[\"news\"]',1,1,0)")
        c.execute("""INSERT INTO sync_tasks(task_id,peer_id,peer_revision,direction,phase,status,
          grant_revision,grant_enabled,scope_json,lease_token,lease_until,created_at,operation_id)
          VALUES('t','p','r1','pull','transfer','running','g1',1,'[]','l1',999,0,'op1')""")
        c.execute("INSERT INTO sync_items(task_id,item_id,module,record_id,action,source_version,apply_key) VALUES('t','i','news','n','upsert','v1','apply1')")
        c.execute("UPDATE sync_tasks SET grant_id='g',write_authorized=1")
        c.execute('UPDATE sync_items SET selected=1')
        self.binding=Binding(self.db)
        self.store=StagingStore(D1(self.binding) if self.use_d1 else self.db)
        self.kw=dict(task_id='t',item_id='i',field='body',lease='l1',grant_revision='g1',source_version='v1',expected_seq=0,offset=0,data=b'abc',now=1)
    def tearDown(self):self.db.close()
    def append(self, **kw):return run(self.store.append(**(self.kw|kw)))
    def seq(self):return self.db.connection.execute('SELECT progress_seq FROM sync_tasks').fetchone()[0]

    def test_append_and_identical_retry(self):
        self.assertEqual(self.append(),{'sequence':1,'offset':3})
        self.assertEqual(self.append(),{'sequence':1,'offset':3})
        self.assertEqual(self.seq(),1)

    def test_conflicting_retry_gap_and_stale_cursor(self):
        self.append()
        for values in ({'data':b'xyz'},{'offset':4,'expected_seq':1},{'offset':3}):
            with self.subTest(values=values),self.assertRaises(ValueError):self.append(**values)
        self.assertEqual(self.seq(),1)

    def test_shrink_and_multiple_fields(self):
        self.append()
        self.append(offset=3,expected_seq=1,data=b'd')
        self.append(field='title',offset=0,expected_seq=2,data=b'e')
        self.assertEqual(self.seq(),3)
        self.assertEqual(self.db.connection.execute('SELECT staged_bytes FROM sync_items').fetchone()[0],5)

    def test_live_guards(self):
        for changes in ({'lease':'old'},{'now':999},{'grant_revision':'g2'},{'source_version':'v2'}):
            with self.subTest(changes=changes),self.assertRaises(ValueError):self.append(**changes)
        self.assertEqual(self.seq(),0)

    def test_revoked_peer_and_paused_task(self):
        self.db.connection.execute('UPDATE sync_peers SET enabled=0')
        with self.assertRaises(ValueError):self.append()
        self.db.connection.execute('UPDATE sync_peers SET enabled=1')
        self.db.connection.execute("UPDATE sync_tasks SET status='paused'")
        with self.assertRaises(ValueError):self.append()
        self.assertEqual(self.seq(),0)

    def test_constraint_failure_rolls_back_fragment_and_cursor(self):
        self.db.connection.execute('UPDATE sync_items SET staged_bytes=200000')
        with self.assertRaises(Exception):self.append()
        self.assertEqual(self.seq(),0)
        self.assertEqual(self.db.connection.execute('SELECT count(*) FROM sync_parts').fetchone()[0],0)

    def test_source_schema_upgrade_blocks_old_runtime(self):
        self.db.connection.execute('UPDATE sync_schema SET version=5')
        with self.assertRaises(ValueError):self.append()
        self.assertEqual(self.seq(),0)

    def test_foreign_keys_enabled(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.connection.execute("INSERT INTO sync_parts VALUES('none','none','body',0,x'01')")

    def test_record_byte_limit_is_atomic(self):
        self.db.connection.execute('UPDATE sync_tasks SET slice_bytes=65536')
        position=0; seq=0
        while position < 200000:
            size=min(65536,200000-position)
            self.append(offset=position,expected_seq=seq,data=b'x'*size)
            position+=size;seq+=1
        with self.assertRaises(Exception):
            self.append(offset=position,expected_seq=seq,data=b'x')
        self.assertEqual(self.seq(),seq)
        self.assertEqual(self.db.connection.execute('SELECT sum(length(data)) FROM sync_parts').fetchone()[0],200000)


class D1StagingTests(StagingTests):
    use_d1=True
    def test_lost_response_has_progress_and_retry_does_not_duplicate(self):
        self.binding.lose=True
        with self.assertRaises(RuntimeError):self.append()
        self.assertEqual(self.seq(),1)
        self.assertEqual(self.append()['sequence'],1)


if __name__=='__main__':unittest.main()
