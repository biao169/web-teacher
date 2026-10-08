from site_sync.tests.schema_fixture import core_plan
import asyncio
import json
import re
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from site_sync.adapters.sqlite import SQLite
from site_sync.adapters.local_media import LocalMedia
from site_sync.runtime.mapping import MappedWebsite
from site_sync.runtime.service import Runtime
from site_sync.runtime.schedules import Schedules
from site_sync.runtime.local import serve,logger
from site_sync.runtime.peer_server import BoundedServer,LocalSource
from site_sync.transport.server import handler
from site_sync.transport.http import HTTPPeer
from site_sync.deploy.schema import Plan,ensure
from site_sync.deploy.migrations import registered
from site_sync.runtime.bridge import NativeBridge,NativeError
from site_sync.core.authority import ConflictError,AuthorizationError

ROOT=Path(__file__).resolve().parents[2];run=asyncio.run
CONFIG={'modules':{'news':{'table':'articles','id':'uid','version':'rev','updated':'modified','deleted':'deleted','fields':['title','value']}}}
KEY=b'k'*32
TABLE='CREATE TABLE articles(uid TEXT PRIMARY KEY,rev TEXT NOT NULL,modified INTEGER NOT NULL,deleted INTEGER NOT NULL,title TEXT,value INTEGER)'

