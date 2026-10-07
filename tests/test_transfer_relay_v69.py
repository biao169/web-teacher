"""Bounded online relay using disposable main SQL and synthetic HTTP clients."""
import hashlib,json,asyncio
import pytest
from test_accounts_regression import fixture,run
from test_transfer_integration_v66 import enabled
from test_transfer_lan_v68 import setting,manager
from transfer.backend.relay import Relay
S='s'*43;R='r'*43

def headers(r,key=None,code=None,offset=0):return {'Origin':r.config.origin,'X-CSRF-Token':r.p['csrf'],**({'X-Relay-Key':key,'X-Relay-Code':code,'X-Offset':str(offset)} if key else {})}
def post(c,r,op,**data):return c.post('/transfer/api/relay/'+op,json=data,headers=headers(r))
def setup(c,r,size=6):
    enabled(c,r)
    reply=c.post('/transfer/api/settings',json={'revision':1,'relayEnabled':True},headers=headers(r));assert reply.status_code==200,reply.text
    setting(r,lambda doc:doc.update(wanRateKbps=None))
    reply=post(c,r,'create',key=S,name='large.bin',size=size);assert reply.status_code==200,reply.text
    code=reply.json()['code'];assert post(c,r,'join',key=R,code=code).status_code==200
    return code

def chunk(c,r,code,key,offset=0,body=b''):
    return c.post('/transfer/api/relay/chunk',content=body,headers=headers(r,key,code,offset))
def ack(c,r,code,offset,data):return post(c,r,'ack',key=R,code=code,offset=offset,sha256=hashlib.sha256(data).hexdigest())
def used(r):return sum(json.loads(x['outcome'])['used'] for x in run(r.sql.query('SELECT outcome FROM transfer_allowances')))

def test_ready_reserves_both_directions_and_one_block_window(fixture):
    c,r=fixture;code=setup(c,r)
    assert not run(r.sql.query('SELECT * FROM transfer_allowances'))
    assert chunk(c,r,code,S,body=b'abc').status_code==409
    assert post(c,r,'ready',key=R,code=code).status_code==200
    assert post(c,r,'ready',key=R,code=code).status_code==200
    assert len(run(r.sql.query('SELECT * FROM transfer_allowances')))==2
    assert chunk(c,r,code,S,body=b'abc').status_code==200
    assert chunk(c,r,code,S,offset=3,body=b'def').status_code==409
    assert post(c,r,'saved',key=R,code=code).status_code==409
    assert ack(c,r,code,0,b'abc').status_code==409
    assert chunk(c,r,code,R).content==b'abc'
    assert ack(c,r,code,0,b'abc').json()['offset']==3
    assert ack(c,r,code,0,b'abc').json()['offset']==3
    assert chunk(c,r,code,S,offset=3,body=b'def').status_code==200
    assert chunk(c,r,code,R,offset=3).content==b'def'
    assert ack(c,r,code,3,b'def').json()['offset']==6
    assert post(c,r,'saved',key=R,code=code).json()['saved']
    assert used(r)==12
    assert not run(r.sql.query('SELECT * FROM transfer_chunks'))
    assert not run(r.sql.query('SELECT * FROM temporary_shares'))
    assert post(c,r,'status',key=S,code=code).json()['saved']


def test_retries_charged_and_bounded(fixture):
    c,r=fixture;code=setup(c,r,size=3);post(c,r,'ready',key=R,code=code)
    for _ in range(3):assert chunk(c,r,code,S,body=b'abc').status_code==200
    assert chunk(c,r,code,S,body=b'abc').status_code==409
    for _ in range(3):assert chunk(c,r,code,R).content==b'abc'
    assert chunk(c,r,code,R).status_code==409
    assert used(r)==18
    assert ack(c,r,code,0,b'abc').status_code==200
    assert post(c,r,'saved',key=R,code=code).status_code==200


