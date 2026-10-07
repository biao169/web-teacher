"""Protocol, accounting, old checkpoints and resource gates on synthetic local storage."""
import asyncio,hashlib,json,sqlite3
from pathlib import Path
from types import SimpleNamespace
import pytest
from test_accounts_regression import fixture,run
from test_transfer_integration_v66 import enabled
from backend.app.native.database import Database,SCHEMA
from backend.app.native.schema_upgrade import migrate
from transfer.backend.native import Transfers
from transfer.backend.management import Management
from transfer.backend.accounting import milliseconds as ms
from transfer.backend.resources import BoundedIO,Capacity
from backend.app.native.storage import LocalStore


def headers(r):return {'Origin':r.config.origin,'X-CSRF-Token':r.p['csrf']}
def task(c,r,parts):
    enabled(c,r);t=c.post('/transfer/api/tasks',json={'name':'file.bin','size':sum(map(len,parts))},headers=headers(r)).json();offset=0
    for part in parts:
        reply=c.post('/transfer/api/tasks/'+t['id']+'/chunk',content=part,headers={**headers(r),'X-Offset':str(offset)})
        assert reply.status_code==200,reply.text
        offset+=len(part)
    return t

def start(c,r,t,key='k'*43):
    reply=c.post('/transfer/api/receive',json={'token':t['token'],'key':key},headers=headers(r));assert reply.status_code==200,reply.text
    return reply.json(),{**headers(r),'X-Receive-Key':key}

def action(c,session,h,name,**data):return c.post('/transfer/api/receive/'+session['id']+'/'+name,json=data,headers=h)
def digest(data):return hashlib.sha256(data).hexdigest()


def test_indexed_upload_replay_is_exact_and_not_recharged(fixture):
    c,r=fixture;t=task(c,r,[b'first',b'last']);h=headers(r)
    before=run(r.sql.query('SELECT bytes,outcome FROM transfer_allowances'))
    path='/transfer/api/tasks/'+t['id']+'/chunk'
    reply=c.post(path,content=b'first',headers={**h,'X-Offset':'0'})
    assert reply.status_code==200 and reply.json()['replayed']
    assert c.post(path,content=b'wrong',headers={**h,'X-Offset':'0'}).status_code==409
    assert run(r.sql.query('SELECT bytes,outcome FROM transfer_allowances'))==before
    point=json.loads(run(r.sql.query('SELECT point FROM recovery_tasks'))[0]['point']);assert point['parts']==[] and point['bytes']==9
    assert len(run(r.sql.query('SELECT * FROM transfer_chunks')))==2
    assert c.get('/transfer/s/'+t['token']).content==b'firstlast'


def test_checkpoint_pages_hide_keys_and_scale_with_page_not_file(fixture):
    c,r=fixture;t=task(c,r,[b'x']*130);base='/transfer/api/tasks/'+t['id'];offset=0;counts=[]
    while True:
        page=c.get(base+'?after='+str(offset)).json();counts.append(len(page['parts']))
        assert page['confirmed']==130 and all('key' not in p for p in page['parts'])
        if page['next_offset'] is None:break
        offset=page['next_offset']
    assert counts==[64,64,2]
    assert c.get(base+'?after=-1').status_code==422


def test_receive_window_rejects_ahead_and_duplicate_ack_does_not_charge(fixture):
    c,r=fixture;t=task(c,r,[b'one',b'two']);s,h=start(c,r,t)
    repeated,_=start(c,r,t);assert repeated['id']==s['id']
    assert run(r.sql.query('SELECT downloads FROM temporary_shares'))[0]['downloads']==1
    assert action(c,s,h,'chunk',offset=3).status_code==409
    first=action(c,s,h,'chunk',offset=0);assert first.content==b'one' and first.headers['x-chunk-size']=='3'
    assert action(c,s,h,'chunk',offset=3).status_code==409
    assert action(c,s,h,'chunk',offset=0).content==b'one'
    ledger=run(r.sql.query('SELECT outcome FROM transfer_allowances WHERE member=?',(s['id'],)))[0]
    assert json.loads(ledger['outcome'])['used']==3
    assert action(c,s,h,'ack',offset=0,sha256='0'*64).status_code==409
    assert action(c,s,h,'ack',offset=0,sha256=digest(b'one')).json()['offset']==3
    assert action(c,s,h,'ack',offset=0,sha256=digest(b'one')).json()['offset']==3
    assert action(c,s,h,'chunk',offset=3).content==b'two'
    assert action(c,s,h,'ack',offset=3,sha256=digest(b'two')).json()['complete']
    assert action(c,s,h,'ack',offset=3,sha256=digest(b'two')).json()['complete']
    assert action(c,s,h,'status').json()['offered_bytes']==9
    row=run(r.sql.query('SELECT bytes,finished_at FROM transfer_allowances WHERE member=?',(s['id'],)))[0]
    assert int(row['bytes'])==6 and row['finished_at'] is not None


