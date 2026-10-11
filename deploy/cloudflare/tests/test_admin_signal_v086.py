import asyncio
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from test_startup_lazy import entry

def test_detached_request_preserves_body_and_public_passthrough(entry,monkeypatch):
 import sys,worker_runtime.admin_recovery as recovery
 js=NS(Object=NS(fromEntries=lambda x:x))
 monkeypatch.setitem(sys.modules,'js',js)
 monkeypatch.setitem(sys.modules,'pyodide',NS())
 monkeypatch.setitem(sys.modules,'pyodide.ffi',NS(to_js=lambda value,**kw:value))
 old=NS(aborted=False);fresh=NS(aborted=False);body=object()
 request=NS(url='https://test/admin/profiles',signal=old,body=body,method='POST',headers={'cookie':'test'})
 def new(original,options):
  return NS(**{**vars(original),'signal':options['signal']})
 monkeypatch.setattr(js,'Request',NS(new=new),raising=False)
 monkeypatch.setattr(js,'AbortController',NS(new=lambda:NS(signal=fresh)),raising=False)
 binding=NS(fetch=AsyncMock(return_value='ok'))
 assert asyncio.run(recovery.forward(binding,request))=='ok'
 forwarded=binding.fetch.call_args.args[0];old.aborted=True
 assert forwarded.signal is fresh and not forwarded.signal.aborted
 assert forwarded.body is body and forwarded.headers is request.headers
 request.url='https://test/api/public/session-summary'
 asyncio.run(recovery.forward(binding,request))
 assert binding.fetch.call_args.args[0] is request
