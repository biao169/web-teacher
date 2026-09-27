"""Both live modes: paged metadata, per-file policy, aggregate quota and cleanup."""
import json,hashlib
import pytest
from test_accounts_regression import fixture,run
from test_transfer_integration_v66 import enabled
from test_transfer_lan_v68 import setting,manager
from transfer.backend.lan import Rooms
from transfer.backend.relay import Relay
from transfer.backend.live_folders import Manifest,Budget
S='s'*43;R='r'*43

def prep(c,r):
    enabled(c,r)
    reply=c.post('/transfer/api/settings',json={'revision':1,'relayEnabled':True},headers={'Origin':r.config.origin,'X-CSRF-Token':r.p['csrf']});assert reply.status_code==200,reply.text
    setting(r,lambda d:d.update(wanRateKbps=None,lanRateKbps=None))
def post(c,r,mode,op,**data):return c.post('/transfer/api/'+mode+'/'+op,json=data,headers={'Origin':r.config.origin,'X-CSRF-Token':r.p['csrf']})
def create(c,r,mode,size=4,files=3,dirs=2,largest=2):
    reply=post(c,r,mode,'create',key=S,name='研究资料',size=size,folder={'fileCount':files,'directoryCount':dirs,'maxFileBytes':largest});assert reply.status_code==200,reply.text
    return reply.json()['code']
def entries():return [{'kind':'file','path':'a','size':2},{'kind':'directory','path':'empty'},{'kind':'file','path':'second','size':2},{'kind':'file','path':'zero','size':0}]
def submit(c,r,mode,code,items=None,after=0):return post(c,r,mode,'manifest',key=S,code=code,after=after,entries=items if items is not None else entries())
def seal(c,r,mode,code):return post(c,r,mode,'seal',key=S,code=code)
def join(c,r,mode,code):return post(c,r,mode,'join',key=R,code=code)
def binary(c,r,code,key,offset=0,body=b''):return c.post('/transfer/api/relay/chunk',content=body,headers={'Origin':r.config.origin,'X-CSRF-Token':r.p['csrf'],'X-Relay-Key':key,'X-Relay-Code':code,'X-Offset':str(offset)})

@pytest.mark.parametrize('mode',['lan','relay'])
def test_manifest_contract_limits_auth_and_no_file_storage(fixture,mode):
    c,r=fixture;prep(c,r);setting(r,lambda d:d.update(maxFileBytes='2'));code=create(c,r,mode)
    assert join(c,r,mode,code).status_code==409
    assert seal(c,r,mode,code).status_code==409
    assert submit(c,r,mode,code).status_code==200
    assert submit(c,r,mode,code).json()['replayed']
    bad=entries();bad[0]['path']='changed';assert submit(c,r,mode,code,bad).status_code==409
    assert seal(c,r,mode,code).status_code==200
    info=join(c,r,mode,code).json();assert info['kind']=='folder' and info['fileCount']==3
    reply=post(c,r,mode,'manifest',key=R,code=code,after=0);assert reply.status_code==200
    assert [e['offset'] for e in reply.json()['entries']]==[0,2,2,4]
    assert post(c,r,mode,'manifest',key='x'*43,code=code,after=0).status_code==403
    assert post(c,r,mode,'manifest',key=R,code=code,after=0,entries=entries()).status_code==403
    assert post(c,r,mode,'seal',key=R,code=code).status_code==403
    for table in ('temporary_shares','transfer_chunks'):
        assert not run(r.sql.query('SELECT 1 FROM '+table))
    assert not run(r.sql.query("SELECT 1 FROM service_meta WHERE key LIKE 'folder:%'"))
    assert post(c,r,mode,'cancel',key=S,code=code).status_code==200
    assert post(c,r,mode,'manifest',key=R,code=code,after=0).status_code==410

