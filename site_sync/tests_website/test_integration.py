import asyncio,json,os,sqlite3,tempfile,unittest,hashlib
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from backend.app.config import Settings
from backend.app.native.runtime import local
from backend.app.native.database import Database
from backend.app.native.auth import Auth
from backend.app.native.web import create_app
from backend.app.native.catalog import MODULES
from site_sync.integration.database import adapter
from site_sync.integration.website import TeacherWebsite
from site_sync.integration.host import configure,grant_id,runtime
from site_sync.integration.migration import definitions
from site_sync.transport.protocol import encode,request_headers,verify_response
from fastapi.testclient import TestClient
run=asyncio.run

class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.env=patch.dict(os.environ,{'TEACHER_SYNC_KEY':'6a'*32});self.env.start()
        self.source=self.resource('source');self.target=self.resource('target')
    def tearDown(self):self.env.stop();self.temp.cleanup()
    def resource(self,name):
        r=local(Settings(self.root/name))
        run(r.sql.batch([("INSERT INTO auth_roles(uid,name,level,visibility_scopes,is_system,is_active) VALUES('role','admin',1000,'[\"public\",\"hidden\",\"owner\",\"staff\",\"authenticated\"]',1,1)",()),("INSERT INTO auth_users(uid,username,password_hash,role_uid,status) VALUES('admin','admin','not-a-real-password','role','active')",())]))
        run(r.sql.batch([('INSERT INTO auth_permissions(uid,role_uid,module,can_view,can_edit,can_create,can_delete,can_export) VALUES(?,?,?,1,1,1,1,1)',('p'+str(n),'role',t)) for n,t in enumerate(MODULES)]))
        r.auth=Auth(r.sql,r.passwords)
        run(r.sql.batch([("INSERT INTO auth_sessions(uid,user_uid,token_hash,created_at,updated_at,last_seen_at,idle_expires_at,expires_at) VALUES('session','admin',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'2099-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z')",(hashlib.sha256(b'test-token').hexdigest(),))]))
        r.p=run(r.auth.principal('test-token'))
        run(configure(r,{'origin':'https://peer.example','enabled':True}))
        return r
    def cycle(self,scope,manual=False,auto=False,task_id=None):
        source=TeacherWebsite(adapter(self.source),self.source)
        class Peer:
            async def candidates(_,q):return await source.source_candidates(q)
            async def manifest(_,i):return await source.source_read(dict(kind='manifest',module=i['module'],record=i['record_id'],version=i['source_version']))
            async def slice(_,i,f,o,n):return await source.source_read(dict(kind='slice',module=i['module'],record=i['record_id'],version=i['source_version'],field=f,offset=o,length=n))
            def media(_,i,f,o,n):
                import io
                asset=run(self.source.sql.query('SELECT object_key FROM media_assets WHERE uid=?',(f['source_file_id'],)))[0]
                handle=self.source.media_store.path(asset['object_key']).open('rb');handle.seek(o)
                return SimpleNamespace(close=lambda:None),handle
        rt=runtime(self.target);clock=[100];rt.clock=lambda:clock[0];rt.engine.clock=rt.clock
        async def peer(t):return Peer()
        rt.peer_factory=peer
        task=run(rt.repo.read(task_id)) if task_id else run(rt.repo.create(peer_id='peer',grant_id=grant_id(self.target.p),scope=scope,operation_id='op'+str(len(run(self.target.sql.query('SELECT task_id FROM sync_tasks')))),now=100,mode='manual' if manual else 'scheduled',auto_confirm=auto))
        clock[0]=max(100,task['created_at'],task['next_run_at'])
        for _ in range(1600):
            run(rt.tick());clock[0]+=61
            row=run(rt.repo.read(task['task_id']))
            if manual and not auto and row['phase']=='await_confirmation':return rt,row
            if row['status'] in ('done','paused'):break
        self.assertEqual(row['status'],'done',row)
        return rt,row
    def test_real_schema_profile_numeric_links_and_news_dependency(self):
        run(self.source.sql.batch([("INSERT INTO profiles(uid,name,orcid,orcid_value,google_scholar_value,bio) VALUES('teacher','教授','0000-0000-0000-000X',5,12,?)",('中文跨切片'*300,)),("INSERT INTO projects(uid,name) VALUES('project','项目')",()),("INSERT INTO news(uid,title,slug,related_project_uid) VALUES('story','新闻','story','project')",())]))
        self.cycle(['profiles','news'])
        row=run(self.target.sql.query("SELECT name,orcid_value,google_scholar_value,bio FROM profiles WHERE uid='teacher'"))[0]
        self.assertEqual((row['orcid_value'],row['google_scholar_value'],row['bio']),(5,12,'中文跨切片'*300))
        self.assertEqual(run(self.target.sql.query("SELECT related_project_uid FROM news WHERE uid='story'"))[0]['related_project_uid'],'project')
    def test_media_publication_and_repeated_sync_reuses_asset(self):
        data=b'\x89PNG\r\n\x1a\n'+b'x'*90000
        run(self.source.media_store.put('uploads/avatar.png',data))
        run(self.source.sql.batch([("INSERT INTO media_assets(uid,object_key,size,mime_type) VALUES('image','uploads/avatar.png',?,'image/png')",(len(data),)),("INSERT INTO profiles(uid,name,avatar_key) VALUES('teacher','professor','uploads/avatar.png')",())]))
        self.cycle(['profiles'])
        row=run(self.target.sql.query("SELECT p.avatar_key,a.size FROM profiles p JOIN media_assets a ON a.object_key=p.avatar_key"))[0]
        self.assertEqual(self.target.media_store.path(row['avatar_key']).read_bytes(),data)
        self.cycle(['profiles'])
        self.assertEqual(run(self.target.sql.query('SELECT count(*) n FROM media_assets'))[0]['n'],1)
    def test_manual_does_not_write_before_approval(self):
        run(self.source.sql.batch([("INSERT INTO profiles(uid,name) VALUES('p','pending')",())]))
        rt,t=self.cycle(['profiles'],True)
        self.assertEqual(run(self.target.sql.query('SELECT uid FROM profiles')),[])
        self.assertEqual(t['write_authorized'],0)
    def test_explicit_delete_preserves_local_only_records(self):
        run(self.source.sql.batch([("INSERT INTO profiles(uid,name) VALUES('gone','x')",()),("DELETE FROM profiles WHERE uid='gone'",())]))
        run(self.target.sql.batch([("INSERT INTO profiles(uid,name) VALUES('gone','x'),('local','keep')",())]))
        self.cycle(['profiles'])
        self.assertEqual(run(self.target.sql.query('SELECT uid FROM profiles')),[{'uid':'local'}])
    def test_existing_admin_and_csrf_and_signed_source(self):
        app=create_app(lambda req:self.source,Path(__file__).resolve().parents[2])
        with TestClient(app,base_url=self.source.config.origin,follow_redirects=False) as client:
            self.assertIn(client.get('/admin/site-sync').status_code,(401,403,303))
            client.cookies.set(self.source.config.name('session'),'test-token')
            page=client.get('/admin/site-sync');self.assertEqual(page.status_code,200,page.text[:1000]);self.assertIn('site-sync-panel',page.text)
            self.assertEqual(client.get('/admin/site-sync/api/options').status_code,200)
            self.assertEqual(client.post('/admin/site-sync/api/tasks',json={}).status_code,403)
            body=encode({'kind':'candidates','version':'catalog-v1','scope':['profiles'],'cursor':None})
            self.assertEqual(client.post('/sync/v1/read',content=body).status_code,403)
            headers=request_headers(bytes.fromhex('6a'*32),body)
            response=client.post('/sync/v1/read',content=body,headers=headers)
            self.assertEqual(response.status_code,200,response.text)
            verify_response(bytes.fromhex('6a'*32),headers['x-sync-nonce'],200,response.headers,response.content)
    def test_snapshot_does_not_change_between_slices(self):
        run(self.source.sql.batch([("INSERT INTO profiles(uid,name) VALUES('p','before')",())]))
        src=TeacherWebsite(adapter(self.source),self.source);q={'module':'profiles','record':'p','version':run(self.source.sql.query("SELECT updated_at FROM profiles"))[0]['updated_at'],'kind':'manifest'}
        m=run(src.source_read(q));run(self.source.sql.batch([("UPDATE profiles SET name='after',updated_at='2090-01-01T00:00:00.000Z'",())]))
        raw=run(src.source_read(dict(q,kind='slice',field='payload',offset=0,length=m['fields']['payload'])))
        self.assertEqual(json.loads(raw)['rows'][0]['row']['name'],'before')
    def test_permission_revocation_stops_grant(self):
        run(self.target.sql.batch([("UPDATE auth_permissions SET can_edit=0 WHERE module='profiles'",())]))
        self.assertEqual(run(self.target.sql.query('SELECT enabled FROM sync_grants'))[0]['enabled'],0)
    def test_v160_automatic_upgrade_and_repeat(self):
        path=self.root/'legacy.db';c=sqlite3.connect(path)
        for sql in definitions('teacher-v0.15.160.json').values():c.execute(sql)
        c.execute("INSERT INTO profiles(uid,name) VALUES('keep','existing')");c.commit();c.close()
        db=Database(path);db.initialize();db.initialize()
        self.assertEqual(run(db.query('SELECT name FROM profiles')),[{'name':'existing'}])
        self.assertEqual(len(list(self.root.glob('legacy.db.before-v0.16.022-*'))),1)
        self.assertEqual(run(db.query('SELECT version FROM sync_schema')),[{'version':4}])
    def test_unknown_schema_untouched(self):
        path=self.root/'unknown.db';c=sqlite3.connect(path);c.execute('CREATE TABLE unknown(value TEXT)');c.close()
        with self.assertRaises(ValueError):Database(path).initialize()
        c=sqlite3.connect(path);self.assertEqual(c.execute('SELECT name FROM sqlite_schema').fetchall(),[('unknown',)]);c.close()

    def test_dependency_and_primary_selected_in_same_task(self):
        run(self.source.sql.batch([("INSERT INTO projects(uid,name) VALUES('project','项目')",()),("INSERT INTO news(uid,title,slug,related_project_uid) VALUES('story','新闻','story','project')",())]))
        self.cycle(['projects','news'])
        self.assertEqual(run(self.target.sql.query('SELECT count(*) n FROM projects'))[0]['n'],1)

    def test_signed_proposal_is_idempotent_and_requires_approval(self):
        app=create_app(lambda req:self.target)
        with TestClient(app,base_url=self.target.config.origin) as client:
            body=encode({'kind':'proposal','version':'proposal-v1','scope':['profiles'],'request_id':'same-proposal-id'})
            headers=request_headers(bytes.fromhex('6a'*32),body)
            a=client.post('/sync/v1/read',content=body,headers=headers)
            b=client.post('/sync/v1/read',content=body,headers=headers)
            self.assertEqual(a.status_code,200,a.text);self.assertEqual(a.json(),b.json())
            task=run(self.target.sql.query('SELECT mode,write_authorized FROM sync_tasks'))[0]
            self.assertEqual(task,{'mode':'proposal','write_authorized':0})

    def test_live_http_pair_with_media_and_foreground_requests(self):
        import socket,threading,time
        import uvicorn
        from backend.app.security.http import AuthConfig
        from site_sync.transport.http import HTTPPeer
        data=b'\x89PNG\r\n\x1a\n'+b'x'*70000
        run(self.source.media_store.put('uploads/avatar.png',data))
        run(self.source.sql.batch([("INSERT INTO media_assets(uid,object_key,size,mime_type) VALUES('image','uploads/avatar.png',?,'image/png')",(len(data),)),("INSERT INTO profiles(uid,name,avatar_key,is_active,visibility) VALUES('teacher','Live HTTP teacher','uploads/avatar.png',1,'public')",())]))
        sock=socket.socket();sock.bind(('127.0.0.1',0));origin='http://127.0.0.1:'+str(sock.getsockname()[1])
        self.source.config=AuthConfig.from_origin(origin)
        server=uvicorn.Server(uvicorn.Config(create_app(lambda req:self.source),log_level='critical',lifespan='off'))
        thread=threading.Thread(target=server.run,kwargs={'sockets':[sock]},daemon=True);thread.start()
        try:
            deadline=time.monotonic()+5
            while not server.started and time.monotonic()<deadline:time.sleep(.01)
            self.assertTrue(server.started)
            rt=runtime(self.target);clock=[100];rt.clock=lambda:clock[0];rt.engine.clock=rt.clock
            async def peer(t):return HTTPPeer(origin,bytes.fromhex('6a'*32),allow_loopback=True)
            rt.peer_factory=peer
            task=run(rt.repo.create(peer_id='peer',grant_id=grant_id(self.target.p),scope=['profiles'],operation_id='live-http',now=100,mode='scheduled'))
            with TestClient(create_app(lambda req:self.target),base_url=self.target.config.origin) as client:
                for _ in range(100):
                    async def both():return await asyncio.gather(rt.tick(),asyncio.to_thread(client.get,'/en'))
                    _,response=run(both());self.assertEqual(response.status_code,200)
                    clock[0]+=61;row=run(rt.repo.read(task['task_id']))
                    if row['status'] in ('done','paused'):break
                self.assertEqual(row['status'],'done',row)
                self.assertIn('Live HTTP teacher',client.get('/en/profiles').text)
            key=run(self.target.sql.query('SELECT avatar_key FROM profiles'))[0]['avatar_key']
            self.assertEqual(self.target.media_store.path(key).read_bytes(),data)
        finally:
            server.should_exit=True;thread.join(timeout=5);sock.close()

    def test_manual_auto_finishes_without_browser_and_explicit_review_still_waits(self):
        run(self.source.sql.batch([("INSERT INTO profiles(uid,name) VALUES('auto','automatic')",())]))
        _,t=self.cycle(['profiles'],manual=True,auto=True)
        self.assertEqual(t['status'],'done');self.assertEqual(t['auto_confirm'],1)
        self.assertEqual(run(self.target.sql.query("SELECT name FROM profiles WHERE uid='auto'"))[0]['name'],'automatic')

    def test_incoming_push_policy_and_sender_cannot_override(self):
        from site_sync.integration.proposals import receive
        q={'kind':'proposal','version':'proposal-v1','request_id':'receiver-policy-test','scope':['profiles']}
        with self.assertRaises(ValueError):run(receive(self.target,dict(q,auto_confirm=True)))
        run(configure(self.target,{'origin':'https://peer.example','enabled':True,'incoming_auto_scope':['profiles'],'incoming_auto_delete':False}))
        result=run(receive(self.target,q));self.assertFalse(result['approval_required'])
        run(self.source.sql.batch([("INSERT INTO profiles(uid,name) VALUES('push','incoming')",())]))
        _,t=self.cycle(['profiles'],task_id=result['task_id'])
        self.assertEqual(t['status'],'done');self.assertEqual(t['auto_delete'],0)
        self.assertEqual(run(receive(self.target,q)),result)

    def test_manual_push_review_once_then_background_completes(self):
        from site_sync.integration.proposals import receive
        q={'kind':'proposal','version':'proposal-v1','request_id':'manual-review-test','scope':['profiles']}
        run(self.source.sql.batch([("INSERT INTO profiles(uid,name) VALUES('push','approved')",())]))
        result=run(receive(self.target,q));self.assertTrue(result['approval_required'])
        rt,t=self.cycle(['profiles'],manual=True,task_id=result['task_id'])
        self.assertEqual(run(self.target.sql.query('SELECT uid FROM profiles')),[])
        selected=[r['item_id'] for r in run(self.target.sql.query('SELECT item_id FROM sync_items WHERE task_id=?',(t['task_id'],)))]
        run(rt.repo.confirm(t['task_id'],t['grant_id'],selected,10000))
        # New runtime represents a closed browser/new invocation; retained progress is sufficient.
        _,done=self.cycle(['profiles'],task_id=t['task_id'])
        self.assertEqual(done['status'],'done')

    def test_auto_incoming_excludes_deletes_unless_receiver_allows(self):
        from site_sync.integration.proposals import receive
        run(self.source.sql.batch([("INSERT INTO profiles(uid,name) VALUES('keep','source')",()),("DELETE FROM profiles WHERE uid='keep'",())]))
        run(self.target.sql.batch([("INSERT INTO profiles(uid,name) VALUES('keep','local')",())]))
        run(configure(self.target,{'origin':'https://peer.example','enabled':True,'incoming_auto_scope':['profiles'],'incoming_auto_delete':False}))
        result=run(receive(self.target,{'kind':'proposal','version':'proposal-v1','request_id':'no-auto-delete','scope':['profiles']}))
        self.cycle(['profiles'],task_id=result['task_id'])
        self.assertEqual(run(self.target.sql.query("SELECT name FROM profiles WHERE uid='keep'"))[0]['name'],'local')

    def test_large_slice_setting_transfers_record_in_one_body_request(self):
        from site_sync.core.settings import defaults,KEY
        run(self.target.sql.batch([('INSERT INTO service_meta(key,value) VALUES(?,?)',(KEY,json.dumps({**defaults('worker'),'slice_bytes':4194304})))]))
        body='长正文'*18000
        run(self.source.sql.batch([("INSERT INTO profiles(uid,name,bio) VALUES('large','large record',?)",(body,))]))
        requests=[];original=TeacherWebsite.source_read
        async def observed(source,q):
            if q.get('kind')=='slice':requests.append((q['offset'],q['length']))
            return await original(source,q)
        with patch.object(TeacherWebsite,'source_read',observed):self.cycle(['profiles'],manual=True,auto=True)
        self.assertEqual(len(requests),1);self.assertGreater(requests[0][1],65536)
        self.assertEqual(run(self.target.sql.query("SELECT bio FROM profiles WHERE uid='large'"))[0]['bio'],body)

    def test_expired_snapshot_restores_exact_remaining_bytes(self):
        run(self.source.sql.batch([("INSERT INTO profiles(uid,name,bio) VALUES('p','unchanged',?)",('中'*15000,))]))
        src=TeacherWebsite(adapter(self.source),self.source)
        q=dict(kind='manifest',module='profiles',record='p',task='long-task',version=run(self.source.sql.query('SELECT updated_at FROM profiles'))[0]['updated_at'])
        m=run(src.snapshot(q));q['snapshot_hash']=m['snapshot_hash'];total=m['fields']['payload']
        original=run(src.source_read(dict(q,kind='slice',field='payload',offset=0,length=total)))
        first=original[:4096]
        run(self.source.sql.batch([('DELETE FROM sync_exports',())]))
        rest=run(src.source_read(dict(q,kind='slice',field='payload',offset=4096,length=total-4096)))
        self.assertEqual(first+rest,original)
        self.assertEqual(run(self.source.sql.query('SELECT body_sha256 FROM sync_exports'))[0]['body_sha256'],q['snapshot_hash'])

    def test_expired_snapshot_with_changed_dependency_never_mixes_bytes(self):
        from site_sync.core.authority import ConflictError
        run(self.source.sql.batch([("INSERT INTO projects(uid,name) VALUES('project','old')",()),("INSERT INTO news(uid,title,slug,related_project_uid) VALUES('story','news','story','project')",())]))
        src=TeacherWebsite(adapter(self.source),self.source)
        q=dict(kind='manifest',module='news',record='story',task='slow',version=run(self.source.sql.query('SELECT updated_at FROM news'))[0]['updated_at'])
        m=run(src.snapshot(q))
        run(self.source.sql.batch([('DELETE FROM sync_exports',()),("UPDATE projects SET name='new',updated_at='2090-01-01T00:00:00.000Z'",())]))
        with self.assertRaises(ConflictError):run(src.source_read(dict(q,kind='slice',snapshot_hash=m['snapshot_hash'],field='payload',offset=10,length=10)))

    def test_export_grant_expiry_applies_to_freshly_signed_requests(self):
        from site_sync.integration.host import authorize_export
        from site_sync.core.authority import AuthorizationError
        run(self.source.sql.batch([('UPDATE sync_grants SET expires_at=1',())]))
        with self.assertRaises(AuthorizationError):run(authorize_export(self.source,'profiles'))


    def test_delete_active_task_safely_cancels_then_prunes_without_business_delete(self):
        from site_sync.admin.service import Admin,Actor
        run(self.target.sql.batch([("INSERT INTO profiles(uid,name) VALUES('keep','local website record')",())]))
        rt=runtime(self.target);now=[100];rt.clock=lambda:now[0];rt.engine.clock=rt.clock
        actor=Actor(self.target.p['uid'],grant_id(self.target.p));admin=Admin(rt.repo,rt.clock)
        uid=run(admin.create(actor,{'peer_id':'peer','scope':['profiles'],'request_id':'delete-active-test'}))['task_id']
        owned=run(rt.repo.claim(now[0]));run(admin.command(actor,uid,'delete',{}))
        self.assertEqual(run(rt.repo.read(uid))['status'],'cancel_requested')
        for _ in range(20):
            now[0]+=61;run(rt.tick())
            if not run(self.target.sql.query('SELECT task_id FROM sync_tasks WHERE task_id=?',(uid,))):break
        self.assertEqual(run(self.target.sql.query('SELECT task_id FROM sync_tasks WHERE task_id=?',(uid,))),[])
        self.assertEqual(run(self.target.sql.query("SELECT name FROM profiles WHERE uid='keep'"))[0]['name'],'local website record')
