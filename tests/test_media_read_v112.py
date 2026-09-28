"""Real media bytes, bounded reads, authorization, paths and stream resource lifecycle."""
import asyncio
import io
import os
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from starlette.requests import Request
from starlette.requests import ClientDisconnect
from backend.app.native.media_inventory_store import LocalInventory
from backend.app.native.media_response import LocalMediaResponse,media_response
from test_media_regression import runtime,register

FIXTURES=Path(__file__).parent/'fixtures'/'media'

@pytest.mark.parametrize('name,mime,element',[
    ('sample.jpg','image/jpeg','img'),('progressive.jpg','image/jpeg','img'),
    ('cmyk.jpg','image/jpeg','img'),('sample.png','image/png','img'),
    ('sample.webp','image/webp','img'),('sample.pdf','application/pdf','iframe'),
    ('sample.mp4','video/mp4','video'),('sample.webm','video/webm','video'),
])
def test_real_files_wrong_historical_type_and_suffix(runtime,name,mime,element):
    client,r=runtime;body=(FIXTURES/name).read_bytes()
    uid,key=register(runtime,body,'dat','application/octet-stream')
    url='/api/admin/media/'+uid+'/content'
    head=client.head(url);response=client.get(url)
    assert head.status_code==response.status_code==200
    assert response.content==body
    assert head.headers['content-type']==response.headers['content-type']==mime
    assert response.headers['content-disposition'].startswith('inline;')
    part=client.get(url,headers={'Range':'bytes=5-15'})
    assert part.status_code==206 and part.content==body[5:16]
    detail=client.get('/admin/media/'+uid+'/inspect')
    assert detail.status_code==200
    assert '<'+element in detail.text and f'src="{url}"' in detail.text
    assert str(r.media_store.path(key).resolve()) in detail.text
    download=client.get(url+'?download=1')
    assert download.headers['content-disposition'].startswith('attachment;')

def test_single_open_contiguous_chunks_and_cleanup(runtime,monkeypatch):
    client,r=runtime;body=(FIXTURES/'sample.pdf').read_bytes()+b'\n'*200000
    uid,key=register(runtime,body,'pdf','application/pdf');handles=[]
    original=LocalInventory.open_reader
    def reader(self,key):
        result=original(self,key);handles.append(result[0]);return result
    async def forbidden(*args):raise AssertionError('local HTTP must not reopen per chunk')
    monkeypatch.setattr(LocalInventory,'open_reader',reader)
    monkeypatch.setattr(LocalInventory,'read_range',forbidden)
    response=client.get('/api/admin/media/'+uid+'/content')
    assert response.content==body and len(handles)==1 and handles[0].closed
    for headers in ({},{'Range':'bytes=999999-'}):
        response=client.head('/api/admin/media/'+uid+'/content',headers=headers)
        assert response.status_code==200 and handles[-1].closed
    response=client.get('/api/admin/media/'+uid+'/content',headers={'Range':'bytes=999999-'})
    assert response.status_code==416 and handles[-1].closed

def test_metadata_change_does_not_abort_open_file(runtime,monkeypatch):
    client,r=runtime;body=(FIXTURES/'sample.pdf').read_bytes()+b'x'*180000
    uid,key=register(runtime,body,'pdf','application/pdf');path=r.media_store.path(key)
    original=LocalInventory.open_reader
    def reader(self,key):
        result=original(self,key)
        stat=path.stat();os.utime(path,ns=(stat.st_atime_ns,stat.st_mtime_ns+1000000))
        return result
    monkeypatch.setattr(LocalInventory,'open_reader',reader)
    response=client.get('/api/admin/media/'+uid+'/content')
    assert response.status_code==200 and response.content==body

@pytest.mark.parametrize('error,status,code',[(FileNotFoundError,404,None),(PermissionError,503,'media_read_denied'),(OSError,503,'media_read_failed')])
def test_os_read_errors_are_explicit_before_response(runtime,monkeypatch,error,status,code):
    client,_=runtime;uid,_=register(runtime,(FIXTURES/'sample.jpg').read_bytes())
    def broken(*args):raise error('synthetic OS failure')
    monkeypatch.setattr(LocalInventory,'open_reader',broken)
    response=client.get('/api/admin/media/'+uid+'/content',headers={'Accept':'application/json'})
    assert response.status_code==status
    assert 'synthetic OS failure' not in response.text
    if code:
        assert response.json()['code']==code
        assert client.head('/api/admin/media/'+uid+'/content',headers={'Accept':'application/json'}).headers['x-media-error']==code

