import asyncio,sys
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from runtime.media_upload import dispatch_upload
from backend.app.ports.upload_stream import current

@pytest.mark.parametrize('path',['/api/admin/media/upload/file','/api/admin/media-picker/upload/file','/api/admin/media-picker/crop/file'])
def test_envelope_preserves_authorization_headers_without_body(monkeypatch,path):
    class Headers(dict):
        new=classmethod(lambda cls,h:cls(h))
        def delete(self,k):self.pop(k,None)
    class Request:
        @staticmethod
        def new(url,options):return SimpleNamespace(url=url,**options)
    monkeypatch.setitem(sys.modules,'js',SimpleNamespace(Request=Request,Headers=Headers,Object=SimpleNamespace(fromEntries=None)))
    monkeypatch.setitem(sys.modules,'pyodide.ffi',SimpleNamespace(to_js=lambda x,**kw:x))
    body=SimpleNamespace(locked=False,cancel=AsyncMock());binding=object()
    raw=SimpleNamespace(method='POST',url='https://site.test'+path+'?module=news',body=body,headers={'cookie':'session','origin':'https://site.test','x-csrf-token':'token','x-filename':'test.png','content-length':'100'})
    async def fetch(app,envelope,env,ctx):
        assert current()==(raw,binding)
        assert not hasattr(envelope,'body') and envelope.url==raw.url
        assert 'content-length' not in envelope.headers
        assert envelope.headers['cookie']=='session' and envelope.headers['origin']=='https://site.test' and envelope.headers['x-csrf-token']=='token'
        return 'denied-before-body'
    assert asyncio.run(dispatch_upload(None,raw,SimpleNamespace(SYNC_NATIVE=binding),None,fetch,AsyncMock()))=='denied-before-body'
    body.cancel.assert_awaited_once();assert current() is None and raw.headers['content-length']=='100'

def test_ordinary_request_does_not_access_native_binding():
    r=SimpleNamespace(method='GET',url='https://site.test/en');dispatch=AsyncMock(return_value='page')
    assert asyncio.run(dispatch_upload(None,r,object(),None,object(),dispatch))=='page'
    dispatch.assert_awaited_once();assert current() is None
