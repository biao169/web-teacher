"""Short codes reuse existing transfer permissions and bounded receive pipelines."""
import re
import pytest
from test_accounts_regression import fixture,run
from test_transfer_integration_v66 import enabled
from test_transfer_lan_v68 import headers,setting,KEY,RECEIVE
from transfer.backend.codes import Limiter
from backend.app.native.catalog import Error


def call(c,r,op,**data):
    return c.post('/transfer/api/codes/'+op,json=data,headers=headers(r))


def offline(c,r):
    task=c.post('/transfer/api/tasks',json={'name':'example.txt','size':4},headers=headers(r)).json()
    reply=c.post('/transfer/api/tasks/'+task['id']+'/chunk',content=b'test',headers={**headers(r),'X-Offset':'0'})
    assert reply.status_code==200,reply.text
    return task


@pytest.mark.parametrize('mode',['lan','relay'])
def test_live_issue_resolve_cancel_and_sender_fences(fixture,mode):
    c,r=fixture;enabled(c,r)
    assert c.post('/transfer/api/settings',json={'revision':1,'relayEnabled':True},headers=headers(r)).status_code==200
    reply=c.post('/transfer/api/'+mode+'/create',json={'key':KEY,'name':'large.bin','size':12},headers=headers(r))
    assert reply.status_code==200,reply.text
    target=reply.json()['code']
    assert call(c,r,'issue',mode=mode,target=target,key=RECEIVE).status_code==403
    result=call(c,r,'issue',mode=mode,target=target,key=KEY)
    assert result.status_code==200,result.text
    code=result.json()['code'];assert re.fullmatch('[A-Z]{2}[0-9]{4}',code)
    assert call(c,r,'issue',mode=mode,target=target,key=KEY).json()['code']==code
    result=call(c,r,'resolve',code=' '+code.lower()+' ',key=RECEIVE)
    assert result.status_code==200,result.text
    assert result.json()['session']['role']=='receive'
    assert 'secret' not in result.text
    assert call(c,r,'resolve',code=code,key='x'*43).status_code==409
    assert call(c,r,'revoke',code=code,key=RECEIVE).status_code==403
    assert call(c,r,'revoke',code=code,key=KEY).status_code==200
    assert call(c,r,'resolve',code=code,key=RECEIVE).status_code==404
    new=call(c,r,'issue',mode=mode,target=target,key=KEY).json()['code'];assert new!=code
    c.post('/transfer/api/'+mode+'/cancel',json={'code':target,'key':KEY},headers=headers(r))
    assert call(c,r,'resolve',code=new,key=RECEIVE).status_code==410


def test_offline_receive_capability_revoke_and_old_link(fixture):
    c,r=fixture;enabled(c,r);task=offline(c,r)
    issued=call(c,r,'issue',mode='offline',target=task['id']);assert issued.status_code==200,issued.text
    code=issued.json()['code']
    result=call(c,r,'resolve',code=code);assert result.status_code==200,result.text
    token=result.json()['token'];assert token!=task['token'] and token.startswith('tc.')
    assert result.json()['file']['name']=='example.txt'
    assert c.get('/transfer/s/'+token[:-1]+('1' if token[-1]!='1' else '2')).status_code==404
    assert call(c,r,'revoke',code=code).status_code==200
    assert c.get('/transfer/s/'+token).status_code==404
    assert call(c,r,'resolve',code=code).status_code==404
    assert c.get('/transfer/s/'+task['token']).content==b'test'


def test_offline_download_and_expiry(fixture):
    c,r=fixture;enabled(c,r);task=offline(c,r)
    code=call(c,r,'issue',mode='offline',target=task['id']).json()['code']
    token=call(c,r,'resolve',code=code).json()['token']
    assert c.get('/transfer/s/'+token).content==b'test'
    run(r.sql.batch([('UPDATE transfer_codes SET expires_at=0 WHERE code=?',(code,))]))
    assert call(c,r,'resolve',code=code).status_code==404
    assert c.get('/transfer/s/'+token).status_code==404