def test_unicode_path_audit_and_missing_detail(runtime):
    from backend.app.native.media_audit import MediaAudit
    from backend.app.native.auth import Auth
    client,r=runtime;body=(FIXTURES/'sample.png').read_bytes()
    uid,old=register(runtime,body,'png','image/png')
    key='教师资料/'+uuid.uuid4().hex+' 照片.png'
    path=r.media_store.root/key;path.parent.mkdir(exist_ok=True);path.write_bytes(body)
    asyncio.run(r.sql.batch([('UPDATE media_assets SET object_key=? WHERE uid=?',(key,uid))]))
    response=client.get('/api/admin/media/'+uid+'/content')
    assert response.content==body
    async def scan():
        r.auth=Auth(r.sql,r.passwords);r.p=await r.auth.principal(client.cookies.get(r.config.name('session')))
        audit=MediaAudit(r);state=await audit.start()
        while state['phase']!='done':state=await audit.step(state['id'],state['version'])
    asyncio.run(scan())
    first=client.get('/admin/media/audit')
    # Find the record independent of accumulated fixtures and scan page ordering.
    found=False
    for page in range(1,10):
        html=client.get('/admin/media/audit?page='+str(page)).text
        if str(path.resolve()) in html:found=True;break
    assert first.status_code==200 and found
    assert str(path.resolve()) in client.get('/admin/media/'+uid+'/inspect').text
    path.unlink()
    detail=client.get('/admin/media/'+uid+'/inspect')
    assert detail.status_code==200 and '该路径下没有文件' in detail.text
    assert client.get('/api/admin/media/'+uid+'/content').status_code==404

def test_unsafe_paths_and_unauthorized_reads_stay_blocked(runtime):
    client,r=runtime;uid,key=register(runtime,(FIXTURES/'sample.png').read_bytes(),'png','image/png')
    assert client.get('/media/'+uid,headers={'Cookie':''}).status_code==404
    assert client.get('/api/admin/media/'+uid+'/content',headers={'Cookie':''}).status_code in (401,403)
    for unsafe in ('../outside.png','/tmp/outside.png','folder/../outside.png'):
        asyncio.run(r.sql.batch([('UPDATE media_assets SET object_key=? WHERE uid=?',(unsafe,uid))]))
        assert client.get('/api/admin/media/'+uid+'/content').status_code==422
    asyncio.run(r.sql.batch([('UPDATE media_assets SET object_key=? WHERE uid=?',(key,uid))]))
    alias=r.media_store.root/(uuid.uuid4().hex+'.png')
    try:alias.symlink_to(r.media_store.path(key))
    except (OSError,NotImplementedError):return
    try:
        asyncio.run(r.sql.batch([('UPDATE media_assets SET object_key=? WHERE uid=?',(alias.name,uid))]))
        assert client.get('/api/admin/media/'+uid+'/content').status_code==422
    finally:alias.unlink()

def test_upload_limit_is_not_removed(runtime):
    client,r=runtime
    principal=asyncio.run(r.auth.principal(client.cookies.get(r.config.name('session'))))
    old=asyncio.run(r.sql.query('SELECT upload_max_size_mb FROM global_settings LIMIT 1'))[0]['upload_max_size_mb']
    asyncio.run(r.sql.batch([('UPDATE global_settings SET upload_max_size_mb=1',())]))
    try:
        response=client.post('/api/admin/media/upload/file',headers={'Origin':r.config.origin,'X-CSRF-Token':principal['csrf'],'X-Filename':'sample.jpg'},content=b'\xff\xd8\xff'+b'x'*(1024*1024))
        assert response.status_code==413
    finally:asyncio.run(r.sql.batch([('UPDATE global_settings SET upload_max_size_mb=?',(old,))]))

@pytest.mark.parametrize('fail_at',[1,2,3])
def test_stream_closes_file_on_disconnect(fail_at):
    handle=io.BytesIO(b'x'*200000);response=LocalMediaResponse(handle,0,200000)
    scope={'type':'http','method':'GET','asgi':{'spec_version':'2.4'}}
    async def send(message):
        send.calls+=1
        if send.calls==fail_at:raise OSError('simulated disconnected browser')
    send.calls=0
    async def receive():return {'type':'http.disconnect'}
    with pytest.raises(ClientDisconnect):asyncio.run(response(scope,receive,send))
    assert handle.closed

def test_r2_keeps_bounded_versioned_streaming(monkeypatch):
    import backend.app.native.media_response as module
    body=(FIXTURES/'sample.pdf').read_bytes()+b' '*1200000
    calls=[]
    class Store:
        async def head(self,key):return {'size':len(body),'version':'test-version'}
        async def read_range(self,key,offset,length,version):
            calls.append((offset,length,version));return body[offset:offset+length]
    class Media:
        async def inspect(self,p,uid):return {'uid':uid,'object_key':'file.dat','storage_kind':'r2','title':'Test'}
    monkeypatch.setattr(module,'inventory',lambda ignored:Store())
    request=Request({'type':'http','method':'GET','path':'/content','query_string':b'','headers':[]})
    r=SimpleNamespace(media=Media(),p={},kind='r2',media_store=object())
    async def collect():
        response=await media_response(request,r,'test',True)
        assert response.headers['content-type']=='application/pdf'
        return b''.join([chunk async for chunk in response.body_iterator])
    assert asyncio.run(collect())==body
    assert max(length for _,length,_ in calls)<=1048576
    assert all(version=='test-version' for _,_,version in calls)
