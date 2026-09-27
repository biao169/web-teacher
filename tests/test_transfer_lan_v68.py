"""Synthetic HTTP signaling checks; not a two-device LAN/ICE measurement."""
import json
import pytest
from test_accounts_regression import fixture,run,user
from test_transfer_integration_v66 import enabled
from transfer.backend.lan import Rooms,description,MAX_ROOMS
from types import SimpleNamespace
from transfer.backend.native import Transfers

KEY='s'*43
RECEIVE='r'*43

def headers(r):return {'Origin':r.config.origin,'X-CSRF-Token':r.p['csrf']}
def post(c,r,op,**data):return c.post('/transfer/api/lan/'+op,json=data,headers=headers(r))
def create(c,r,**extra):
    result=post(c,r,'create',**({'key':KEY,'name':'大文件.bin','size':5*1024**3}|extra));assert result.status_code==200,result.text
    return result.json()['code']
def sdp(kind='offer',candidate='host'):
    return {'type':kind,'sdp':'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 '+'AA:'*31+'AA\r\na=candidate:1 1 udp 2122260223 192.168.1.2 4567 typ '+candidate+'\r\n'}
def manager(r):
    return SimpleNamespace(sql=r.sql,p={**r.p,'role_id':r.p['role_uid']},service=Transfers(r.sql,None))
def setting(r,change):
    row=run(r.sql.query('SELECT document FROM tool_settings WHERE id=1'))[0];doc=json.loads(row['document']);change(doc)
    run(r.sql.batch([('UPDATE tool_settings SET document=?,revision=revision+1 WHERE id=1',(json.dumps(doc),))]))

def test_large_file_pairing_idempotent_no_storage(fixture):
    c,r=fixture;enabled(c,r);code=create(c,r)
    assert create(c,r)==code
    result=post(c,r,'join',code=code,key=RECEIVE);assert result.status_code==200,result.text
    assert result.json()['size']==5*1024**3 and result.json()['server_file_bytes']==0
    assert post(c,r,'join',code=code,key=RECEIVE).status_code==200
    assert post(c,r,'join',code=code,key='x'*43).status_code==409
    assert post(c,r,'signal',code=code,key=KEY,description=sdp()).status_code==200
    reply=post(c,r,'poll',code=code,key=RECEIVE);assert reply.json()['description']==sdp()
    assert run(r.sql.query('SELECT count(*) n FROM temporary_shares'))[0]['n']==0
    assert run(r.sql.query('SELECT count(*) n FROM transfer_chunks'))[0]['n']==0
    assert post(c,r,'cancel',code=code,key=RECEIVE).status_code==200
    assert post(c,r,'poll',code=code,key=KEY).status_code==410


def test_csrf_origin_and_credential_fences(fixture):
    c,r=fixture;enabled(c,r);code=create(c,r)
    for h in ({},{'Origin':'https://evil.test'},{'Origin':r.config.origin}):
        assert c.post('/transfer/api/lan/poll',json={'code':code,'key':KEY},headers=h).status_code==403
    assert post(c,r,'poll',code=code,key='x'*43).status_code==403
    assert post(c,r,'create',name='x',size=1,key='short').status_code==403
    c.cookies.clear()
    assert c.post('/transfer/api/lan/poll',json={'code':code,'key':KEY},headers={'Origin':r.config.origin}).status_code==403
    assert c.post('/transfer/api/lan/join',json={'code':code,'key':RECEIVE},headers={'Origin':r.config.origin}).status_code==403


def test_signaling_strict_shape_size_and_candidates(fixture):
    c,r=fixture;enabled(c,r)
    for desc in [sdp(candidate='relay'),sdp(candidate='srflx'),{'type':'offer','sdp':'x'*40000},dict(sdp(),file='payload'),sdp('answer')]:
        code=create(c,r)
        assert post(c,r,'signal',code=code,key=KEY,description=desc).status_code==422
        post(c,r,'cancel',code=code,key=KEY)
    code=create(c,r)
    assert post(c,r,'signal',code=code,key=KEY,description=sdp(),bytes='payload').status_code==422
    assert c.post('/transfer/api/lan/signal',content=b'x'*49153,headers=headers(r)).status_code==413
    assert post(c,r,'file',code=code,key=KEY).status_code==422


def test_revoked_session_and_new_policy_end_room(fixture):
    c,r=fixture;enabled(c,r);rooms=Rooms();runtime=manager(r)
    code=run(rooms.act(runtime,'create',{'key':KEY,'name':'x','size':1}))['code']
    run(r.auth.logout(r.p))
    with pytest.raises(Exception,match='权限已失效'):run(rooms.act(runtime,'poll',{'key':KEY,'code':code}))
    assert not rooms.rooms


