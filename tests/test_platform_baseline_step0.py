"""Step 0 invariants: real app/lifecycle and generated deployment, no production I/O."""
import asyncio
import runpy
from pathlib import Path
from unittest.mock import Mock
import pytest
from fastapi import FastAPI
from test_accounts_regression import fixture

ROOT=Path(__file__).resolve().parents[1]


def test_vps_entry_builds_one_app_and_one_sync_loop(fixture,monkeypatch):
    _,r=fixture
    from backend.app.native import runtime,web
    from site_sync.integration import host
    local=Mock(return_value=r);build=Mock(wraps=web.create_app);install=Mock(wraps=host.install_local)
    monkeypatch.setattr(runtime,'local',local)
    monkeypatch.setattr(web,'create_app',build)
    monkeypatch.setattr(host,'install_local',install)
    state=runpy.run_path(str(ROOT/'backend/entrypoints/vps.py'))
    app=state['app']
    assert isinstance(app,FastAPI)
    assert not any(isinstance(getattr(route,'app',None),FastAPI) for route in app.routes)
    local.assert_called_once_with();build.assert_called_once();install.assert_called_once_with(app,r)
    assert not hasattr(app.state,'sync_task')
    async def lifecycle():
        arrived=asyncio.Event();ticks=[]
        async def tick(resource):
            ticks.append(resource);arrived.set();await asyncio.Event().wait()
        monkeypatch.setattr(host,'tick',tick)
        await app.router.startup()
        try:
            await asyncio.wait_for(arrived.wait(),2)
            task=app.state.sync_task
            assert ticks==[r] and not task.done()
            # No duplicate installed startup hook; only the production entry owns it.
            assert sum(getattr(h,'__qualname__','')=='install_local.<locals>.start' for h in app.router.on_startup)==1
        finally:await app.router.shutdown()
        assert task.done()
    asyncio.run(lifecycle())


@pytest.mark.parametrize('port,name',[(8003,'teacher-site.service'),(8123,'teacher-site-lab.service')])
def test_linux_render_single_service_port_and_budget(tmp_path,monkeypatch,port,name):
    from deploy.vps.release import render
    monkeypatch.delenv('TEACHER_HTTP_CONCURRENCY',raising=False)
    out=tmp_path/'render'
    result=render(out,'/opt/teacher-site','primary.example.org',None,'/opt/teacher-site/venv/bin/python',port=port,service_name=name,allowed_origins='https://alias.example.org')
    assert result['services']==1 and not result['system_modified']
    assert [p.name for p in out.glob('*.service')]==[name]
    unit=(out/name).read_text();proxy=(out/'Caddyfile.fragment').read_text()
    assert unit.count('ExecStart=')==1
    assert f'deploy.shared.service backend.entrypoints.vps:app --host 127.0.0.1 --port {port} --limit-concurrency 16' in unit
    for line in ('MemoryHigh=160M','MemoryMax=224M','TasksMax=32'):assert line in unit
    import re
    assert set(re.findall(r'reverse_proxy\s+(\S+)',proxy))=={f'127.0.0.1:{port}'}
    for area in ('shared','public','admin','site-sync'):assert '/assets/'+area+'/*' in proxy


@pytest.mark.parametrize('value,expected',[(None,16),('8',8),('32',32),('7',None),('33',None),('bad',None)])
def test_http_capacity_contract(monkeypatch,value,expected):
    from deploy.shared.http_limits import teacher_concurrency
    if value is None:monkeypatch.delenv('TEACHER_HTTP_CONCURRENCY',raising=False)
    else:monkeypatch.setenv('TEACHER_HTTP_CONCURRENCY',value)
    if expected is None:
        with pytest.raises(ValueError):teacher_concurrency()
    else:assert teacher_concurrency()==expected


def test_service_launcher_uses_one_uvicorn_worker(tmp_path,monkeypatch):
    import logging
    from backend.app.config import Settings
    from deploy.shared import service
    import uvicorn
    monkeypatch.setattr(Settings,'from_env',classmethod(lambda cls:Settings(tmp_path)))
    launch=Mock();monkeypatch.setattr(uvicorn,'run',launch)
    root=logging.getLogger();handlers=list(root.handlers);level=root.level
    try:service.main(['backend.entrypoints.vps:app','--port','8123','--limit-concurrency','16'])
    finally:root.handlers=handlers;root.setLevel(level)
    assert launch.call_count==1
    assert launch.call_args.args==('backend.entrypoints.vps:app',)
    assert launch.call_args.kwargs['workers']==1
    assert launch.call_args.kwargs['port']==8123
    assert launch.call_args.kwargs['limit_concurrency']==16


def test_full_app_routes_and_read_only_pages_do_not_tick(fixture,monkeypatch):
    c,r=fixture
    from site_sync.integration import host
    from unittest.mock import AsyncMock
    tick=AsyncMock(side_effect=AssertionError('HTTP must not tick'))
    monkeypatch.setattr(host,'tick',tick)
    routes={route.path for route in c.app.routes}
    for path in ('/admin','/auth/login','/health/ready'):assert path in routes
    for path in ('/zh','/en','/admin','/admin/media_assets','/admin/site-sync'):
        response=c.get(path)
        assert response.status_code==200,(path,response.status_code)
    tick.assert_not_awaited()
