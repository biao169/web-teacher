from site_sync.tests.schema_fixture import core_plan
import asyncio
import json
from pathlib import Path
import unittest
from site_sync.adapters.sqlite import SQLite
from site_sync.adapters.d1 import D1
from site_sync.adapters.tasks import Tasks
from site_sync.admin.service import Admin,Actor
from site_sync.admin.asgi import AdminASGI
from site_sync.admin.retention import Retention
from site_sync.core.authority import AuthorizationError,ConflictError
from site_sync.deploy.schema import Plan,ensure
from site_sync.tests.test_database import Binding

run=asyncio.run;ROOT=Path(__file__).resolve().parents[2]

class AdminTests(unittest.TestCase):
    d1=False
    def setUp(self):
        self.raw=SQLite();run(ensure(self.raw,core_plan(ROOT/'database/schema.sql')))
        self.db=D1(Binding(self.raw),backup_callback=self.raw.backup) if self.d1 else self.raw
        self.repo=Tasks(self.db);self.now=100;self.admin=Admin(self.repo,lambda:self.now)
        self.actor=Actor('admin','g');self.other=Actor('other','other')
        self.raw.connection.execute("INSERT INTO sync_peers VALUES('peer','https://peer.invalid','env:SECRET','p1',1)")
        for a in (self.actor,self.other):run(self.repo.put_grant(grant_id=a.grant_id,principal_id=a.principal_id,scope=['news'],can_write=True,can_delete=True))
    def tearDown(self):self.raw.close()
    def create(self,actor=None,request='request-123'):
        return run(self.admin.create(actor or self.actor,{'peer_id':'peer','scope':['news'],'request_id':request,'auto_confirm':False}))['task_id']
    def test_default_manual_api_preapproves_and_retry_preserves_policy(self):
        body={'peer_id':'peer','scope':['news'],'request_id':'one-click-default'}
        result=run(self.admin.create(self.actor,body));t=self.task(result['task_id'])
        self.assertEqual((t['mode'],t['auto_confirm'],t['write_authorized']),('manual',1,1))
        self.assertEqual(run(self.admin.create(self.actor,body)),result)
        with self.assertRaises(ConflictError):run(self.admin.create(self.actor,dict(body,auto_confirm=False)))
    def test_stale_receiver_policy_cannot_authorize_task(self):
        with self.assertRaises(AuthorizationError):run(self.repo.create(peer_id='peer',grant_id='g',scope=['news'],operation_id='stale-policy',now=self.now,mode='proposal',auto_confirm=True,expected_grant_revision='stale'))
    def task(self,uid):return run(self.repo.read(uid))
    def schedule(self):return {'schedule_id':None,'revision':None,'peer_id':'peer','scope':['news'],'interval_seconds':3600,'enabled':True}
    def test_owner_lists_do_not_leak_other_tasks_or_secrets(self):
        uid=self.create();self.create(self.other)
        r=run(self.admin.tasks(self.actor));self.assertEqual([x['task_id'] for x in r['items']],[uid])
        text=json.dumps(r);self.assertNotIn('SECRET',text);self.assertNotIn('lease_token',text);self.assertNotIn('grant_id',text)
    def test_spoofed_principal_and_foreign_details_denied(self):
        uid=self.create(self.other)
        for actor in (self.actor,Actor('fake','other')):
            with self.assertRaises(AuthorizationError):run(self.admin.detail(actor,uid))
    def test_create_is_idempotent_per_grant(self):
        self.assertEqual(self.create(),self.create());self.assertNotEqual(self.create(),self.create(self.other))
    def test_pagination_is_stable_and_bounded(self):
        for i in range(53):self.create(request='request-'+str(i))
        first=run(self.admin.tasks(self.actor));second=run(self.admin.tasks(self.actor,cursor=first['cursor']))
        self.assertEqual(len(first['items']),50);self.assertEqual(len(second['items']),3)
        self.assertEqual(len({x['task_id'] for x in first['items']+second['items']}),53)
    def test_settings_cas_and_no_fake_progress(self):
        uid=self.create();before=self.task(uid)
        body={'revision':before['revision'],'fast_retries':0,'slice_bytes':4096,'min_slice_bytes':4096,'auto_shrink':True,'slow_retry_seconds':1800}
        run(self.admin.command(self.actor,uid,'settings',body));after=self.task(uid)
        self.assertEqual(after['slice_bytes'],4096);self.assertEqual(before['progress_seq'],after['progress_seq'])
        with self.assertRaises(ConflictError):run(self.admin.command(self.actor,uid,'settings',body))
    def test_settings_reject_live_lease_even_paused(self):
        uid=self.create();run(self.repo.claim(self.now));run(self.admin.command(self.actor,uid,'pause',{}));t=self.task(uid)
        with self.assertRaises(ConflictError):run(self.admin.command(self.actor,uid,'settings',{'revision':t['revision'],'fast_retries':1,'slice_bytes':8192,'min_slice_bytes':4096,'auto_shrink':True,'slow_retry_seconds':600}))
    def test_revoke_between_command_read_and_write_is_fenced(self):
        uid=self.create();base=self.repo.db;raw=self.raw
        class Revoke:
            async def query(_,sql,args=()):return await base.query(sql,args)
            async def batch(_,stmts):
                raw.connection.execute("UPDATE sync_grants SET enabled=0 WHERE grant_id='g'")
                return await base.batch(stmts)
        self.repo.db=Revoke()
        with self.assertRaises(Exception):run(self.admin.command(self.actor,uid,'pause',{}))
        self.repo.db=base
        self.assertEqual(self.task(uid)['status'],'ready')
    def test_settings_reject_bool_and_invalid_limits(self):
        uid=self.create()
        for changes in ({'slice_bytes':128},{'fast_retries':True},{'slow_retry_seconds':0}):
            b={'revision':self.task(uid)['revision'],'fast_retries':1,'slice_bytes':8192,'min_slice_bytes':4096,'auto_shrink':True,'slow_retry_seconds':600};b.update(changes)
            with self.assertRaises(ValueError):run(self.admin.command(self.actor,uid,'settings',b))
    def test_revoked_owner_can_read_but_not_mutate(self):
        uid=self.create();self.raw.connection.execute("UPDATE sync_grants SET enabled=0 WHERE grant_id='g'")
        self.assertEqual(run(self.admin.detail(self.actor,uid))['task']['task_id'],uid)
        with self.assertRaises(AuthorizationError):run(self.admin.command(self.actor,uid,'cancel',{}))
    def test_cross_owner_schedule_update_denied(self):
        uid=run(self.admin.save_schedule(self.other,self.schedule()))['schedule_id']
        s=run(self.admin.schedules(self.other))['items'][0];body=self.schedule();body.update(schedule_id=uid,revision=s['revision'])
        with self.assertRaises(ConflictError):run(self.admin.save_schedule(self.actor,body))
        self.assertEqual(run(self.admin.schedules(self.actor))['items'],[])
    def test_schedule_disable_and_revision_conflict(self):
        uid=run(self.admin.save_schedule(self.actor,self.schedule()))['schedule_id'];s=run(self.admin.schedules(self.actor))['items'][0]
        b=self.schedule();b.update(schedule_id=uid,revision=s['revision'],enabled=False)
        run(self.admin.save_schedule(self.actor,b));self.assertEqual(run(self.admin.schedules(self.actor))['items'][0]['enabled'],0)
        with self.assertRaises(ConflictError):run(self.admin.save_schedule(self.actor,b))
    def test_new_schedule_replay_is_idempotent(self):
        b=self.schedule();b['request_id']='plan-request-123'
        a=run(self.admin.save_schedule(self.actor,b));second=run(self.admin.save_schedule(self.actor,b))
        self.assertEqual(a,second);self.assertEqual(len(run(self.admin.schedules(self.actor))['items']),1)
    def test_unknown_scope_schedule_rejected(self):
        b=self.schedule();b['scope']=['private']
        with self.assertRaises(AuthorizationError):run(self.admin.save_schedule(self.actor,b))
    def test_confirm_uses_existing_authorization_and_selection(self):
        uid=self.create();t=run(self.repo.claim(self.now))
        run(self.repo.add_item(t,item_id='i',module='news',record_id='n',source_version='v1',now=self.now))
        run(self.repo.advance(t,'await_confirmation',self.now));run(self.repo.finish(t,self.now))
        run(self.admin.command(self.actor,uid,'confirm',{'selected':['i']}));self.assertEqual(self.task(uid)['phase'],'transfer')
    def test_retention_preserves_running_and_recent_tasks(self):
        uid=self.create();self.now=10000000
        self.assertEqual(run(Retention(self.db,7).step(self.now))['action'],'idle')
        self.raw.connection.execute("UPDATE sync_tasks SET status='done',last_progress_at=? WHERE task_id=?",(self.now,uid))
        self.assertEqual(run(Retention(self.db,7).step(self.now))['action'],'idle')
    def test_retention_scope_and_schedule_reference(self):
        uid=self.create();other=self.create(self.other);s=run(self.admin.save_schedule(self.actor,self.schedule()))['schedule_id']
        self.raw.connection.execute("UPDATE sync_tasks SET status='done',last_progress_at=100")
        self.raw.connection.execute('UPDATE sync_schedules SET last_task_id=? WHERE schedule_id=?',(uid,s))
        r=run(Retention(self.db,7).step(10000000,'g'));self.assertEqual(r['task_id'],uid)
        for _ in range(8):run(Retention(self.db,7).step(10000000,'g'))
        self.assertEqual(self.task(other)['status'],'done');self.assertIsNone(run(self.admin.schedules(self.actor))['items'][0]['last_task_id'])
    def test_retention_bounded_child_batch_and_no_business_deletion(self):
        uid=self.create();t=run(self.repo.claim(self.now))
        for i in ('a','b'):run(self.repo.add_item(t,item_id=i,module='news',record_id=i,source_version='v1',now=self.now))
        self.raw.connection.execute("CREATE TABLE business(id TEXT)");self.raw.connection.execute("INSERT INTO business VALUES('keep')")
        self.raw.connection.execute("UPDATE sync_tasks SET status='done',lease_until=0,last_progress_at=100")
        for _ in range(8):run(Retention(self.db,7).step(10000000,'g'))
        self.assertEqual(run(self.db.query('SELECT count(*) n FROM sync_items'))[0]['n'],0)
        self.assertEqual(run(self.db.query('SELECT * FROM business')),[{'id':'keep'}])

    def test_journal_bounded_paginated_owned_and_secret_free(self):
        from site_sync.core.journal import statements,failure
        uid=self.create()
        try:raise RuntimeError('password=must-not-be-logged')
        except Exception as e:detail=failure(e)
        for n in range(270):run(self.db.batch(statements(uid,100+n,'error',detail,'error')))
        self.assertEqual(run(self.db.query('SELECT count(*) n FROM sync_events WHERE task_id=?',(uid,)))[0]['n'],256)
        first=run(self.admin.logs(self.actor,uid));self.assertEqual(len(first['items']),30)
        second=run(self.admin.logs(self.actor,uid,before=first['cursor']))
        self.assertLess(second['items'][0]['event_id'],first['items'][-1]['event_id'])
        self.assertNotIn('must-not-be-logged',json.dumps(first))
        self.assertEqual(first['items'][0]['detail']['error'],'RuntimeError')
        with self.assertRaises(AuthorizationError):run(self.admin.logs(self.other,uid))

    def test_task_pages_have_fixed_size_and_status_filters(self):
        for n in range(23):self.create(request='page-test-'+str(n))
        a=run(self.admin.tasks(self.actor,view='all',limit=10))
        b=run(self.admin.tasks(self.actor,view='all',limit=10,cursor=a['cursor']))
        self.assertEqual((len(a['items']),len(b['items'])),(10,10))
        self.assertFalse(set(t['task_id'] for t in a['items'])&set(t['task_id'] for t in b['items']))
        uid=a['items'][0]['task_id'];run(self.admin.command(self.actor,uid,'pause',{}))
        self.assertEqual([t['task_id'] for t in run(self.admin.tasks(self.actor,view='paused'))['items']],[uid])
        with self.assertRaises(ValueError):run(self.admin.tasks(self.actor,limit=51))

    def test_delete_terminal_task_ignores_retention_age_preserves_business(self):
        uid=self.create();self.raw.connection.execute("CREATE TABLE business(value TEXT)")
        self.raw.connection.execute("INSERT INTO business VALUES('keep')")
        self.raw.connection.execute("UPDATE sync_tasks SET status='done',phase='done'")
        with self.assertRaises(AuthorizationError):run(self.admin.command(self.other,uid,'delete',{}))
        run(self.admin.command(self.actor,uid,'delete',{}))
        self.assertEqual(self.task(uid)['delete_requested'],1)
        for _ in range(10):run(Retention(self.db).step(self.now,requested_only=True))
        self.assertEqual(run(self.db.query('SELECT task_id FROM sync_tasks')),[])
        self.assertEqual(run(self.db.query('SELECT * FROM sync_events')),[])
        self.assertEqual(run(self.db.query('SELECT * FROM business')),[{'value':'keep'}])

    def test_interrupted_attempt_and_finish_have_durable_diagnostics(self):
        uid=self.create();t=run(self.repo.claim(100))
        start=run(self.admin.logs(self.actor,uid))['items'][0]
        self.assertEqual(start['kind'],'start');self.assertEqual(start['attempt_id'],t['attempt_id'])
        run(self.repo.reconcile_one(t['lease_until']))
        event=run(self.admin.logs(self.actor,uid))['items'][0]
        self.assertEqual(event['kind'],'recovered');self.assertEqual(event['detail']['error'],'UncertainInterruptedAttempt')
        self.assertEqual(event['phase'],'discover');self.assertGreater(event['next_run_at'],t['lease_until'])

