"""Bounded authenticated binary media, fallback, retries and streamed publication."""
import asyncio,hashlib
from pathlib import Path
from types import SimpleNamespace
import pytest
from backend.app.native import site_sync_transport as wire,site_sync_tasks as tasks,site_sync_media as media
from backend.app.native.catalog import Error
from tests.test_site_sync_v121 import pair,seed_media,finish
from tests.test_sync_incremental_v141 import prepare,begin
run=asyncio.run

@pytest.mark.parametrize('change',['none','body','signature','nonce','oversize','json'])
def test_binary_authentication(change,monkeypatch):
    raw=b'\x00\xff'*32768;secret='x'*64
    async def post(kind,url,message):
        metadata={'site_id':'other','request_nonce':message['nonce'],'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
        if change=='nonce':metadata['request_nonce']='wrong'
        if change=='json':return wire.envelope(secret,metadata)
        frame=wire.binary_frame(secret,metadata,raw)
        if change=='oversize':frame+=b'x'*wire.FRAME_HEADER_LIMIT
        if change=='body':frame=frame[:-1]+b'x'
        result=wire.response_json(200,frame,{'Content-Type':wire.BINARY_TYPE})
        if change=='signature':result.metadata['signature']='0'*64
        return result
    monkeypatch.setattr(wire,'post',post)
    call=wire.call(SimpleNamespace(kind='local'),{'origin':'https://b.example.org','secret':secret,'local_id':'self'},{'op':'media-range-binary'})
    if change=='none':assert run(call)['raw']==raw
    else:
        with pytest.raises(Error):run(call)

@pytest.mark.parametrize('body',[b'',b'TSC1\0\0\0\0x',b'TSC1\0\0\x20\x01x',b'TSC1\0\0\0\x01{}',b'TSC1\0\0\0\x02[]x'])
def test_malformed_frames_rejected(body):
    with pytest.raises(Error):wire.response_json(200,body,{'content-type':wire.BINARY_TYPE})

@pytest.mark.parametrize('legacy',[False,True])
def test_multichunk_resume_and_legacy_fallback(pair,monkeypatch,legacy):
    api,_,ra,rb,_,_,network=pair
    raw=Path('tests/fixtures/media/sample.jpg').read_bytes()+b'x'*(media.CHUNK*5+17)
    seed_media(rb,'f'*32,'large.jpg',raw)
    original=media.serve
    async def serve(r,data):
        result=await original(r,data)
        if legacy:result.pop('binary_ranges',None)
        return result
    monkeypatch.setattr(media,'serve',serve)
    operations=[]
    async def post(kind,url,data):
        op=data['payload']['op'];result=await network(kind,url,data)
        if op.startswith('media-range'):
            operations.append((op,data['payload']['offset']))
            if not legacy:
                assert isinstance(result,wire.BinaryReply) and len(result.raw)<=media.CHUNK
                assert 'bytes' not in result.metadata['payload']
        return result
    monkeypatch.setattr(wire,'post',post)
    uid,_=prepare(api,['media_assets']);begin(api,uid)
    api('pull-tick',{'uid':uid})
    put=ra.cache_store.put;lost=False
    async def lose_ack(key,data):
        nonlocal lost
        result=await put(key,data)
        if not lost:
            lost=True;raise Error('cache acknowledgment lost',502,'sync_network')
        return result
    monkeypatch.setattr(ra.cache_store,'put',lose_ack)
    assert api('pull-tick',{'uid':uid},ok=False).status_code==502
    saved=run(tasks.get(ra.sql,uid))['state']['execution'];assert saved['offset']==0
    # v151 enforces the persisted cooldown; simulate its expiry without sleeping.
    run(ra.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work.retry_after','2000-01-01T00:00:00.000Z') WHERE uid=?",(uid,))]))
    finish(api,uid)
    assert operations[0][1]==operations[1][1]==0
    assert all(op==('media-range' if legacy else 'media-range-binary') for op,_ in operations)
    assert run(ra.media_store.get('large.jpg'))==raw
    if ra.kind=='local':assert not list(ra.cache_store.root.glob('site-sync/**/*.bin'))
    else:assert not any(k.startswith('cache/site-sync/') for k in ra.cache_store.bucket.objects)

@pytest.mark.parametrize('oversize',[False,True])
def test_worker_transport_reads_bounded_binary_and_closes_stream(monkeypatch,oversize):
    import sys
    from types import ModuleType
    from unittest.mock import AsyncMock,Mock
    raw=b'x'*media.CHUNK
    metadata={'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    frame=wire.binary_frame('s'*64,metadata,raw)
    if oversize:frame+=b'z'*wire.FRAME_HEADER_LIMIT
    parts=[SimpleNamespace(done=False,value=SimpleNamespace(byteLength=len(frame[i:i+4096]),to_py=lambda b=frame[i:i+4096]:b)) for i in range(0,len(frame),4096)]
    reader=SimpleNamespace(read=AsyncMock(side_effect=parts+[SimpleNamespace(done=True)]),cancel=AsyncMock())
    controller=SimpleNamespace(signal=object(),abort=Mock())
    js=ModuleType('js');ffi=ModuleType('pyodide.ffi')
    js.fetch=AsyncMock(return_value=SimpleNamespace(status=200,headers=SimpleNamespace(get=lambda k:wire.BINARY_TYPE if k=='content-type' else None),body=SimpleNamespace(getReader=lambda:reader)))
    js.AbortController=SimpleNamespace(new=lambda:controller);js.Object=SimpleNamespace(fromEntries=object())
    ffi.to_js=lambda *a,**k:SimpleNamespace()
    monkeypatch.setitem(sys.modules,'js',js);monkeypatch.setitem(sys.modules,'pyodide.ffi',ffi)
    request=wire._worker('https://b.example.org',b'{}',wire.FRAME_LIMIT)
    if oversize:
        with pytest.raises(Error) as err:run(request)
        assert err.value.code=='sync_size'
    else:assert run(request).raw==raw
    reader.cancel.assert_awaited_once();controller.abort.assert_called_once()