class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.source=SQLite(Path(self.tmp.name)/'source.db');self.source.connection.execute(TABLE)
        self.source.connection.executemany('INSERT INTO articles VALUES(?,?,?,?,?,?)',[('one','v1',30,0,'中文',7),('two','v2',20,0,'second',None),('gone','v3',10,1,'deleted',0)])
        self.db=SQLite();run(ensure(self.db,core_plan(ROOT/'database/schema.sql')));self.db.connection.execute(TABLE)
        self.db.connection.execute("INSERT INTO articles VALUES('gone','old',1,0,'old',0)")
        self.server=BoundedServer(('127.0.0.1',0),handler(LocalSource({'database':str(Path(self.tmp.name)/'source.db'),'adapter':'site_sync.runtime.mapping:MappedWebsite','website':CONFIG}),KEY))
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':0.01},daemon=True);self.thread.start()
        self.peer=HTTPPeer('http://127.0.0.1:'+str(self.server.server_port),KEY,allow_loopback=True)
        async def peer_factory(t):return self.peer
        self.now=100
        self.runtime=Runtime(self.db,MappedWebsite(self.db,CONFIG),peer_factory,lambda r:LocalMedia(r,Path(self.tmp.name)/'media'),platform='local',clock=lambda:self.now)
        self.repo=self.runtime.repo
        self.db.connection.execute("INSERT INTO sync_peers VALUES('p','https://peer.invalid','env:PAIR_KEY','r1',1)")
        run(self.repo.put_grant(grant_id='g',principal_id='admin',scope=['news'],can_write=True,can_delete=True))
    def tearDown(self):self.server.shutdown();self.server.server_close();self.thread.join();self.source.close();self.db.close();self.tmp.cleanup()
    def task(self):return run(self.repo.create(peer_id='p',grant_id='g',scope=['news'],operation_id='op',mode='scheduled',now=self.now))
    def tick(self):
        r=run(self.runtime.tick());self.now+=61;return r
    def test_two_database_actual_http_full_cycle(self):
        t=self.task()
        for n in range(60):
            self.tick();row=run(self.repo.read(t['task_id']))
            if row['status']=='done':break
        self.assertEqual(row['status'],'done',row['last_error'])
        self.assertEqual(run(self.db.query('SELECT uid,title,value FROM articles ORDER BY uid')),[{'uid':'one','title':'中文','value':7},{'uid':'two','title':'second','value':None}])
    def test_d1_binding_mapped_runtime(self):
        from site_sync.adapters.d1 import D1
        from site_sync.tests.test_database import Binding
        db=D1(Binding(self.db),backup_callback=self.db.backup)
        async def peer_factory(t):return self.peer
        self.runtime=Runtime(db,MappedWebsite(db,CONFIG),peer_factory,lambda r:LocalMedia(r,Path(self.tmp.name)/'media'),platform='worker',clock=lambda:self.now)
        self.repo=self.runtime.repo
        self.test_two_database_actual_http_full_cycle()
    def test_schedule_does_not_overlap_or_restart_paused_task(self):
        run(self.runtime.schedules.put(schedule_id='s',peer_id='p',grant_id='g',scope=['news'],interval_seconds=60,now=self.now))
        result=self.tick();self.assertEqual(result['action'],'scheduled');self.assertIn('task_id',result)
        run(self.repo.pause(result['task_id'],'g',self.now))
        self.assertEqual(self.tick()['action'],'schedule-blocked')
        self.assertEqual(run(self.db.query('SELECT count(*) n FROM sync_tasks'))[0]['n'],1)
    def test_revoked_schedule_disables_without_task(self):
        run(self.runtime.schedules.put(schedule_id='s',peer_id='p',grant_id='g',scope=['news'],interval_seconds=60,now=self.now))
        run(self.repo.put_grant(grant_id='g',principal_id='admin',scope=['news'],can_write=False,can_delete=False))
        self.assertEqual(self.tick()['action'],'schedule-authorization-paused')
        self.assertEqual(run(self.db.query('SELECT enabled FROM sync_schedules'))[0]['enabled'],0)
    def test_concurrent_auto_creation_is_atomic(self):
        async def race():
            return await asyncio.gather(*(self.repo.create(peer_id='p',grant_id='g',scope=['news'],operation_id='op'+str(i),mode='scheduled',now=self.now) for i in range(2)),return_exceptions=True)
        results=run(race());self.assertEqual(sum(isinstance(x,dict) for x in results),1)
        self.assertEqual(sum(isinstance(x,ConflictError) for x in results),1)
    def test_schema_mismatch_never_claims(self):
        t=self.task();self.db.connection.execute('UPDATE sync_schema SET version=99')
        with self.assertRaises(ConflictError):self.tick()
        self.assertIsNone(run(self.repo.read(t['task_id']))['lease_token'])
    def test_target_changed_after_preview_pauses(self):
        self.db.connection.execute("INSERT INTO articles VALUES('one','old',1,0,'mine',0)")
        t=self.task()
        for _ in range(10):
            self.tick()
            if run(self.repo.read(t['task_id']))['phase']=='transfer':break
        self.db.connection.execute("UPDATE articles SET rev='edited' WHERE uid='one'")
        for _ in range(30):
            self.tick()
            if run(self.repo.read(t['task_id']))['status']=='paused':break
        self.assertEqual(run(self.repo.read(t['task_id']))['status'],'paused')
        self.assertEqual(run(self.db.query("SELECT title FROM articles WHERE uid='one'"))[0]['title'],'mine')
    def test_latest_500_total_bound(self):
        self.source.connection.executemany('INSERT INTO articles VALUES(?,?,?,?,?,?)',[(str(i),'v1',1000+i,0,'x',i) for i in range(510)])
        t=self.task()
        for _ in range(501):self.tick()
        rows=run(self.db.query('SELECT record_id FROM sync_items WHERE task_id=?',(t['task_id'],)))
        self.assertEqual(len(rows),500);self.assertEqual({r['record_id'] for r in rows},{str(i) for i in range(10,510)})
    def test_mapping_rejects_identifier_injection(self):
        bad=json.loads(json.dumps(CONFIG));bad['modules']['news']['table']='articles; DROP TABLE articles'
        with self.assertRaises(ValueError):MappedWebsite(self.db,bad)
    def test_source_scope_not_in_mapping_rejected(self):
        with self.assertRaises(Exception):run(self.peer.candidates({'kind':'candidates','version':'catalog-v1','scope':['secret'],'cursor':None}))
    def test_log_files_have_fixed_retention(self):
        path=Path(self.tmp.name)/'runtime.log';log=logger(path)
        for _ in range(6):log.info('x'*900000)
        for h in log.handlers:h.close()
        files=list(path.parent.glob('runtime.log*'));self.assertLessEqual(len(files),4);self.assertLessEqual(sum(p.stat().st_size for p in files),4*1024*1024)
    def test_local_host_initializes_and_checks_mapping(self):
        path=Path(self.tmp.name)/'target.db';db=SQLite(path);db.connection.execute(TABLE);db.close()
        c={'database':str(path),'media_root':str(Path(self.tmp.name)/'m'),'log_file':str(Path(self.tmp.name)/'host.log'),'adapter':'site_sync.runtime.mapping:MappedWebsite','website':CONFIG}
        self.assertEqual(run(serve(c,once=True))['action'],'idle');self.assertEqual(run(serve(c,check=True))['action'],'checked')
    def test_native_error_kind_and_bytes_roundtrip(self):
        class Binding:
            async def read(_,raw):return b'abc'
        bridge=NativeBridge(Binding(),self.db,{'origin':'https://peer.invalid','secret_ref':'env:PAIR_KEY'})
        self.assertEqual(run(bridge.read({'kind':'slice','length':3})),b'abc')
        class Fail:
            async def step(_,raw):return '{"ok":false,"kind":"resource"}'
        with self.assertRaises(NativeError) as c:run(NativeBridge(Fail(),self.db).call('step',{}))
        self.assertEqual(c.exception.kind,'resource')
    def test_v3_upgrade_preserves_live_task(self):
        old=json.loads((ROOT/'site_sync/deploy/schema_v3.json').read_text());db=SQLite()
        try:
            for name,tokens in sorted(old.items(),key=lambda p:p[0].startswith('sync_tasks_due')):
                db.connection.execute(re.sub(r'([<>!])\s+=',r'\1=',' '.join(tokens)))
            db.connection.execute('INSERT INTO sync_schema(singleton,version) VALUES(1,3)')
            plan=core_plan(ROOT/'database/schema.sql')
            before=list(db.connection.iterdump())
            with self.assertRaises(ValueError):run(ensure(db,plan,migrations=registered(plan)))
            self.assertEqual(list(db.connection.iterdump()),before)
        finally:db.close()

