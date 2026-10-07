"""Production HTTPS origin over local HTTP, with Host validation still enabled."""
import os
import sys
import json
from types import SimpleNamespace
from urllib.error import HTTPError,URLError
import pytest
if os.name!='posix':pytest.skip('Linux deployment health',allow_module_level=True)
from deploy.linux import tweb
from list_fixture import client_at
from test_release_acceptance import port,launch,ready
import httpx


def test_production_origin_real_service_and_launcher(tmp_path,monkeypatch):
    listen=port();domain='teacher.example.org';origin='https://'+domain
    seed,r=client_at(tmp_path/'data',origin);seed.close()
    env={k:v for k,v in os.environ.items() if not k.startswith(('TEACHER_','TRANSFER_'))}
    env.update(TEACHER_DATA_DIR=str(tmp_path/'data'),TEACHER_PORT=str(listen),TEACHER_ORIGIN=origin,
               TRANSFER_MEDIA_DIR=str(tmp_path/'files'),TRANSFER_CACHE_DIR=str(tmp_path/'cache'),PYTHONDONTWRITEBYTECODE='1')
    m=tweb.Manager();monkeypatch.setattr(m,'load',lambda:dict(port=listen,domain=domain))
    with (tmp_path/'launcher.log').open('w') as log,httpx.Client(base_url=f'http://127.0.0.1:{listen}',trust_env=False,timeout=3) as client:
        process=launch(env,log,2)
        try:
            # Wait using the expected production domain without DNS, TLS or a proxy.
            client.headers['Host']=domain;ready(client,process,'/health/ready')
            assert client.get('/health/ready',headers={'Host':f'127.0.0.1:{listen}'}).status_code==400
            assert client.get('/health/ready').json()['status']=='ok'
            m.healthy()
            assert process.wait(timeout=15)==0
        finally:
            if process.poll() is None:process.terminate();process.wait(timeout=10)
    assert 'Website: https://teacher.example.org' in (tmp_path/'launcher.log').read_text()


def manager(monkeypatch,opener):
    m=tweb.Manager();monkeypatch.setattr(m,'load',lambda:dict(port=9123,domain='teacher.example.org'))
    monkeypatch.setattr(tweb,'build_opener',lambda *a:SimpleNamespace(open=opener))
    monkeypatch.setattr(tweb.time,'sleep',lambda _:None)
    return m


def test_wrong_host_reports_http_status_immediately(monkeypatch):
    calls=[]
    def opener(request,**kw):
        calls.append(request);raise HTTPError(request.full_url,400,'Bad request',{},None)
    m=manager(monkeypatch,opener)
    with pytest.raises(RuntimeError,match='HTTP 400'):m.healthy()
    assert len(calls)==1 and calls[0].get_header('Host')=='teacher.example.org'


def test_connection_failure_keeps_actual_reason_and_journal_hint(monkeypatch):
    def opener(*a,**kw):raise URLError(ConnectionRefusedError('connection refused'))
    m=manager(monkeypatch,opener)
    with pytest.raises(RuntimeError,match='connection refused') as exc:m.healthy()
    assert 'journalctl' in str(exc.value) and '9123' in str(exc.value)


def test_unrelated_http_200_is_not_healthy(monkeypatch):
    class Reply:
        status=200
        def read(self,n):return b'<html>other site</html>'
        def __enter__(self):return self
        def __exit__(self,*args):pass
    m=manager(monkeypatch,lambda *a,**kw:Reply())
    with pytest.raises(RuntimeError,match='Unexpected health response'):m.healthy()