def test_quota_atomic_pair_reservation_and_retry_denial(fixture):
    c,r=fixture;code=setup(c,r,size=3)
    setting(r,lambda doc:doc.update(totalDailyBytes='5'))
    assert post(c,r,'ready',key=R,code=code).status_code==409
    assert not run(r.sql.query('SELECT * FROM transfer_allowances'))
    setting(r,lambda doc:doc.update(totalDailyBytes='6'))
    assert post(c,r,'ready',key=R,code=code).status_code==200
    assert chunk(c,r,code,S,body=b'abc').status_code==200
    assert chunk(c,r,code,S,body=b'abc').status_code==409
    assert chunk(c,r,code,R).content==b'abc'
    assert chunk(c,r,code,R).status_code==409
    assert used(r)==6


def test_cancel_releases_unused_and_preserves_charged(fixture):
    c,r=fixture;code=setup(c,r);post(c,r,'ready',key=R,code=code);chunk(c,r,code,S,body=b'abc')
    assert post(c,r,'cancel',key=R,code=code).status_code==200
    rows=run(r.sql.query('SELECT bytes,finished_at FROM transfer_allowances'))
    assert sum(int(x['bytes']) for x in rows)==3 and all(x['finished_at'] for x in rows)
    assert post(c,r,'status',key=S,code=code).status_code==410


def test_source_and_receiver_permissions_and_request_bounds(fixture):
    c,r=fixture;code=setup(c,r);post(c,r,'ready',key=R,code=code)
    assert c.post('/transfer/api/relay/status',json={'key':S,'code':code}).status_code==403
    assert post(c,r,'status',key='x'*43,code=code).status_code==403
    assert chunk(c,r,code,S,body=b'x'*1048577).status_code==413
    assert c.post('/transfer/api/relay/status',content=b'x'*4097,headers=headers(r)).status_code==413
    setting(r,lambda doc:doc.update(allowDownloads=False))
    assert chunk(c,r,code,S,body=b'abc').status_code==403
    assert post(c,r,'status',key=S,code=code).status_code==410


def test_ephemeral_memory_limit_slow_receiver_and_expiry(fixture):
    c,r=fixture;setup(c,r);runtime=manager(r)
    async def scenario():
        clock=[0];relay=Relay(slots=1,clock=lambda:clock[0])
        code=(await relay.act(runtime,'create',{'key':S,'name':'big','size':5*1024**3}))['code']
        await relay.act(runtime,'join',{'key':R,'code':code});await relay.act(runtime,'ready',{'key':R,'code':code})
        with pytest.raises(Exception,match='会话已满'):await relay.act(runtime,'create',{'key':'x'*43,'name':'x','size':1})
        body=b'x'*1048576;await relay.act(runtime,'chunk',{'key':S,'code':code,'offset':0},body)
        assert relay.retained==relay.peak==1048576
        with pytest.raises(Exception,match='位置不匹配'):await relay.act(runtime,'chunk',{'key':S,'code':code,'offset':1048576},body)
        clock[0]=100;await relay.act(runtime,'status',{'key':S,'code':code})
        clock[0]=181;relay.sweep();assert relay.retained==0 and not relay.rooms
    run(scenario())


def test_empty_read_no_charge_and_live_throttle(fixture):
    c,r=fixture
    # Six bytes at 1 Kbps expire after 48ms; real HTTP/DB work can exceed that.
    # Exercise the production clock boundary deterministically, not wall timing.
    clock=[100.0]
    from starlette.routing import Mount
    transfer=next(route.app for route in c.app.routes if isinstance(route,Mount) and route.path=='/transfer')
    transfer.app.state.online_relay.clock=lambda:clock[0]
    code=setup(c,r);post(c,r,'ready',key=R,code=code)
    assert chunk(c,r,code,R).status_code==425 and used(r)==0
    setting(r,lambda doc:doc.update(wanRateKbps=1))
    assert chunk(c,r,code,S,body=b'x'*6).status_code==200
    assert chunk(c,r,code,R).status_code==429
    assert post(c,r,'status',key=S,code=code).json()['wait_ms']>0
    clock[0]+=1
    assert post(c,r,'status',key=S,code=code).json()['wait_ms']==0
    assert chunk(c,r,code,R).content==b'x'*6