def test_cancel_expiry_wrong_identity_and_replay_cap(fixture):
    c,r=fixture;t=task(c,r,[b'one',b'two']);s,h=start(c,r,t)
    bad={**h,'X-Receive-Key':'wrong'};assert action(c,s,bad,'status').status_code==403
    for _ in range(3):assert action(c,s,h,'chunk',offset=0).content==b'one'
    assert action(c,s,h,'chunk',offset=0).status_code==409
    assert action(c,s,h,'cancel').status_code==200
    assert action(c,s,h,'cancel').status_code==200
    assert action(c,s,h,'chunk',offset=0).status_code==410
    row=run(r.sql.query('SELECT bytes FROM transfer_allowances WHERE member=?',(s['id'],)))[0];assert row['bytes']=='3'
    run(r.sql.batch([('UPDATE temporary_shares SET max_downloads=2 WHERE id=?',(t['id'],))]))
    s,h=start(c,r,t,'j'*43)
    run(r.sql.batch([('UPDATE transfer_receivers SET expires_at=? WHERE id=?',(ms()-1,s['id'])),('UPDATE transfer_allowances SET expires_at=? WHERE member=?',(ms()-1,s['id']))]))
    assert action(c,s,h,'status').status_code==410
    assert c.get('/transfer/api/admin/usage').json()['total']['daily']['charged_and_reserved']==9 # upload 6 + confirmed send 3


def test_revocation_and_permission_recheck(fixture):
    c,r=fixture;t=task(c,r,[b'one']);s,h=start(c,r,t)
    assert action(c,s,h,'chunk',offset=0).status_code==200
    run(r.sql.batch([("UPDATE temporary_shares SET state='revoked' WHERE id=?",(t['id'],))]))
    assert action(c,s,h,'ack',offset=0,sha256=digest(b'one')).status_code==409
    assert action(c,s,h,'cancel').status_code==200


def test_paged_cleanup_deletes_every_disk_chunk(fixture):
    c,r=fixture;t=task(c,r,[b'x']*18)
    p={**r.p,'_integrated':True};manager=Management(Transfers(r.sql,LocalStore(r.settings.transfer_media_dir),indexed=True),p)
    assert not run(manager.purge(t['id']))['done'];assert not run(manager.purge(t['id']))['done'];assert run(manager.purge(t['id']))['done']
    assert not list(r.settings.transfer_media_dir.rglob('*.part'))
    assert not run(r.sql.query('SELECT * FROM transfer_chunks'))


def test_v66_schema_and_legacy_checkpoint_conversion(tmp_path):
    from sync_schema_contract import assert_unsupported
    assert_unsupported(tmp_path,'0.15.65')


def test_resource_gate_rejects_before_body_and_releases_cancelled_slot():
    async def scenario():
        entered=asyncio.Event();release=asyncio.Event();calls=[];pool=Capacity(1,4194304,1)
        async def app(scope,receive,send):entered.set();await release.wait()
        gate=BoundedIO(app,pool)
        async def no_body():raise AssertionError('Body must not be buffered on rejection')
        async def send(message):calls.append(message)
        scope={'type':'http','path':'/transfer/api/tasks/test/chunk'}
        first=asyncio.create_task(gate(scope,no_body,send));await entered.wait()
        await gate(scope,no_body,send);assert calls[0]['status']==503 and pool.active==1
        first.cancel()
        with pytest.raises(asyncio.CancelledError):await first
        assert pool.active==0 and pool.peak==1
    run(scenario())


def test_resource_gate_does_not_take_slot_for_teacher_or_metadata():
    async def scenario():
        pool=Capacity(1,4194304,1);pool.active=1;seen=[]
        async def app(scope,receive,send):seen.append(scope['path'])
        gate=BoundedIO(app,pool)
        await gate({'type':'http','path':'/transfer/api/tasks'},None,None)
        assert seen==['/transfer/api/tasks'] and pool.active==1
    run(scenario())