@pytest.mark.parametrize('mode',['lan','relay'])
def test_empty_and_large_paged_zero_file_manifest(fixture,mode):
    c,r=fixture;prep(c,r);code=create(c,r,mode,0,0,1,0)
    assert seal(c,r,mode,code).status_code==200;assert join(c,r,mode,code).status_code==200
    assert post(c,r,mode,'manifest',key=R,code=code,after=0).json()['entries']==[]
    if mode=='relay':
        assert post(c,r,mode,'ready',key=R,code=code).status_code==200
        assert post(c,r,mode,'saved',key=R,code=code).json()['saved']
    post(c,r,mode,'cancel',key=S,code=code)
    code=create(c,r,mode,0,201,1,0)
    for start in (0,100,200):assert submit(c,r,mode,code,[{'kind':'file','path':str(i),'size':0} for i in range(start,min(start+100,201))],start).status_code==200
    seal(c,r,mode,code);join(c,r,mode,code)
    assert post(c,r,mode,'manifest',key=R,code=code,after=0).json()['next']==100
    assert len(post(c,r,mode,'manifest',key=R,code=code,after=200).json()['entries'])==1
    assert post(c,r,mode,'manifest',key=R,code=code,after=1).status_code==409


def test_relay_folder_uses_existing_one_chunk_ack_and_double_direction_quota(fixture):
    c,r=fixture;prep(c,r);code=create(c,r,'relay');submit(c,r,'relay',code);seal(c,r,'relay',code);join(c,r,'relay',code)
    setting(r,lambda d:d.update(totalDailyBytes='7'))
    assert post(c,r,'relay','ready',key=R,code=code).status_code==409
    assert not run(r.sql.query('SELECT 1 FROM transfer_allowances'))
    setting(r,lambda d:d.update(totalDailyBytes='8'))
    assert post(c,r,'relay','ready',key=R,code=code).status_code==200
    assert binary(c,r,code,S,body=b'abcd').status_code==200
    assert binary(c,r,code,R).content==b'abcd'
    assert post(c,r,'relay','saved',key=R,code=code).status_code==409
    ack=post(c,r,'relay','ack',key=R,code=code,offset=0,sha256=hashlib.sha256(b'abcd').hexdigest());assert ack.json()['offset']==4
    assert post(c,r,'relay','saved',key=R,code=code).json()['saved']
    assert sum(json.loads(row['outcome'])['used'] for row in run(r.sql.query('SELECT outcome FROM transfer_allowances')))==8


@pytest.mark.parametrize('mode',['lan','relay'])
def test_permission_revocation_and_declared_limits_remain_enforced(fixture,mode):
    c,r=fixture;prep(c,r)
    setting(r,lambda d:d.update(maxFileBytes='1'))
    assert post(c,r,mode,'create',key=S,name='a',size=2,folder={'fileCount':1,'directoryCount':1,'maxFileBytes':2}).status_code==403
    setting(r,lambda d:d.update(maxFileBytes=None));code=create(c,r,mode);submit(c,r,mode,code);seal(c,r,mode,code)
    setting(r,lambda d:d.update(allowDownloads=False));assert join(c,r,mode,code).status_code==403


def test_ephemeral_metadata_budget_path_conflicts_and_expiry_cleanup(fixture):
    c,r=fixture;prep(c,r);runtime=manager(r)
    budget=Budget(100);m=Manifest('root',0,{'fileCount':1,'directoryCount':1,'maxFileBytes':0},budget)
    with pytest.raises(Exception,match='内存'):m.submit(0,[{'kind':'file','path':'x'*150,'size':0}])
    assert budget.used==0
    m.release()
    for bad in ('../x','CON','/absolute','a\\b','\ud800'):
        m=Manifest('root',0,{'fileCount':1,'directoryCount':1,'maxFileBytes':0},Budget())
        with pytest.raises(Exception):m.submit(0,[{'kind':'file','path':bad,'size':0}])
        assert m.storage==0
    m=Manifest('root',0,{'fileCount':2,'directoryCount':1,'maxFileBytes':0},Budget());m.submit(0,[{'kind':'file','path':'a','size':0},{'kind':'file','path':'A','size':0}])
    with pytest.raises(Exception,match='冲突'):m.seal()
    async def scenario():
        budget=Budget();clock=[0];lan=Rooms(clock=lambda:clock[0],budget=budget);relay=Relay(clock=lambda:clock[0],budget=budget)
        for rooms in (lan,relay):
            result=await rooms.act(runtime,'create',{'key':S,'name':'root','size':0,'folder':{'fileCount':1,'directoryCount':1,'maxFileBytes':0}})
            await rooms.act(runtime,'manifest',{'key':S,'code':result['code'],'after':0,'entries':[{'kind':'file','path':'a','size':0}]})
        assert budget.used>0
        lan.drop(next(iter(lan.rooms)));assert budget.used>0
        clock[0]=181;relay.sweep();assert budget.used==0
    run(scenario())
