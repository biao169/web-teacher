import asyncio,json
from types import SimpleNamespace
import pytest
from backend.app.native.media import Media
from backend.app.native.catalog import Error
from backend.app.ports.upload_stream import bind,current
from test_upload_diagnostics_v038 import SQL,Auth,Content,Store

class Request:
    body=object()
    headers={'content-length':'100'}
    async def stream(self):raise AssertionError('file entered Python');yield b''
class Native:
    def __init__(self,ok=True):self.called=False;self.ok=ok
    async def upload_media(self,body,raw):
        self.called=True;self.q=json.loads(raw);assert body is Request.body
        return json.dumps({'ok':True,'size':100,'mime':'image/png','checksum':'a'*64} if self.ok else {'ok':False,'code':'MEDIA_STORAGE','status':503})

def test_native_upload_keeps_body_opaque_and_commits():
    native=Native();store=Store(False);sql=SQL()
    async def run():
        with bind(Request(),native):return await Media(sql,Auth(),Content(),store,'r2').upload({},'file.png',Request())
    assert len(asyncio.run(run()))==32
    assert native.called and native.q['size']==100 and sql.released and not store.deleted
    assert current() is None

def test_native_error_keeps_primary_and_releases_reservation():
    native=Native(False);store=Store();sql=SQL(True)
    async def run():
        with bind(Request(),native):await Media(sql,Auth(),Content(),store,'r2').upload({},'file.png',Request())
    with pytest.raises(Error,match='MEDIA_STORAGE'):asyncio.run(run())
    assert sql.released and store.deleted and current() is None

@pytest.mark.parametrize('length',['','bad','0','20971521'])
def test_size_rejection_never_calls_native(length):
    native=Native();r=Request();r.headers={'content-length':length}
    async def run():
        with bind(r,native):await Media(SQL(),Auth(),Content(),Store(),'r2').upload({},'file.png',r)
    with pytest.raises(Error):asyncio.run(run())
    assert not native.called and current() is None

def test_missing_context_never_falls_back_to_python_body():
    with pytest.raises(Error,match='上下文缺失'):asyncio.run(Media(SQL(),Auth(),Content(),Store(),'r2').upload({},'file.png',Request()))

def test_permission_denied_before_native_or_reservation():
    class Denied(Auth):
        def require(self,*a):raise Error('denied',403)
    native=Native();sql=SQL()
    async def run():
        with bind(Request(),native):await Media(sql,Denied(),Content(),Store(),'r2').upload({},'file.png',Request())
    with pytest.raises(Error,match='denied'):asyncio.run(run())
    assert not native.called and not sql.released

def test_rpc_exception_becomes_controlled_503():
    class Broken(Native):
        async def upload_media(self,*args):raise TypeError('private-binding-detail')
    async def run():
        with bind(Request(),Broken()):await Media(SQL(),Auth(),Content(),Store(),'r2').upload({},'file.png',Request())
    with pytest.raises(Error,match='原生上传服务调用失败') as caught:asyncio.run(run())
    assert isinstance(caught.value.__cause__,TypeError)
    assert 'private-binding-detail' not in str(caught.value)

def test_quota_checked_before_native_call():
    class Full(SQL):
        async def query(self,s,args=()):return [] if 'upload_max_size' in s else [{'n':500*1024*1024}]
    native=Native()
    async def run():
        with bind(Request(),native):await Media(Full(),Auth(),Content(),Store(),'r2').upload({},'file.png',Request())
    with pytest.raises(Error,match='配额'):asyncio.run(run())
    assert not native.called
