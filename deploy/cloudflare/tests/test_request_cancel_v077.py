import asyncio,json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from test_startup_lazy import entry
from runtime.request_cancel import client_cancelled
class AbortError(Exception):name='AbortError'
@pytest.mark.parametrize('aborted,exc,expected',[(True,AbortError(),True),(False,AbortError(),False),(True,RuntimeError('abort cancelled'),False),(True,TypeError('real bug'),False),(True,asyncio.CancelledError(),True)])
def test_classification(aborted,exc,expected):
 assert client_cancelled(SimpleNamespace(signal=SimpleNamespace(aborted=aborted)),exc)==expected

def test_pyodide_cancellation():
 exc=Exception();exc.js_error=SimpleNamespace(name='AbortError')
 assert client_cancelled(SimpleNamespace(signal=SimpleNamespace(aborted=True)),exc)

@pytest.mark.parametrize('error,expected',[(AbortError(),499),(RuntimeError('real bug'),503)])
def test_binding_failure_boundary(entry,monkeypatch,capsys,error,expected):
 import workers
 class Response:
  def __init__(self,body,**kw):self.body=body;self.__dict__.update(kw)
 monkeypatch.setattr(workers,'Response',Response,raising=False)
 request=SimpleNamespace(url='https://site.test/api/public/session-summary',method='GET',signal=SimpleNamespace(aborted=False))
 async def fetch(actual):
  assert actual is request
  actual.signal.aborted=True
  raise error
 worker=entry.Default();worker.env=SimpleNamespace(SITE_ADMIN=SimpleNamespace(fetch=fetch))
 response=asyncio.run(entry.Default.fetch.__wrapped__(worker,request))
 assert response.status==expected and response.headers['cache-control']=='no-store'
 assert entry.application.application is None
 log=capsys.readouterr().out
 if expected==499:assert 'HTTP-CANCELLED' in log and 'ADMIN_UNAVAILABLE' not in log
 else:assert response.headers['retry-after']=='1' and 'ADMIN-FORWARD' in log

def test_already_cancelled_read_never_calls_admin(entry,monkeypatch):
 import workers
 monkeypatch.setattr(workers,'Response',lambda body,**kw:SimpleNamespace(body=body,**kw),raising=False)
 binding=SimpleNamespace(fetch=AsyncMock());worker=entry.Default();worker.env=SimpleNamespace(SITE_ADMIN=binding)
 request=SimpleNamespace(url='https://site.test/admin',method='GET',signal=SimpleNamespace(aborted=True))
 assert asyncio.run(entry.Default.fetch.__wrapped__(worker,request)).status==499
 binding.fetch.assert_not_called()

def test_admin_asgi_abort_is_cancelled(entry,monkeypatch):
 import workers,worker_runtime.admin_entrypoint as admin
 monkeypatch.setattr(workers,'Response',lambda body,**kw:SimpleNamespace(body=body,**kw),raising=False)
 request=SimpleNamespace(url='https://site.test/admin',method='GET',signal=SimpleNamespace(aborted=False))
 async def dispatch(*args):request.signal.aborted=True;raise AbortError()
 monkeypatch.setattr(admin,'dispatch_upload',dispatch)
 worker=admin.Default();worker.env=SimpleNamespace();worker.ctx=SimpleNamespace()
 assert asyncio.run(admin.Default.fetch.__wrapped__(worker,request)).status==499
def test_async_cancellation_logged_and_reraised(capsys):
 from runtime.request_diagnostics import traced
 class Worker:
  env=SimpleNamespace()
  @traced('admin-site',http=True)
  async def fetch(self,request):raise asyncio.CancelledError()
 request=SimpleNamespace(url='https://site.test/admin',method='GET',headers={},signal=SimpleNamespace(aborted=True))
 with pytest.raises(asyncio.CancelledError):asyncio.run(Worker().fetch(request))
 logs=capsys.readouterr().out
 assert 'INVOCATION-CANCELLED' in logs and 'INVOCATION-ERROR' not in logs