class WorkerHostTests(unittest.TestCase):
    def setUp(self):
        self.previous=sys.modules.get('workers')
        fake=types.ModuleType('workers')
        class Base:pass
        class Response:
            def __init__(self,body,status=200,headers=None):self.body,self.status=body,status
        fake.WorkerEntrypoint=Base;fake.Response=Response;sys.modules['workers']=fake
        sys.modules.pop('site_sync.runtime.worker',None)
        from site_sync.runtime.worker import Default
        self.worker=Default();self.worker.env=types.SimpleNamespace(SYNC_ENABLED='0')
    def tearDown(self):
        sys.modules.pop('site_sync.runtime.worker',None)
        if self.previous:sys.modules['workers']=self.previous
        else:sys.modules.pop('workers',None)
    def test_disabled_cron_and_rpc_do_not_claim(self):
        run(self.worker.scheduled(None,None,None));self.assertEqual(json.loads(run(self.worker.tick())),{'action':'disabled'})
    def test_public_post_cannot_tick(self):
        response=run(self.worker.fetch(types.SimpleNamespace(method='POST',url='https://x/tick')))
        self.assertEqual(response.status,404)
    def test_scheduled_runs_exactly_one_tick(self):
        calls=[]
        class Runtime:
            async def tick(_):calls.append(1);return {'action':'idle'}
        async def runtime():return Runtime()
        self.worker.env.SYNC_ENABLED='1';self.worker.runtime=runtime
        run(self.worker.scheduled(None,None,None));self.assertEqual(calls,[1])
    def test_health_failure_is_503_without_details(self):
        response=run(self.worker.fetch(types.SimpleNamespace(method='GET',url='https://x/health')))
        self.assertEqual(response.status,503);self.assertNotIn('Traceback',response.body)

class DeploymentHostTests(unittest.TestCase):
    def test_remote_adapter_keeps_migration_one_batch(self):
        from site_sync.deploy.d1_remote import RemoteD1
        calls=[]
        async def backup():return 'recovery'
        db=RemoteD1('a'*32,'b'*8+'-'+'b'*4+'-'+'b'*4+'-'+'b'*4+'-'+'b'*12,'secret',backup)
        def send(payload):calls.append(payload);return [{'success':True,'results':[]} for _ in payload['batch']]
        db.send=send;run(db.batch([('SELECT 1',()),('SELECT ?',('x',))]))
        self.assertEqual(len(calls),1);self.assertEqual(len(calls[0]['batch']),2)
    def test_failed_preflight_never_contacts_cloud(self):
        from site_sync.deploy.cloudflare import deploy
        config=json.loads((ROOT/'site_sync/examples/deploy/cloudflare.example.json').read_text())
        config['wrangler_config']=str(ROOT/'site_sync/examples/deploy/wrangler.sync.jsonc');config['native_config']=str(ROOT/'site_sync/examples/deploy/wrangler.native.jsonc')
        with patch('site_sync.deploy.cloudflare.RemoteD1') as remote:
            with self.assertRaises(ValueError):run(deploy(config,apply=True,release=True))
            remote.assert_not_called()
    def test_bookmark_is_saved_before_migration(self):
        from site_sync.deploy.recovery import wrangler_bookmark
        with tempfile.TemporaryDirectory() as d,patch('site_sync.deploy.recovery.subprocess.run') as command:
            command.return_value=types.SimpleNamespace(stdout='{"bookmark":"verified-bookmark"}')
            config={'database_name':'test','wrangler_config':'config.json','account_id':'a'*32,'database_id':'id','recovery_directory':d}
            path=run(wrangler_bookmark(config));self.assertEqual(json.loads(Path(path).read_text())['bookmark'],'verified-bookmark')
            self.assertEqual(Path(path).stat().st_mode&0o777,0o600)
    def test_missing_bookmark_fails_closed(self):
        from site_sync.deploy.recovery import wrangler_bookmark
        with patch('site_sync.deploy.recovery.subprocess.run') as command:
            command.return_value=types.SimpleNamespace(stdout='{}')
            with self.assertRaises(RuntimeError):run(wrangler_bookmark({'database_name':'test','wrangler_config':'test','account_id':'a'*32}))