def test_wrong_hash_cannot_ack_or_rewrite_pending(fixture):
    c,r=fixture;code=setup(c,r);post(c,r,'ready',key=R,code=code)
    chunk(c,r,code,S,body=b'abc')
    assert chunk(c,r,code,S,body=b'xyz').status_code==409
    chunk(c,r,code,R)
    assert ack(c,r,code,0,b'xyz').status_code==409
    assert post(c,r,'status',key=S,code=code).json()['offset']==0


def test_revocation_releases_and_fresh_process_cannot_resume(fixture):
    c,r=fixture;code=setup(c,r);post(c,r,'ready',key=R,code=code)
    runtime=manager(r)
    async def scenario():
        with pytest.raises(Exception,match='过期或服务已重启'):await Relay().act(runtime,'status',{'key':S,'code':code})
    run(scenario())
    run(r.sql.batch([("UPDATE auth_permissions SET can_create=0 WHERE role_uid=? AND module='transfer'",(r.p['role_uid'],))]))
    assert post(c,r,'status',key=R,code=code).status_code==403
    assert all(row['finished_at'] for row in run(r.sql.query('SELECT finished_at FROM transfer_allowances')))


def test_cancelled_request_finishes_commit_and_memory_transition(fixture):
    c,r=fixture;setup(c,r);runtime=manager(r)
    async def scenario():
        relay=Relay();code=(await relay.act(runtime,'create',{'key':S,'name':'x','size':3}))['code']
        await relay.act(runtime,'join',{'key':R,'code':code});await relay.act(runtime,'ready',{'key':R,'code':code})
        committed=asyncio.Event();release=asyncio.Event();original=runtime.sql
        class Delayed:
            async def query(self,*args):return await original.query(*args)
            async def batch(self,statements):
                result=await original.batch(statements)
                if any('json_set' in text for text,args in statements):committed.set();await release.wait()
                return result
        runtime.sql=Delayed()
        writing=asyncio.create_task(relay.act(runtime,'chunk',{'key':S,'code':code,'offset':0},b'abc'))
        await committed.wait();writing.cancel();await asyncio.sleep(0);assert relay.lock.locked()
        release.set()
        with pytest.raises(asyncio.CancelledError):await writing
        state=await relay.act(runtime,'status',{'key':S,'code':code});assert state['pending'] and relay.retained==3
        runtime.sql=original;await relay.act(runtime,'cancel',{'key':S,'code':code})
    run(scenario())


def test_four_concurrent_rooms_hold_four_blocks_not_four_files(fixture):
    c,r=fixture;setup(c,r)
    setting(r,lambda doc:[rule.update(concurrency=8) for rule in doc['rules']])
    runtime=manager(r)
    async def scenario():
        relay=Relay(slots=4);rooms=[]
        for n in range(4):
            key=chr(97+n)*43;peer=chr(107+n)*43
            code=(await relay.act(runtime,'create',{'key':key,'name':'concurrent','size':10485760}))['code']
            await relay.act(runtime,'join',{'key':peer,'code':code});await relay.act(runtime,'ready',{'key':peer,'code':code});rooms.append((code,key,peer))
        with pytest.raises(Exception,match='会话已满'):await relay.act(runtime,'create',{'key':'z'*43,'name':'fifth','size':1})
        await asyncio.gather(*(relay.act(runtime,'chunk',{'key':key,'code':code,'offset':0},b'x'*1048576) for code,key,peer in rooms))
        assert relay.retained==relay.peak==4*1048576
        await asyncio.gather(*(relay.act(runtime,'chunk',{'key':peer,'code':code,'offset':0},b'') for code,key,peer in rooms))
        assert relay.retained==4*1048576
        for code,key,peer in rooms:await relay.act(runtime,'cancel',{'key':key,'code':code})
        assert relay.retained==0
    run(scenario())
