from site_sync.tests.schema_fixture import core_plan
import asyncio
import hashlib
import io
import json
from pathlib import Path
import re
import tempfile
import threading
import subprocess
import unittest
from http.server import ThreadingHTTPServer
from site_sync.adapters.sqlite import SQLite
from site_sync.adapters.d1 import D1
from site_sync.adapters.tasks import Tasks
from site_sync.adapters.transfer import Transfer,Cleanup,MediaReceipts
from site_sync.adapters.local_media import LocalMedia
from site_sync.adapters.worker_media import WorkerMedia
from site_sync.core.engine import Engine,Context
from site_sync.core.authority import AuthorizationError,ConflictError,ResourceError
from site_sync.deploy.schema import Plan,ensure,CATALOG
from site_sync.deploy.migrations import registered
from site_sync.tests.test_database import Binding
from site_sync.transport.protocol import *
from site_sync.transport.http import HTTPPeer
from site_sync.transport.server import handler

ROOT=Path(__file__).resolve().parents[2]
run=asyncio.run
KEY=b'test-only-pair-secret-never-deploy!'


class Source:
    def __init__(self):
        self.body=('中文正文🌍abc'*4000).encode();self.blob=b'abcdef'*14000;self.version='v1';self.calls=[];self.with_file=True;self.abort=False
    def authorize(self,module,record):
        if module!='news' or record!='i':raise AuthorizationError('Outside outgoing scope')
    def check(self,q):
        if q['version']!=self.version:raise ConflictError('Version changed')
    def manifest(self,q):
        self.check(q);return dict(version=self.version,fields={'body':len(self.body),'empty':0},files=[dict(id='f',version=self.version,size=len(self.blob))] if self.with_file else [])
    def slice(self,q):
        self.check(q);self.calls.append((q['offset'],q['length']))
        if q['field']!='body':raise ConflictError('Unknown field')
        return self.body[q['offset']:q['offset']+q['length']]
    def media(self,q):
        self.check(q)
        if q['file']!='f' or q['total']!=len(self.blob):raise ConflictError('Media changed')
        end=q['offset']+q['length'];data=self.blob[q['offset']:end]
        if self.abort:data=data[:10]
        return io.BytesIO(data)


