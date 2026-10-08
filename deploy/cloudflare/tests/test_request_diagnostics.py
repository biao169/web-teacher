import asyncio,json,sys
from types import SimpleNamespace
import pytest
from runtime.request_diagnostics import traced
from site_sync.core.trace import current

class Headers(dict):
    def set(self,k,v):self[k]=v
class Response:
    def __init__(self,body,source):
        self.body=body;self.status=source.status;self.headers=Headers(source.headers)
    new=classmethod(lambda cls,body,source:cls(body,source))

def test_request_stream_is_not_read_and_context_is_reset(monkeypatch,capsys):
    monkeypatch.setitem(sys.modules,'js',SimpleNamespace(Response=Response))
    body=object();original=SimpleNamespace(status=200,body=body,headers=Headers())
    class Worker:
        env=SimpleNamespace(TEACHER_SYNC_EXECUTOR_MODE='separate')
        @traced('main-site',http=True)
        async def fetch(self,request):
            assert current()['colo']=='MXP'
            assert current()['execution_colo'] is None
            return original
    request=SimpleNamespace(url='https://test.invalid/admin/site-sync?secret=not-logged',method='GET',headers=Headers({'cf-ray':'12345678abcdef12-MXP'}),cf={'colo':'MXP','country':'CN'})
    response=asyncio.run(Worker().fetch(request))
    assert response.body is body and not original.headers
    assert len(response.headers['x-request-id'])==32
    logs=[json.loads(line) for line in capsys.readouterr().out.splitlines()]
    log=logs[-1]
    assert response.headers['x-teacher-release']=='0.16.046'
    assert all(e['request_id']==log['request_id'] for e in logs)
    assert [(e['event'],e['stage']) for e in logs if e.get('event','').startswith('OPERATION-')]==[('OPERATION-START','http-handler'),('OPERATION-END','http-handler'),('OPERATION-START','response-wrap'),('OPERATION-END','response-wrap')]
    assert log['request_id']==response.headers['x-request-id']
    assert log['country']=='CN' and log['route']=='sync-admin'
    assert 'secret' not in json.dumps(log)
    assert log['platform_outcome'] is None
    assert current()=={}

def test_exception_is_logged_and_rethrown_without_context_leak(capsys):
    class Worker:
        env=SimpleNamespace(TEACHER_SYNC_EXECUTOR_MODE='separate')
        @traced('sync-executor')
        async def scheduled(self):raise RuntimeError('private-token')
    with pytest.raises(RuntimeError):asyncio.run(Worker().scheduled())
    logs=[json.loads(s) for s in capsys.readouterr().out.splitlines()]
    assert logs[-1]['stage']=='INVOCATION-ERROR'
    assert logs[-1]['error_type']=='RuntimeError'
    assert logs[-1]['colo'] is None
    assert 'private-token' not in json.dumps(logs)
    assert current()=={}
