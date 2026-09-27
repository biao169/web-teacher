"""Folder manifests and completion are fenced by the existing receive session."""
import hashlib,json
import pytest
from test_accounts_regression import fixture,run
from test_transfer_folder_v82 import prep,create,page,seal,chunk,entries,post,headers
from test_transfer_lan_v68 import setting
from transfer.backend.accounting import milliseconds as ms
KEY='k'*43

def ready(c,r,empty=False):
    t=create(c,r,0,0,1) if empty else create(c,r)
    if not empty:assert page(c,r,t,entries()).status_code==200
    assert seal(c,r,t).status_code==200
    if not empty:assert chunk(c,r,t).status_code==200
    return t

def start(c,r,t,key=KEY):
    response=post(c,r,'receive',token=t['token'],key=key,folder=True)
    assert response.status_code==200,response.text
    return response.json()
def action(c,r,s,op,key=KEY,**data):return c.post('/transfer/api/receive/'+s['id']+'/'+op,json=data,headers={**headers(r),'X-Receive-Key':key})


def test_folder_session_manifest_metering_and_explicit_final_save(fixture):
    c,r=fixture;prep(c,r);t=ready(c,r)
    info=post(c,r,'share-info',token=t['token']);assert info.json()['kind']=='folder'
    assert run(r.sql.query('SELECT downloads FROM temporary_shares'))[0]['downloads']==0
    redirect=c.get('/transfer/s/'+t['token'],follow_redirects=False);assert redirect.status_code==303 and redirect.headers['location']=='/transfer/?folder='+t['token']
    s=start(c,r,t);assert s['kind']=='folder'
    assert start(c,r,t)['id']==s['id'] # Retry creation does not consume a second download.
    assert run(r.sql.query('SELECT downloads FROM temporary_shares'))[0]['downloads']==1
    manifest=action(c,r,s,'manifest').json();assert len(manifest['entries'])==3 and manifest['next'] is None
    assert not any('key' in e for e in manifest['entries'])
    assert action(c,r,s,'finish').status_code==409
    block=action(c,r,s,'chunk',offset=0);assert block.content==b'abc'
    assert action(c,r,s,'ack',offset=0,sha256=hashlib.sha256(b'abc').hexdigest()).json()['complete'] is False
    assert action(c,r,s,'status').json()['state']=='active'
    assert action(c,r,s,'finish').json()['complete']
    assert action(c,r,s,'finish').json()['complete']
    assert action(c,r,s,'status').json()['state']=='complete'
    a=run(r.sql.query("SELECT bytes,finished_at,outcome FROM transfer_allowances WHERE task=? AND kind='receive'",(t['id'],)))[0]
    assert a['bytes']=='3' and a['finished_at'] and json.loads(a['outcome'])['used']==3


def test_empty_root_completes_without_reading_a_data_chunk(fixture):
    c,r=fixture;prep(c,r);t=ready(c,r,True);s=start(c,r,t)
    assert action(c,r,s,'manifest').json()['entries']==[]
    assert action(c,r,s,'finish').json()['complete']
    assert action(c,r,s,'status').json()['state']=='complete'
    assert run(r.sql.query("SELECT bytes,finished_at FROM transfer_allowances WHERE kind='receive'"))[0]['finished_at']


def test_manifest_is_paged_and_authenticated(fixture):
    c,r=fixture;prep(c,r);t=create(c,r,0,201,1)
    for after in range(0,201,100):
        assert page(c,r,t,[{'kind':'file','path':str(i),'size':0} for i in range(after,min(after+100,201))],after).status_code==200
    seal(c,r,t);s=start(c,r,t)
    a=action(c,r,s,'manifest').json();assert len(a['entries'])==100 and a['next']==100
    assert len(action(c,r,s,'manifest',after=200).json()['entries'])==1
    assert action(c,r,s,'manifest',after=-1).status_code==422
    assert action(c,r,s,'manifest',key='x'*43).status_code==403
    assert c.post('/transfer/api/receive/'+s['id']+'/manifest',json={},headers={'Origin':'https://other.test','X-Receive-Key':KEY}).status_code==403
    assert action(c,r,s,'cancel').status_code==200
    assert action(c,r,s,'manifest').status_code==410


def test_touch_cannot_revive_expired_or_revoked_shares(fixture):
    c,r=fixture;prep(c,r);t=ready(c,r);s=start(c,r,t)
    run(r.sql.batch([('UPDATE transfer_receivers SET expires_at=? WHERE id=?',(ms()+2000,s['id']))]))
    assert action(c,r,s,'touch').status_code==200
    assert action(c,r,s,'status').json()['expires_at']>ms()+100000
    long_lease=ms()+600000
    run(r.sql.batch([('UPDATE transfer_receivers SET expires_at=? WHERE id=?',(long_lease,s['id']))]))
    assert action(c,r,s,'touch').status_code==200
    assert action(c,r,s,'status').json()['expires_at']==long_lease
    run(r.sql.batch([('UPDATE transfer_receivers SET expires_at=? WHERE id=?',(ms()-1,s['id']))]))
    assert action(c,r,s,'touch').status_code==410
    run(r.sql.batch([('UPDATE transfer_receivers SET expires_at=? WHERE id=?',(ms()+10000,s['id'])),("UPDATE temporary_shares SET state='revoked' WHERE id=?",(t['id'],))]))
    assert action(c,r,s,'manifest').status_code==409


@pytest.mark.parametrize('cap,value',[('maxFiles',1),('maxTaskBytes','2'),('maxFileBytes','2')])
def test_receivers_own_limits_apply_before_download_count(fixture,cap,value):
    c,r=fixture;prep(c,r);t=ready(c,r)
    def update(d):
        for rule in d['rules']:rule[cap]=value
    setting(r,update)
    response=post(c,r,'receive',token=t['token'],key=KEY,folder=True)
    assert response.status_code==403,response.text
    assert run(r.sql.query('SELECT downloads FROM temporary_shares'))[0]['downloads']==0
