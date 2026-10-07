"""Folder HTTP protocol: bounded manifest, quota, replay, cleanup and legacy isolation."""
import json
import pytest
from test_accounts_regression import fixture,run
from test_transfer_integration_v66 import enabled
from test_transfer_lan_v68 import setting


def headers(r):return {'Origin':r.config.origin,'X-CSRF-Token':r.p['csrf']}
def prep(c,r):
    enabled(c,r);setting(r,lambda d:d.update(wanRateKbps=None,temporaryFreeBytes='0'))
def post(c,r,url,**data):return c.post('/transfer/api/'+url,json=data,headers=headers(r))
def create(c,r,size=3,files=2,dirs=2):
    reply=post(c,r,'folders',name='研究资料',size=size,fileCount=files,directoryCount=dirs)
    assert reply.status_code==200,reply.text
    return reply.json()
def entries():return [{'kind':'directory','path':'空目录'},{'kind':'file','path':'a.txt','size':3},{'kind':'file','path':'zero.txt','size':0}]
def page(c,r,t,items,after=0):return post(c,r,'folders/'+t['id']+'/manifest',after=after,entries=items)
def seal(c,r,t):return post(c,r,'folders/'+t['id']+'/seal')
def status(c,t,after=0):return c.get('/transfer/api/folders/'+t['id']+'/manifest?after='+str(after))
def chunk(c,r,t,data=b'abc',offset=0):return c.post('/transfer/api/tasks/'+t['id']+'/chunk',content=data,headers={**headers(r),'X-Offset':str(offset)})


def test_folder_lifecycle_replay_quota_and_legacy_isolation(fixture):
    c,r=fixture;prep(c,r);t=create(c,r)
    assert chunk(c,r,t).status_code==409
    assert seal(c,r,t).status_code==409
    assert page(c,r,t,entries()).status_code==200
    assert page(c,r,t,entries()).json()['replayed']
    altered=entries();altered[1]['size']=2
    assert page(c,r,t,altered).status_code==409
    assert seal(c,r,t).status_code==200
    assert chunk(c,r,t,b'a').json()['offset']==1
    st=status(c,t).json();assert st['entries'][1]['state']=='uploading' and st['entries'][1]['confirmed']==1
    assert chunk(c,r,t,b'bc',1).json()['complete']
    assert chunk(c,r,t,b'bc',1).json()['replayed']
    st=status(c,t).json();assert st['state']=='ready' and all(e['state']=='complete' for e in st['entries'])
    assert run(r.sql.query('SELECT count(*) n FROM temporary_shares'))[0]['n']==1
    a=run(r.sql.query("SELECT bytes,outcome FROM transfer_allowances WHERE task=?",(t['id'],)))[0]
    assert a['bytes']=='3' and json.loads(a['outcome'])['used']==3
    assert c.get('/transfer/s/'+t['token'],follow_redirects=False).status_code==303
    assert post(c,r,'share-info',token=t['token']).json()['kind']=='folder'
    assert post(c,r,'receive',token=t['token'],key='a'*43).status_code==409


@pytest.mark.parametrize('items',[
    [{'kind':'file','path':'../evil','size':3}],
    [{'kind':'file','path':'CON.txt','size':3}],
    [{'kind':'file','path':'/tmp/x','size':3}],
    [{'kind':'file','path':'a/b','size':3}],
    [{'kind':'file','path':'a','size':3},{'kind':'file','path':'A','size':0}],
    [{'kind':'directory','path':'a'},{'kind':'file','path':'A/x','size':3}],
    [{'kind':'file','path':'x','size':4}],
])
def test_manifest_rejects_unsafe_or_conflicting_paths_atomically(fixture,items):
    c,r=fixture;prep(c,r);t=create(c,r)
    assert page(c,r,t,items).status_code in (422,409)
    assert status(c,t).json()['received']==0
    assert not run(r.sql.query('SELECT 1 FROM service_meta WHERE key LIKE ?',(f"folder:{t['id']}:%",)))


def test_empty_root_and_zero_file(fixture):
    c,r=fixture;prep(c,r);t=create(c,r,0,0,1)
    assert seal(c,r,t).json()['ready']
    assert seal(c,r,t).json()['ready']
    t=create(c,r,0,1,1)
    assert page(c,r,t,[{'kind':'file','path':'zero','size':0}]).status_code==200
    assert seal(c,r,t).json()['ready']
    assert status(c,t).json()['entries'][0]['state']=='complete'


def test_paged_manifest_and_per_file_limit_not_aggregate(fixture):
    c,r=fixture;prep(c,r)
    setting(r,lambda d:d.update(maxFileBytes='2'))
    t=create(c,r,101,101,1)
    assert page(c,r,t,[{'kind':'file','path':str(i),'size':1} for i in range(101)]).status_code==422
    assert page(c,r,t,[{'kind':'file','path':str(i),'size':1} for i in range(100)]).status_code==200
    assert page(c,r,t,[{'kind':'file','path':'100','size':1}],100).status_code==200
    first=status(c,t).json();assert len(first['entries'])==100 and first['next']==100
    assert len(status(c,t,100).json()['entries'])==1
    assert seal(c,r,t).status_code==200
    t=create(c,r)
    assert page(c,r,t,entries()).status_code==403


def test_quota_auth_cleanup_and_pause(fixture):
    c,r=fixture;prep(c,r);t=create(c,r)
    assert page(c,r,t,entries()).status_code==200
    assert seal(c,r,t).status_code==200
    assert chunk(c,r,t,b'a').status_code==200
    assert post(c,r,'tasks/'+t['id']+'/control',action='pause',state='uploading').status_code==200
    assert chunk(c,r,t,b'bc',1).status_code==409
    assert seal(c,r,t).status_code==409
    assert post(c,r,'tasks/'+t['id']+'/control',action='revoke',state='paused').status_code==200
    assert post(c,r,'cleanup').status_code==200
    assert not run(r.sql.query('SELECT 1 FROM service_meta WHERE key LIKE ?',(f"folder:{t['id']}:%",)))
    assert not run(r.sql.query('SELECT 1 FROM transfer_chunks WHERE task=?',(t['id'],)))
    setting(r,lambda d:d.update(totalDailyBytes='1'))
    assert post(c,r,'folders',name='large',size=2,fileCount=1,directoryCount=1).status_code==409
    c.cookies.clear()
    assert status(c,t).status_code==401
    assert post(c,r,'folders',name='a',size=0,fileCount=0,directoryCount=1).status_code==401
