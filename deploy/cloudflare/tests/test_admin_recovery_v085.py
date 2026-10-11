import asyncio
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
import pytest
from test_startup_lazy import entry

@pytest.mark.parametrize('status',[200,302,401,403,404,500,502,503,504])
def test_forward_response_boundary(entry,monkeypatch,status,capsys):
 import workers,worker_runtime.admin_recovery as recovery
 async def forward(binding,request):return await binding.fetch(request)
 monkeypatch.setattr(recovery,'forward',forward)
 monkeypatch.setattr(workers,'Response',lambda body,**kw:NS(body=body,**kw),raising=False)
 body=NS(locked=False,cancel=AsyncMock())
 original=NS(status=status,headers={'x-request-id':'upstream'},body=body)
 worker=entry.Default();worker.env=NS(SITE_ADMIN=NS(fetch=AsyncMock(return_value=original)))
 req=NS(url='https://test/admin/profiles',method='GET',headers={})
 result=asyncio.run(entry.Default.fetch.__wrapped__(worker,req))
 if status<500:assert result is original
 else:
  assert result.status==503 and '<title>' in result.body
  assert result.headers['retry-after']=='2'
  assert result.headers['cache-control']==result.headers['cloudflare-cdn-cache-control']=='no-store'
  body.cancel.assert_awaited_once()
 assert entry.application.application is None

@pytest.mark.parametrize('method,path',[('POST','/api/admin/profiles'),('HEAD','/admin'),('GET','/admin')])
def test_admin_exception_boundary(entry,monkeypatch,method,path,capsys):
 import workers,worker_runtime.admin_entrypoint as admin
 monkeypatch.setattr(workers,'Response',lambda body,**kw:NS(body=body,**kw),raising=False)
 dispatch=AsyncMock(side_effect=RuntimeError('secret-do-not-expose'))
 monkeypatch.setattr(admin,'dispatch_upload',dispatch)
 worker=admin.Default();worker.env=NS();worker.ctx=NS()
 req=NS(url='https://test'+path,method=method,headers={})
 result=asyncio.run(admin.Default.fetch.__wrapped__(worker,req))
 assert result.status==503 and 'secret-do-not-expose' not in result.body
 assert dispatch.await_count==1
 if method=='HEAD':assert result.body==''
 if method=='POST':assert 'application/json' in result.headers['content-type']
 logs=capsys.readouterr().out
 assert 'RuntimeError' in logs and 'ADMIN-DISPATCH' in logs and 'frames' in logs
