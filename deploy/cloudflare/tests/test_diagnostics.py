import json
import pytest
from runtime.diagnostics import phase
from smoke import inspect


def test_exception_frames_no_secrets_and_original_error_preserved(capsys):
    error = ValueError('secret-password token=user-secret SELECT private')
    with pytest.raises(ValueError) as caught:
        with phase('INIT-MAIN'):
            raise error
    assert caught.value is error
    output = capsys.readouterr().out
    assert 'secret-password' not in output and 'user-secret' not in output and 'SELECT' not in output
    rows = [json.loads(line) for line in output.splitlines()]
    assert [r['status'] for r in rows] == ['START', 'ERROR']
    assert rows[-1]['exceptions'][0]['type'] == 'ValueError'
    assert rows[-1]['exceptions'][0]['frames'][-1]['function'] == 'test_exception_frames_no_secrets_and_original_error_preserved'


def test_successful_requests_do_not_emit_per_request_logs(capsys):
    with phase('FETCH', progress=False):
        pass
    assert capsys.readouterr().out == ''


def test_probe_reports_platform_error_and_ray_without_body():
    class Reply:
        code = 500
        headers = {'Content-Type': 'text/plain', 'CF-Ray': 'a430d41bfa1633d5-SJC'}
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, limit): return b'error code: 1102 secret-body'
    result = inspect('https://teacher.test', lambda *a, **k: Reply(), repeat_startup=True)
    assert not result['ok']
    assert all(row['cloudflare_error'] == '1102' for row in result['checks'])
    assert all(row['cf_ray'] == 'a430d41bfa1633d5-SJC' for row in result['checks'])
    assert 'secret-body' not in json.dumps(result)