def test_policy_csrf_shape_and_lookup_throttle(fixture):
    c,r=fixture;enabled(c,r);task=offline(c,r)
    code=call(c,r,'issue',mode='offline',target=task['id']).json()['code']
    assert c.post('/transfer/api/codes/resolve',json={'code':code}).status_code==403
    assert call(c,r,'resolve',code='AB12345').status_code==422
    assert call(c,r,'resolve',code=code,extra=True).status_code==422
    setting(r,lambda d:d.update(allowDownloads=False))
    assert call(c,r,'resolve',code=code).status_code==403
    for _ in range(20):last=call(c,r,'resolve',code='ZZ9999')
    assert last.status_code==429
    assert last.headers['cache-control']=='no-store'


def test_limiter_bounded():
    limiter=Limiter()
    for i in range(600):limiter.take(str(i))
    with pytest.raises(Error):limiter.take('new')
    assert len(limiter.buckets)==600


def test_collision_retry_restart_and_offline_lease(fixture,monkeypatch):
    from transfer.backend import codes
    from types import SimpleNamespace
    c,r=fixture;enabled(c,r);task=offline(c,r)
    first=call(c,r,'issue',mode='offline',target=task['id']).json()['code']
    assert call(c,r,'revoke',code=first).status_code==200
    alternate='AA0000' if first!='AA0000' else 'BB0000'
    characters=iter(first+alternate)
    monkeypatch.setattr(codes.secrets,'choice',lambda _:next(characters))
    result=call(c,r,'issue',mode='offline',target=task['id'])
    assert result.status_code==200,result.text
    assert result.json()['code']==alternate
    # A new controller has a new process identity but can resolve persisted offline codes.
    from transfer.backend.native import Transfers
    runtime=SimpleNamespace(sql=r.sql,p={**r.p,'_integrated':True,'role_id':r.p['role_uid']},service=Transfers(r.sql,None,indexed=True))
    controller=codes.Codes(SimpleNamespace())
    token=run(controller.resolve(runtime,{'code':alternate}))['token']
    lease=c.post('/transfer/api/receive',json={'token':token,'key':RECEIVE},headers=headers(r))
    assert lease.status_code==200,lease.text
    assert call(c,r,'revoke',code=alternate).status_code==200
    assert c.post('/transfer/api/receive',json={'token':token,'key':'t'*43},headers=headers(r)).status_code==404
    live=c.post('/transfer/api/lan/create',json={'key':KEY,'name':'live','size':1},headers=headers(r)).json()['code']
    monkeypatch.undo()
    short=call(c,r,'issue',mode='lan',target=live,key=KEY).json()['code']
    with pytest.raises(Error,match='会话已失效'):
        run(controller.resolve(runtime,{'code':short,'key':RECEIVE}))


def test_offline_folder_code_uses_existing_directory_receiver(fixture):
    from test_transfer_folder_v82 import prep
    from test_transfer_folder_receive_v83 import ready,start,action
    c,r=fixture;prep(c,r);task=ready(c,r)
    code=call(c,r,'issue',mode='offline',target=task['id']).json()['code']
    resolved=call(c,r,'resolve',code=code)
    assert resolved.status_code==200,resolved.text
    info=resolved.json();assert info['file']['kind']=='folder'
    session=start(c,r,{'token':info['token']})
    assert len(action(c,r,session,'manifest').json()['entries'])==3


@pytest.mark.parametrize('mode',['lan','relay'])
def test_live_folder_codes_require_sealed_manifest(fixture,mode):
    from test_transfer_live_folder_v84 import prep,create,submit,seal
    c,r=fixture;prep(c,r);target=create(c,r,mode)
    code=call(c,r,'issue',mode=mode,target=target,key=KEY).json()['code']
    assert call(c,r,'resolve',code=code,key=RECEIVE).status_code==409
    assert submit(c,r,mode,target).status_code==200
    assert seal(c,r,mode,target).status_code==200
    reply=call(c,r,'resolve',code=code,key=RECEIVE)
    assert reply.status_code==200,reply.text
    assert reply.json()['session']['kind']=='folder'
