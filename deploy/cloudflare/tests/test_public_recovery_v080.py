import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock,Mock
import pytest
from test_startup_lazy import entry
from runtime.public_recovery import eligible

def request(path='/en/profiles',method='GET',headers=None,aborted=False):
 return SimpleNamespace(url='https://site.test'+path,method=method,headers=headers or {},signal=SimpleNamespace(aborted=aborted))

@pytest.mark.parametrize('path',['/en','/zh','/en/profiles','/zh/projects','/en/profiles/u1','/en/courses/u1'])
def test_allowed(path):assert eligible(request(path))

@pytest.mark.parametrize('path',['/admin','/auth/login','/sync/v1/read','/api/public/session-summary','/api/public/cache-revision','/media/a','/assets/a','/en/contact','/en/n/custom','/en/news/u1','/en/projects?nav=a','/en/projects?nv=a','/en/unknown','/en/profiles/a/b'])
def test_excluded(path):assert not eligible(request(path))

@pytest.mark.parametrize('method',['POST','PUT','PATCH','DELETE','OPTIONS'])
def test_writes(method):assert not eligible(request(method=method))

def test_fragment_and_json():
 assert not eligible(request(headers={'x-public-fragment':'1'}))
 assert not eligible(request(headers={'accept':'application/json'}))
 assert not eligible(request('/en?'+('&a=1'*50)))

@pytest.fixture
def worker(entry,monkeypatch):
 import workers
 monkeypatch.setattr(workers,'Response',lambda body,**kw:SimpleNamespace(body=body,**kw),raising=False)
 obj=entry.Default();obj.env=SimpleNamespace(TEACHER_WORKER_CACHE_MODE="off");obj.ctx=SimpleNamespace()
 return obj

def invoke(entry,worker,req):
 # Historical helper remains available, but is no longer installed around Public dispatch.
 from runtime.public_recovery import eligible,run
 async def call():return await entry.Default._dynamic_fetch.__wrapped__(worker,req)
 return asyncio.run(run(req,call,'test-trace','') if eligible(req) else call())


def test_failed_initialization_recovery_and_next_request_rebuild(entry,worker,monkeypatch,capsys):
 async def app(*args):pass
 async def fetch(app,*args):
  await app({},None,None)
  return SimpleNamespace(status=200,headers={},body=None)
 monkeypatch.setattr(entry.asgi,'fetch',fetch)
 factory=Mock(side_effect=[RuntimeError('private diagnostic'),app]);monkeypatch.setattr(entry,'build_application',factory)
 a=invoke(entry,worker,request(headers={'cf-ray':'a47506958cc7ccb6-EWR'}))
 assert a.status==503 and a.headers['cache-control']=='no-store'
 assert 'data-public-recovery' in a.body and 'private diagnostic' not in a.body
 assert entry.application.application is None
 log=capsys.readouterr().out
 assert 'PUBLIC-RECOVERY' in log and 'RuntimeError' in log and 'a47506958cc7ccb6-EWR' in log
 assert invoke(entry,worker,request()).status==200 and factory.call_count==2

@pytest.mark.parametrize('status',[500,502,503,504])
def test_error_status_cancels_body_without_reading(entry,worker,monkeypatch,status):
 body=SimpleNamespace(locked=False,cancel=AsyncMock())
 original=SimpleNamespace(status=status,headers={},body=body)
 monkeypatch.setattr(entry,'dispatch',AsyncMock(return_value=original))
 a=invoke(entry,worker,request('/en?__recover=1'))
 assert a.status==503 and 'data-attempted="1"' in a.body
 body.cancel.assert_awaited_once()
 assert entry.application.application is None

@pytest.mark.parametrize('status',[200,304,400,403,404,429])
def test_other_responses_untouched(entry,worker,monkeypatch,status):
 original=SimpleNamespace(status=status,headers={},body=None)
 monkeypatch.setattr(entry,'dispatch',AsyncMock(return_value=original))
 assert invoke(entry,worker,request()) is original


def test_existing_recovery_untouched(entry,worker,monkeypatch):
 original=SimpleNamespace(status=503,headers={'x-public-recovery':'1'},body=None)
 monkeypatch.setattr(entry,'dispatch',AsyncMock(return_value=original))
 assert invoke(entry,worker,request()) is original


def test_bridge_exception_and_head(entry,worker,monkeypatch,capsys):
 class JsException(Exception):pass
 monkeypatch.setattr(entry,'dispatch',AsyncMock(side_effect=JsException('private SQL')))
 a=invoke(entry,worker,request(method='HEAD'));assert a.status==503 and a.body==''
 assert 'JsException' in capsys.readouterr().out and a.headers['retry-after']=='1'


def test_abort_and_async_cancel(entry,worker,monkeypatch,capsys):
 dispatch=AsyncMock();monkeypatch.setattr(entry,'dispatch',dispatch)
 assert invoke(entry,worker,request(aborted=True)).status==499;dispatch.assert_not_called()
 class AbortError(Exception):name='AbortError'
 req=request()
 async def abort(*args):req.signal.aborted=True;raise AbortError()
 monkeypatch.setattr(entry,'dispatch',abort)
 assert invoke(entry,worker,req).status==499
 monkeypatch.setattr(entry,'dispatch',AsyncMock(side_effect=asyncio.CancelledError()))
 with pytest.raises(asyncio.CancelledError):invoke(entry,worker,request())
 assert 'PUBLIC-RECOVERY' not in capsys.readouterr().out


def test_admin_forward_never_builds_public(entry,worker,monkeypatch):
 import worker_runtime.admin_recovery as recovery
 async def forward(binding,request):return await binding.fetch(request)
 monkeypatch.setattr(recovery,'forward',forward)
 expected=SimpleNamespace(status=500,headers={},body=None)
 worker.env.SITE_ADMIN=SimpleNamespace(fetch=AsyncMock(return_value=expected))
 monkeypatch.setattr(entry,'build_application',Mock(side_effect=AssertionError('public build')))
 result=invoke(entry,worker,request('/admin'))
 assert result.status==503 and result.headers['x-admin-recovery']=='1'
 assert 'x-public-recovery' not in result.headers
 assert entry.application.application is None


def test_excluded_exception_propagates(entry,worker,monkeypatch):
 monkeypatch.setattr(entry,'dispatch',AsyncMock(side_effect=RuntimeError('real failure')))
 for req in (request('/media/a'),request('/en/news/u1'),request('/en/contact'),request(method='POST'),request(headers={'x-public-fragment':'1'})):
  with pytest.raises(RuntimeError):invoke(entry,worker,req)


def test_cleanup_error_is_logged(entry,worker,monkeypatch,capsys):
 body=SimpleNamespace(locked=False,cancel=AsyncMock(side_effect=RuntimeError('cleanup')))
 monkeypatch.setattr(entry,'dispatch',AsyncMock(return_value=SimpleNamespace(status=503,headers={},body=body)))
 assert invoke(entry,worker,request()).status==503
 assert 'PUBLIC-RECOVERY-CLEANUP' in capsys.readouterr().out


def test_sync_binding_failure_response_untouched(entry,worker,monkeypatch):
 original=SimpleNamespace(status=503,headers={},body=None)
 worker.env.TEACHER_SYNC_EXECUTOR_MODE='separate'
 worker.env.SYNC_EXECUTOR=SimpleNamespace(fetch=AsyncMock(return_value=original))
 monkeypatch.setattr(entry,'build_application',Mock(side_effect=AssertionError('public init')))
 assert invoke(entry,worker,request('/sync/v1/read')) is original