def test_expiry_requires_both_sides_and_concurrency_bounded(fixture):
    c,r=fixture;enabled(c,r);clock=[0];rooms=Rooms(lambda:clock[0]);runtime=manager(r)
    code=run(rooms.act(runtime,'create',{'key':KEY,'name':'x','size':1}))['code']
    run(rooms.act(runtime,'join',{'key':RECEIVE,'code':code}))
    clock[0]=100;run(rooms.act(runtime,'poll',{'key':KEY,'code':code}))
    clock[0]=181
    with pytest.raises(Exception,match='过期'):run(rooms.act(runtime,'poll',{'key':KEY,'code':code}))
    assert not rooms.rooms
    for key in (KEY,RECEIVE):run(rooms.act(runtime,'create',{'key':key,'name':'x','size':1}))
    with pytest.raises(Exception,match='会话数已满'):run(rooms.act(runtime,'create',{'key':'x'*43,'name':'x','size':1}))


@pytest.mark.parametrize('field',['totalDailyBytes','totalWeeklyBytes','totalMonthlyBytes','maxFileBytes'])
def test_limits_do_not_silently_bypass(fixture,field):
    c,r=fixture;enabled(c,r);setting(r,lambda doc:doc.update({field:'1'}))
    reply=post(c,r,'create',key=KEY,name='x',size=2);assert reply.status_code==403
    assert ('硬配额' if field!='maxFileBytes' else '大小限制') in reply.json()['error']


def test_admin_lan_switch_and_live_directions(fixture):
    c,r=fixture;enabled(c,r)
    reply=c.post('/transfer/api/settings',json={'revision':1,'lanEnabled':False},headers=headers(r));assert reply.status_code==200,reply.text
    assert post(c,r,'create',key=KEY,name='x',size=1).status_code==403
    setting(r,lambda doc:doc.update(lanEnabled=True));code=create(c,r)
    setting(r,lambda doc:doc.update(allowUploads=False))
    assert post(c,r,'poll',key=KEY,code=code).status_code==403
    assert post(c,r,'poll',key=KEY,code=code).status_code==410


def test_anonymous_receive_only_when_configured(fixture):
    c,r=fixture;enabled(c,r);code=create(c,r)
    setting(r,lambda doc:[rule.update(receive=True) for rule in doc['rules'] if rule['kind']=='anonymous'])
    c.cookies.clear();h={'Origin':r.config.origin}
    reply=c.post('/transfer/api/lan/join',json={'code':code,'key':RECEIVE},headers=h);assert reply.status_code==200,reply.text
    assert c.post('/transfer/api/lan/create',json={'name':'x','size':1,'key':'x'*43},headers=h).status_code==403


def test_role_rule_reselected_after_role_change(fixture):
    c,r=fixture;enabled(c,r);rooms=Rooms();runtime=manager(r)
    code=run(rooms.act(runtime,'create',{'key':KEY,'name':'x','size':1}))['code']
    # Main role remains authorized, but its new per-role transfer policy denies send.
    setting(r,lambda doc:doc['rules'].insert(0,{'kind':'role','id':r.p['role_uid'],'send':False,'receive':True,'links':['lan-direct']}))
    with pytest.raises(Exception,match='未获准'):run(rooms.act(runtime,'poll',{'key':KEY,'code':code}))


def test_signal_rate_limit_and_opposite_description(fixture):
    c,r=fixture;enabled(c,r);clock=[0];rooms=Rooms(lambda:clock[0]);runtime=manager(r)
    code=run(rooms.act(runtime,'create',{'key':KEY,'name':'x','size':1}))['code']
    run(rooms.act(runtime,'join',{'key':RECEIVE,'code':code}))
    run(rooms.act(runtime,'signal',{'key':KEY,'code':code,'description':sdp()}))
    run(rooms.act(runtime,'poll',{'key':KEY,'code':code}))
    with pytest.raises(Exception,match='查询过快'):run(rooms.act(runtime,'poll',{'key':KEY,'code':code}))
    result=run(rooms.act(runtime,'signal',{'key':RECEIVE,'code':code,'description':sdp('answer')}))
    assert result['description']==sdp()
    clock[0]=1;assert run(rooms.act(runtime,'poll',{'key':KEY,'code':code}))['description']==sdp('answer')
