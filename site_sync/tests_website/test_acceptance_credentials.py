"""Two website databases, actual loopback HTTP, admin API keys and interrupted jobs."""
import asyncio,json,os,socket,threading,time,unittest
from unittest.mock import patch
import uvicorn
from fastapi.testclient import TestClient
from backend.app.native.web import create_app
from backend.app.security.http import AuthConfig
from site_sync.tests_website import test_integration as fixture
from site_sync.integration.host import runtime,grant_id
from site_sync.integration.credentials import require_secret
from site_sync.transport.http import HTTPPeer
from site_sync.transport.protocol import encode,request_headers
run=asyncio.run

class AcceptanceTests(unittest.TestCase):
    def cycle(self,mode):
        f=fixture.IntegrationTests();f.setUp();self.addCleanup(f.tearDown)
        source,target=f.source,f.target
        no_env=patch.dict(os.environ,{'TEACHER_SYNC_KEY':''});no_env.start();self.addCleanup(no_env.stop)
        sock=socket.socket();sock.bind(('127.0.0.1',0));origin='http://127.0.0.1:'+str(sock.getsockname()[1])
        source.config=AuthConfig.from_origin(origin)
        source_app=create_app(lambda req:source)
        server=uvicorn.Server(uvicorn.Config(source_app,log_level='critical',lifespan='off'))
        thread=threading.Thread(target=server.run,kwargs={'sockets':[sock]},daemon=True);thread.start()
        def stop():server.should_exit=True;thread.join(timeout=5);sock.close()
        self.addCleanup(stop)
        deadline=time.monotonic()+5
        while not server.started and time.monotonic()<deadline:time.sleep(.01)
        self.assertTrue(server.started)
        def admin(r,app,key):
            with TestClient(app,base_url=r.config.origin) as client:
                client.cookies.set(r.config.name('session'),'test-token')
                response=client.post('/api/admin/site-sync/credentials',json={'key':key},headers={'origin':r.config.origin,'x-csrf-token':r.p['csrf']})
                self.assertEqual(response.status_code,200,response.text)
        target_app=create_app(lambda req:target)
        with TestClient(target_app,base_url=target.config.origin) as client:
            client.cookies.set(target.config.name('session'),'test-token')
            self.assertFalse(client.get('/api/admin/site-sync/credentials').json()['configured'])
        admin(source,source_app,'ab'*32);admin(target,target_app,'ab'*32)
        body='Unicode正文'*10000;media=b'\x89PNG\r\n\x1a\n'+b'x'*80000
        run(source.media_store.put('uploads/a.png',media))
        run(source.sql.batch([("INSERT INTO media_assets(uid,object_key,size,mime_type) VALUES('a','uploads/a.png',?,'image/png')",(len(media),)),("INSERT INTO profiles(uid,name,bio,avatar_key,is_active,visibility) VALUES('p','Acceptance',?,'uploads/a.png',1,'public')",(body,))]))
        clock=[int(time.time())]
        def build():
            rt=runtime(target);rt.clock=lambda:clock[0];rt.engine.clock=rt.clock
            async def peer(t):return HTTPPeer(origin,await require_secret(target),allow_loopback=True)
            rt.peer_factory=peer
            return rt
        rt=build();gid=grant_id(target.p)
        if mode=='scheduled':
            run(rt.schedules.put(schedule_id='acceptance',peer_id='peer',grant_id=gid,scope=['profiles'],interval_seconds=2592000,now=clock[0]))
            task_id=run(rt.schedules.tick(clock[0]))['task_id']
        elif mode=='proposal':
            request=encode({'kind':'proposal','version':'proposal-v1','request_id':'acceptance-push','scope':['profiles']})
            with TestClient(target_app,base_url=target.config.origin) as client:
                response=client.post('/sync/v1/read',content=request,headers=request_headers(run(require_secret(source)),request))
                self.assertEqual(response.status_code,200,response.text)
                self.assertTrue(response.json()['approval_required']);task_id=response.json()['task_id']
        else:task_id=run(rt.repo.create(peer_id='peer',grant_id=gid,scope=['profiles'],operation_id='acceptance',now=clock[0],mode='manual',auto_confirm=True,settings={'slice_bytes':4096}))['task_id']
        def tick():
            run(rt.tick());row=run(rt.repo.read(task_id));clock[0]=max(clock[0]+61,row['next_run_at']);return row
        approved=False
        for _ in range(100):
            row=tick()
            if row['phase']=='await_confirmation' and mode=='proposal':
                self.assertFalse(run(target.sql.query('SELECT uid FROM profiles')))
                items=[x['item_id'] for x in run(target.sql.query('SELECT item_id FROM sync_items WHERE task_id=?',(task_id,)))]
                run(rt.repo.confirm(task_id,gid,items,clock[0]));approved=True
            parts=run(target.sql.query('SELECT offset,length(data) size FROM sync_parts WHERE task_id=? ORDER BY offset',(task_id,)))
            if parts:break
        self.assertTrue(parts)
        admin(source,source_app,'cd'*32)
        for _ in range(12):
            row=tick();self.assertEqual(row['status'],'waiting',row)
            self.assertEqual(row['last_error'],'CredentialRetryError')
            self.assertEqual(run(target.sql.query('SELECT offset,length(data) size FROM sync_parts WHERE task_id=? ORDER BY offset',(task_id,))),parts)
        with TestClient(target_app,base_url=target.config.origin) as client:self.assertEqual(client.get('/en').status_code,200)
        admin(target,target_app,'cd'*32)
        rt=build() # New executor instance; durable progress survives restart.
        for _ in range(200):
            row=tick()
            if row['status'] in ('done','paused'):break
        self.assertEqual(row['status'],'done',row)
        result=run(target.sql.query("SELECT bio,avatar_key FROM profiles WHERE uid='p'"))[0]
        self.assertEqual(result['bio'],body);self.assertEqual(target.media_store.path(result['avatar_key']).read_bytes(),media)
        logs=json.dumps(run(target.sql.query('SELECT detail FROM sync_events')))
        self.assertNotIn('ab'*32,logs);self.assertNotIn('cd'*32,logs)
        if mode=='proposal':self.assertTrue(approved)
    def test_manual_pull(self):self.cycle('manual')
    def test_scheduled_pull(self):self.cycle('scheduled')
    def test_push_approved_by_receiver(self):self.cycle('proposal')