def test_anonymous_receive_respects_origin_and_config(fixture):
    c,r=fixture;t=task(c,r,[b'one'])
    assert c.post('/transfer/api/receive',json={'token':t['token'],'key':'x'*43},headers={'Origin':'https://other.example'}).status_code==403
    c.cookies.clear()
    assert c.post('/transfer/api/receive',json={'token':t['token'],'key':'x'*43},headers={'Origin':r.config.origin}).status_code==403
    from transfer.backend.settings import edit
    row=run(r.sql.query('SELECT document FROM tool_settings'))[0];policy=edit(json.loads(row['document']),{'guestReceive':True})
    run(r.sql.batch([('UPDATE tool_settings SET document=?,revision=revision+1',(json.dumps(policy),))]))
    response=c.post('/transfer/api/receive',json={'token':t['token'],'key':'x'*43},headers={'Origin':r.config.origin});assert response.status_code==200,response.text
    assert action(c,response.json(),{'Origin':r.config.origin,'X-Receive-Key':'x'*43},'chunk',offset=0).content==b'one'


def test_body_length_rejected_before_read_and_slot_freed(fixture):
    c,r=fixture;t=task(c,r,[b'one'])
    reply=c.post('/transfer/api/tasks/'+t['id']+'/chunk',content=b'x',headers={**headers(r),'X-Offset':'0','Content-Length':'1048577'})
    assert reply.status_code==413
    assert c.app.state.transfer_capacity.active==0
    assert c.get('/zh').status_code==200


def test_slow_asgi_send_retains_slot_until_transport_accepts():
    async def scenario():
        pool=Capacity(1,4194304,1);blocked=asyncio.Event();release=asyncio.Event();chunks=[]
        async def app(scope,receive,send):
            await send({'type':'http.response.start','status':200,'headers':[]})
            for n in range(2):chunks.append(n);await send({'type':'http.response.body','body':b'x','more_body':n==0})
        async def send(message):
            if message['type']=='http.response.body':blocked.set();await release.wait()
        gate=BoundedIO(app,pool);request=asyncio.create_task(gate({'type':'http','path':'/transfer/s/test'},None,send))
        await blocked.wait();assert chunks==[0] and pool.active==1;release.set();await request;assert pool.active==0 and chunks==[0,1]
    run(scenario())


def test_v66_completed_cleanup_can_upgrade(tmp_path):
    from sync_schema_contract import assert_unsupported
    assert_unsupported(tmp_path,'0.15.66')


def test_concurrent_identical_upload_only_commits_one_chunk(fixture):
    c,r=fixture;enabled(c,r)
    response=c.post('/transfer/api/tasks',json={'name':'race','size':3},headers=headers(r));t=response.json()
    async def scenario():
        class YieldingStore(LocalStore):
            arrived=0
            def __init__(self,root):super().__init__(root);self.ready=asyncio.Event()
            async def put(self,key,data):
                await super().put(key,data);self.arrived+=1
                if self.arrived==2:self.ready.set()
                await self.ready.wait()
        store=YieldingStore(r.settings.transfer_media_dir);service=Transfers(r.sql,store,indexed=True)
        results=await asyncio.gather(service.chunk({'uid':r.p['uid'],'send':True},t['id'],0,b'one'),service.chunk({'uid':r.p['uid'],'send':True},t['id'],0,b'one'),return_exceptions=True)
        assert sum(isinstance(v,dict) for v in results)==1
        assert len(await r.sql.query('SELECT * FROM transfer_chunks'))==1
        assert len(list(store.root.rglob('*.part')))==1
        ledger=(await r.sql.query("SELECT outcome FROM transfer_allowances WHERE member='upload'"))[0];assert json.loads(ledger['outcome'])['used']==3
    run(scenario())


def test_idle_body_times_out_and_releases_slot():
    async def scenario():
        pool=Capacity(1,4194304,1);messages=[]
        async def app(scope,receive,send):await receive()
        async def receive():await asyncio.Event().wait()
        async def send(message):messages.append(message)
        await BoundedIO(app,pool)({'type':'http','path':'/transfer/api/tasks/test/chunk'},receive,send)
        assert messages[0]['status']==408 and pool.active==0
    run(scenario())