class TransferTests(unittest.TestCase):
    use_d1=False
    def setUp(self):
        self.raw=SQLite();run(ensure(self.raw,core_plan(ROOT/'database/schema.sql')))
        self.db=D1(Binding(self.raw),backup_callback=self.raw.backup) if self.use_d1 else self.raw
        self.source=Source();self.server=ThreadingHTTPServer(('127.0.0.1',0),handler(self.source,KEY,clock=lambda:100))
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':0.01},daemon=True);self.thread.start()
        self.peer=HTTPPeer('http://127.0.0.1:'+str(self.server.server_port),KEY,allow_loopback=True,clock=lambda:100)
        self.raw.connection.execute("INSERT INTO sync_peers VALUES('peer','https://peer.invalid','env:KEY','r1',1)")
        self.raw.connection.execute('CREATE TABLE news(id TEXT PRIMARY KEY,body TEXT,object_key TEXT)')
        self.repo=Tasks(self.db,platform='local',lease_seconds=300);self.now=100
        run(self.repo.put_grant(grant_id='g',principal_id='admin',scope=['news'],can_write=True,can_delete=True))
        self.task=run(self.repo.create(peer_id='peer',grant_id='g',scope=['news'],operation_id='test',now=self.now,mode='scheduled'))
        t=run(self.repo.claim(self.now));run(self.repo.add_item(t,item_id='i',module='news',record_id='i',source_version='v1',now=self.now));run(self.repo.advance(t,'await_confirmation',self.now));run(self.repo.finish(t,self.now));self.now+=1
        self.tmp=tempfile.TemporaryDirectory();self.media=LocalMedia(self.repo,self.tmp.name)
        self.transfer=Transfer(self.repo,self.peer,self.media)
        self.engine=Engine(self.repo,{'transfer':self.transfer,'apply':self.apply,'cleanup':Cleanup(self.repo,self.media)},lambda:self.now)
        self.raw.connection.execute('UPDATE sync_tasks SET slice_bytes=8192')
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.raw.close();self.tmp.cleanup()
    async def apply(self,ctx):
        await ctx.commit_item('i',("""INSERT INTO news SELECT 'i',
          (SELECT CAST(group_concat(data,'') AS TEXT) FROM (SELECT data FROM sync_parts WHERE task_id=? AND item_id='i' AND field='body' ORDER BY offset)),
          (SELECT staging_key FROM sync_files WHERE task_id=? AND item_id='i' LIMIT 1)""",(ctx.task['task_id'],ctx.task['task_id'])))
        await ctx.advance('cleanup')
    def tick(self):
        r=run(self.engine.tick());row=run(self.repo.read(self.task['task_id']));self.now=max(self.now+1,row['next_run_at']);return row
    def until(self,predicate,limit=150):
        for _ in range(limit):
            row=self.tick()
            if predicate(row):return row
        self.fail('Did not reach expected state')
    def file(self):return run(self.db.query('SELECT * FROM sync_files'))[0]
    def ctx(self):
        t=run(self.repo.claim(self.now));return Context(self.repo,t,lambda:self.now)
    def test_real_http_unicode_shrinking_and_media_full_lifecycle(self):
        self.tick();self.tick();self.raw.connection.execute('UPDATE sync_tasks SET slice_bytes=4096')
        row=self.until(lambda r:r['status']=='done')
        self.assertEqual(row['no_progress_count'],0)
        result=run(self.db.query('SELECT * FROM news'))[0]
        self.assertEqual(result['body'],self.source.body.decode())
        f=self.file();d=Path(self.tmp.name)/f['operation_id']
        self.assertEqual((d/'object').read_bytes(),self.source.blob)
        self.assertEqual(list(d.glob('part-*')),[])
        self.assertEqual(self.source.calls[0],(0,8192));self.assertEqual(self.source.calls[1],(8192,4096))
        self.assertEqual(f['status'],'done')
    def test_source_revision_change_pauses_before_any_body(self):
        self.tick();self.source.version='v2';row=self.tick()
        self.assertEqual(row['status'],'paused');self.assertEqual(run(self.db.query('SELECT count(*) n FROM sync_parts'))[0]['n'],0)
    def test_bad_signature_never_stages(self):
        self.peer.secret=b'x'*32;row=self.tick();self.assertEqual(row['status'],'paused')
    def test_manifest_bounds_pause(self):
        self.source.body=b'x'*200001;self.assertEqual(self.tick()['status'],'paused')
    def test_abort_media_does_not_advance_and_later_finishes(self):
        self.until(lambda r:bool(run(self.db.query("SELECT * FROM sync_files WHERE committed_bytes>0"))))
        before=self.file()['committed_bytes'];self.source.abort=True
        row=self.tick();self.assertEqual(self.file()['committed_bytes'],before);self.assertEqual(row['no_progress_count'],1)
        self.source.abort=False;self.until(lambda r:r['status']=='done')
    def test_local_part_receipt_lost_recovers_without_network_replay(self):
        self.until(lambda r:bool(run(self.db.query("SELECT * FROM sync_items WHERE staged_bytes=?",(len(self.source.body),)))))
        f=self.file();etag,length=self.media.store_part(f,dict(module='news',record_id='i',source_version='v1'),self.peer,256)
        self.source.abort=True
        self.tick();self.assertEqual(self.file()['committed_bytes'],length)
    def test_complete_receipt_lost_recovers_existing_object(self):
        self.until(lambda r:bool(run(self.db.query('SELECT * FROM sync_files WHERE committed_bytes=total_bytes'))))
        f=self.file();self.media.complete(f);self.source.abort=True
        self.tick();self.assertEqual(self.file()['status'],'uploaded')
    def test_business_and_media_publication_atomic_lost_reply(self):
        self.until(lambda r:r['phase']=='apply');ctx=self.ctx()
        base=self.repo.db
        class Lost:
            async def query(_,sql,args=()):return await base.query(sql,args)
            async def batch(_,stmts):
                result=await base.batch(stmts)
                if any("status='published'" in s for s,a in stmts):raise IOError('Lost acknowledgement')
                return result
        self.repo.db=Lost()
        with self.assertRaises(IOError):run(self.apply(ctx))
        self.repo.db=base
        self.assertEqual(self.file()['status'],'published')
        self.assertEqual(run(self.db.query('SELECT count(*) n FROM news'))[0]['n'],1)
        run(self.apply(ctx));self.assertEqual(run(self.db.query('SELECT count(*) n FROM news'))[0]['n'],1)
    def test_target_conflict_rolls_back_media_publication(self):
        self.until(lambda r:r['phase']=='apply');ctx=self.ctx()
        with self.assertRaises(ConflictError):run(ctx.commit_item('i',('UPDATE news SET body=? WHERE id=?',('x','missing'))))
        self.assertEqual(self.file()['status'],'uploaded')
    def test_cancel_discards_only_unpublished_owned_media(self):
        self.until(lambda r:bool(run(self.db.query('SELECT * FROM sync_files WHERE committed_bytes>0'))))
        f=self.file();run(self.repo.cancel(self.task['task_id'],'g',self.now))
        row=self.until(lambda r:r['status']=='cancelled')
        self.assertFalse((Path(self.tmp.name)/f['operation_id']).exists());self.assertEqual(run(self.db.query('SELECT * FROM news')),[])
    def test_revocation_fences_part_receipt(self):
        self.tick();ctx=self.ctx();f=self.file()
        run(self.repo.put_grant(grant_id='g',principal_id='admin',scope=['news'],can_write=False,can_delete=False))
        with self.assertRaises(Exception):run(MediaReceipts(self.repo).part(ctx,f,0,f['part_bytes'],'x'))
        self.assertEqual(self.file()['committed_bytes'],0)
    def test_legacy_partial_without_manifest_requires_new_task(self):
        self.raw.connection.execute('UPDATE sync_items SET staged_bytes=3')
        self.assertEqual(self.tick()['status'],'paused')
    def test_empty_field_and_no_media(self):
        self.source.body=b'';self.source.with_file=False
        self.until(lambda r:r['status']=='done')
        self.assertEqual(run(self.db.query('SELECT * FROM sync_files')),[])
    def test_js_client_reads_python_peer_over_real_http(self):
        program="""
        import {SignedPeer} from './site_sync/worker/transport.mjs';
        const origin=process.argv[1];
        const p=new SignedPeer('https://peer.invalid',new TextEncoder().encode('test-only-pair-secret-never-deploy!'),{
          clock:()=>100,fetcher:(url,options)=>fetch(origin+'/sync/v1/read',options)});
        const body=await p.read({kind:'slice',module:'news',record:'i',version:'v1',field:'body',offset:0,length:256});
        if(body.length!==256)throw new Error('wrong bytes');
        process.stdout.write(Buffer.from(body).toString('hex'));
        """
        result=subprocess.run(['node','--input-type=module','-e',program,'http://127.0.0.1:'+str(self.server.server_port)],cwd=ROOT,capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(result.stdout,self.source.body[:256].hex())
    def test_worker_metadata_bridge_saves_parts_and_publication(self):
        class Bridge:
            async def step(_,f,item,parts):
                if not f['upload_id']:return dict(kind='upload',upload_id='native-upload')
                if f['committed_bytes']<f['total_bytes']:return dict(kind='part',offset=0,length=f['total_bytes'],etag='native-etag')
                return dict(kind='uploaded')
            async def discard(_,f):pass
        worker=WorkerMedia(self.repo,Bridge());self.transfer.media=worker
        self.engine.handlers['cleanup']=Cleanup(self.repo,worker)
        self.until(lambda r:r['status']=='done')
        self.assertEqual(self.file()['storage_kind'],'r2');self.assertEqual(self.file()['committed_bytes'],len(self.source.blob))
        self.assertEqual(run(self.db.query('SELECT count(*) n FROM news'))[0]['n'],1)
    def test_expired_worker_upload_preserves_body_and_eventually_completes(self):
        state={'resets':0,'uploads':0}
        class Bridge:
            async def step(_,f,item,parts):
                if not f['upload_id']:
                    state['uploads']+=1
                    return dict(kind='upload',upload_id='upload-'+str(state['uploads']))
                if f['committed_bytes']<f['total_bytes']:return dict(kind='part',offset=0,length=f['total_bytes'],etag='etag-'+str(state['uploads']))
                if not state['resets']:
                    state['resets']+=1
                    return dict(kind='reset-upload')
                return dict(kind='uploaded')
            async def discard(_,f):pass
        worker=WorkerMedia(self.repo,Bridge());self.transfer.media=worker
        self.engine.handlers['cleanup']=Cleanup(self.repo,worker)
        self.until(lambda r:r['status']=='done')
        self.assertEqual(state,{'resets':1,'uploads':2})
        self.assertEqual(self.file()['committed_bytes'],len(self.source.blob))
        self.assertEqual(run(self.db.query('SELECT count(*) n FROM news'))[0]['n'],1)

    def test_worker_resource_classification_reduces_body_slice(self):
        class NativeFailure(Exception):kind='resource'
        class Bridge:
            async def step(_,f,item,parts):raise NativeFailure()
        self.transfer.media=WorkerMedia(self.repo,Bridge())
        self.until(lambda r:bool(run(self.db.query('SELECT * FROM sync_items WHERE staged_bytes=?',(len(self.source.body),)))))
        row=self.tick();self.assertEqual(row['slice_bytes'],4096);self.assertEqual(row['no_progress_count'],1)
    def test_part_replay_does_not_count_new_progress(self):
        self.tick();ctx=self.ctx();f=self.file();receipts=MediaReceipts(self.repo)
        run(receipts.part(ctx,f,0,f['part_bytes'],'etag'))
        seq=run(self.repo.read(ctx.task['task_id']))['progress_seq']
        run(receipts.part(ctx,f,0,f['part_bytes'],'etag'))
        self.assertEqual(run(self.repo.read(ctx.task['task_id']))['progress_seq'],seq)
        with self.assertRaises(ConflictError):run(receipts.part(ctx,f,0,f['part_bytes'],'changed'))
    def test_unknown_owner_not_deleted(self):
        self.tick();f=self.file();d=self.media.directory(f);(d/'owner.json').write_text('{}')
        with self.assertRaises(ConflictError):run(self.media.discard(f))
        self.assertTrue(d.exists())


class D1TransferTests(TransferTests):use_d1=True


class ProtocolTests(unittest.TestCase):
    def test_signature_tamper_stale_nonce_and_response(self):
        b=encode({'kind':'manifest'});h=request_headers(KEY,b,clock=lambda:100)
        verify_request(KEY,h,b,clock=lambda:100)
        for body,now in [(b+b'x',100),(b,221)]:
            with self.assertRaises(AuthorizationError):verify_request(KEY,h,body,clock=lambda:now)
        r=response_headers(KEY,h['x-sync-nonce'],200,{'version':'v1'},b)
        with self.assertRaises(AuthorizationError):verify_response(KEY,'a'*32,200,r,b)
        with self.assertRaises(AuthorizationError):verify_response(KEY,h['x-sync-nonce'],200,r,b+b'x')
    def test_config_origin_rejects_paths_credentials_and_cleartext(self):
        for u in ['http://example.com','https://x/a','https://u:p@x','https://x/?q=1']:
            with self.assertRaises(ValueError):HTTPPeer(u,KEY)
    def test_manifest_rejects_duplicate_or_oversize_media(self):
        f=dict(id='f',version='v1',size=1)
        for files in [[f,f],[dict(f,size=MAX_MEDIA+1)],[dict(f,size=0)]]:
            with self.assertRaises(ConflictError):manifest(dict(version='v1',fields={},files=files),'v1')
    def test_upgrade_v2_preserves_and_pauses(self):
        old=json.loads((ROOT/'site_sync/deploy/schema_v2.json').read_text());db=SQLite()
        try:
            for name,tokens in sorted(old.items(),key=lambda p:p[0].startswith('sync_tasks_due')):
                sql=re.sub(r'([<>!])\s+=',r'\1=',' '.join(tokens));db.connection.execute(sql)
            db.connection.execute('INSERT INTO sync_schema(singleton,version) VALUES(1,2)')
            plan=core_plan(ROOT/'database/schema.sql')
            before=list(db.connection.iterdump())
            with self.assertRaises(ValueError):run(ensure(db,plan,migrations=registered(plan)))
            self.assertEqual(list(db.connection.iterdump()),before)
        finally:db.close()
