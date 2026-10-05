"""Public HTTP, coordinated HTTP and cron must not construct each other's state."""
import asyncio
from types import SimpleNamespace
from unittest.mock import Mock, AsyncMock
from fastapi.testclient import TestClient
from test_lazy_transfer_state import builder, entry, fixture


def test_home_login_setup_never_install_transfer(builder, monkeypatch):
    entry, r, _ = builder
    import worker_runtime.transfer as transfer
    install = Mock(side_effect=AssertionError('main request constructed transfer'))
    monkeypatch.setattr(transfer, 'install', install)
    async def with_bindings(scope, receive, send):
        await entry.application({**scope, "env": SimpleNamespace(DB=object(), MEDIA=object())}, receive, send)
    with TestClient(with_bindings, base_url=r.config.origin) as c:
        for path in ('/en', '/auth/login', '/setup'):
            assert c.get(path).status_code in (200, 404)
    install.assert_not_called()
    assert not hasattr(entry.application.application.app.app.state, 'worker_transfer')


def test_transfer_admin_keeps_integrated_workspace(builder):
    entry, r, _ = builder
    app = entry.LazyApplication(include_transfer=True)
    with TestClient(app, base_url=r.config.origin) as c:
        token = asyncio.run(r.auth.login('test-admin', 'Password-only-for-test', 'split'))
        c.cookies.set(r.config.name('session'), token)
        assert c.get('/admin/transfer').status_code == 200
        assert c.get('/transfer/').status_code == 200
    assert hasattr(app.application.app.app.state, 'transfer_admin_workspace')
    assert hasattr(app.application.app.app.state, 'worker_transfer')
    assert entry.application.application is None


def test_cron_does_not_build_http_app(entry, monkeypatch, capsys):
    import worker_runtime.bridge as bridge
    import worker_runtime.storage as storage
    import worker_runtime.cleanup as cleanup
    import backend.app.adapters.d1.sql as d1
    import worker_runtime.sync_schedule as sync_schedule
    sync_run=AsyncMock(return_value=None)
    monkeypatch.setattr(sync_schedule, 'run', sync_run)
    build = Mock(side_effect=AssertionError('cron built HTTP app'))
    monkeypatch.setattr(entry, 'build_application', build)
    monkeypatch.setattr(bridge, 'Environment', lambda env: env)
    sql, store = object(), object()
    make_sql = Mock(return_value=sql)
    make_store = Mock(return_value=store)
    run = AsyncMock(return_value={"skipped": "interval"})
    monkeypatch.setattr(d1, 'D1SQL', make_sql)
    monkeypatch.setattr(storage, 'TransferStore', make_store)
    monkeypatch.setattr(cleanup, 'run', run)
    worker = entry.Default()
    worker.env = SimpleNamespace(TEACHER_DATABASE_BINDING='DB', TEACHER_MEDIA_BINDING='MEDIA', DB=object(), MEDIA=object())
    asyncio.run(worker.scheduled(SimpleNamespace(scheduledTime=0)))
    build.assert_not_called()
    run.assert_awaited_once_with(sql, store)
    sync_run.assert_not_awaited()
    import json
    logs = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    log = next(row for row in logs if row['stage']=='CRON')
    assert [(row['stage'],row['status']) for row in logs if row['stage'] in ('CRON-MODULES','CRON-DATABASE')]==[('CRON-MODULES','START'),('CRON-MODULES','OK'),('CRON-DATABASE','START'),('CRON-DATABASE','OK')]
    assert log["stage"] == "CRON" and log["status"] == "SKIPPED" and log["reason"] == "interval"
    make_store.assert_called_once_with(worker.env.MEDIA, 'transfer/media/')
    assert entry.application.application is None