class D1AdminTests(AdminTests):d1=True

class RouteTests(unittest.TestCase):
    d1=False
    setUp=AdminTests.setUp
    tearDown=AdminTests.tearDown
    create=AdminTests.create
    task=AdminTests.task
    async def request(self,path,method='GET',body=None,csrf=True,actor=None):
        async def authenticate(scope):return actor or self.actor
        async def verify(scope,who):return csrf
        app=AdminASGI(self.admin,authenticate,verify);sent=[]
        async def receive():return {'type':'http.request','body':json.dumps(body or {}).encode(),'more_body':False}
        async def send(value):sent.append(value)
        await app({'type':'http','path':'/admin/site-sync/api/'+path,'method':method,'query_string':b'','headers':[(b'content-type',b'application/json')]},receive,send)
        return sent[0]['status'],json.loads(sent[1]['body'])
    def test_csrf_rejected_before_mutation(self):
        status,_=run(self.request('tasks','POST',{'peer_id':'peer','scope':['news'],'request_id':'request-123'},csrf=False));self.assertEqual(status,403)
        self.assertEqual(run(self.db.query('SELECT count(*) n FROM sync_tasks'))[0]['n'],0)
    def test_foreign_grant_cannot_be_injected(self):
        status,_=run(self.request('tasks','POST',{'peer_id':'peer','scope':['news'],'request_id':'request-123','grant_id':'other'}));self.assertEqual(status,400)
    def test_get_never_runs_engine(self):
        uid=self.create();status,data=run(self.request('tasks'));self.assertEqual(status,200);self.assertIsNone(self.task(uid)['lease_token'])
    def test_hidden_backend_error(self):
        async def fail(*a,**k):raise RuntimeError('SECRET DATABASE PATH')
        self.admin.options=fail;status,data=run(self.request('options'));self.assertEqual(status,503);self.assertNotIn('SECRET',str(data))
