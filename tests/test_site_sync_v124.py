"""Transport failures remain actionable without logging secrets or replaying writes."""
import asyncio,json,socket,ssl,sys
from types import SimpleNamespace,ModuleType
from unittest.mock import Mock,AsyncMock
import pytest
from backend.app.native import site_sync_transport as t
from backend.app.native.catalog import Error
run=asyncio.run

@pytest.mark.parametrize('exc,code',[(socket.gaierror('private detail'),'dns'),(ssl.SSLCertVerificationError('private detail'),'certificate'),(ConnectionRefusedError(),'refused'),(TimeoutError(),'timeout'),(ConnectionResetError(),'network')])
def test_classification(exc,code):assert t.classify(exc).code=='sync_'+code

@pytest.mark.parametrize('status,body,code',[(302,b'','redirect'),(403,b'<html>','http_403'),(500,b'<html>','http_500'),(200,b'<html>Login</html>','json'),(200,b'[]','protocol'),(200,b'\xff','json')])
def test_response_types(status,body,code):
 with pytest.raises(Error) as caught:t.response_json(status,body)
 assert caught.value.code=='sync_'+code
 assert '<html>' not in caught.value.message

def test_clock_and_signature_separate(monkeypatch):
 data=t.envelope('a'*40,{'op':'hello'})
 with pytest.raises(Error) as e:t.verify('b'*40,data)
 assert e.value.code=='sync_signature'
 monkeypatch.setattr(t.time,'time',lambda:data['time']+121)
 with pytest.raises(Error) as e:t.verify('a'*40,data)
 assert e.value.code=='sync_clock'

def test_post_diagnostic_is_safe(monkeypatch,caplog):
 async def broken(*args):raise RuntimeError('secret-password full private body')
 monkeypatch.setattr(t,'_worker',broken)
 with pytest.raises(Error) as e:run(t.post('r2','https://b.example.org',t.envelope('secret-password',{'op':'page'})))
 assert '诊断编号' in e.value.message and e.value.code=='sync_runtime'
 assert 'operation=page' in caplog.text
 assert 'secret-password' not in caplog.text+e.value.message
 assert 'private body' not in caplog.text

def test_local_second_address_without_post_replay(monkeypatch):
 import http.client
 monkeypatch.setattr(socket,'getaddrinfo',lambda *a,**k:[(0,0,0,'',('2606:4700::1111',443)),(0,0,0,'',('1.1.1.1',443))])
 sock=Mock();attempts=[]
 def connect(addr,**kw):
  attempts.append(addr)
  if len(attempts)==1:raise OSError('IPv6 unreachable')
  return sock
 monkeypatch.setattr(socket,'create_connection',connect)
 monkeypatch.setattr(ssl,'create_default_context',lambda:SimpleNamespace(wrap_socket=lambda *a,**k:sock))
 body=json.dumps(t.envelope('s'*40,{'ok':True})).encode();response=SimpleNamespace(status=200,isclosed=lambda:False,read1=Mock(side_effect=[body,b'']))
 connections=[]
 def connection(*args,**kwargs):
  c=Mock();c.getresponse.return_value=response;connections.append(c);return c
 monkeypatch.setattr(http.client,'HTTPSConnection',connection)
 assert t._local('https://b.example.org/api/site-sync/peer',b'{}')['payload']['ok']
 assert len(attempts)==2
 assert sum(c.request.call_count for c in connections)==1
 # An error after POST is not replayed against the second IP.
 attempts.clear()
 monkeypatch.setattr(socket,'create_connection',lambda *a,**k:sock)
 def fail_connection(*a,**k):
  c=Mock();c.getresponse.side_effect=ConnectionResetError();connections.append(c);return c
 monkeypatch.setattr(http.client,'HTTPSConnection',fail_connection)
 n=len(connections)
 with pytest.raises(ConnectionResetError):t._local('https://b.example.org',b'{}')
 assert len(connections)==n+1

def test_worker_stream_error_survives_cleanup_failure(monkeypatch):
 js=ModuleType('js');ffi=ModuleType('pyodide.ffi')
 reader=SimpleNamespace(read=AsyncMock(side_effect=RuntimeError('stream secret')),cancel=AsyncMock(side_effect=RuntimeError('cleanup secret')))
 js.fetch=AsyncMock(return_value=SimpleNamespace(status=200,body=SimpleNamespace(getReader=lambda:reader)))
 js.AbortController=SimpleNamespace(new=lambda:SimpleNamespace(signal=object(),abort=Mock()))
 js.Object=SimpleNamespace(fromEntries=object());ffi.to_js=lambda *a,**k:SimpleNamespace()
 monkeypatch.setitem(sys.modules,'js',js);monkeypatch.setitem(sys.modules,'pyodide.ffi',ffi)
 with pytest.raises(Error) as caught:run(t._worker('https://b.example.org',b'{}'))
 assert caught.value.code=='sync_stream'
 assert 'secret' not in caught.value.message
 reader.cancel.assert_awaited_once()
