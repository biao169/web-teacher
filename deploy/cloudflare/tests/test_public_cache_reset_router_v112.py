"""Trusted Admin marker routes to owning entrypoints; simulated platform only."""
import asyncio,json
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
import pytest
from test_startup_lazy import entry
from test_public_invalidation_v107 import Response,Headers
from backend.app.native.public_cache_tags import RESET_HEADER,RESET_MODULES,Plan,HEADER

@pytest.fixture
def reset_runtime(entry,monkeypatch):
    import workers,worker_runtime.public_invalidation as module
    def build(body,status=200,headers=None):return NS(text=body,status=status,headers=Headers(headers or {}))
    monkeypatch.setattr(workers,'Response',build,raising=False)
    monkeypatch.setattr(module,'RESET_TIMEOUT',.02)
    return module

def ctx(page=True,data=True):
    return NS(exports=NS(PublicPage=NS(update_public_cache=AsyncMock(return_value=page)),PublicData=NS(update_public_cache=AsyncMock(return_value=data))))

@pytest.mark.parametrize('module',RESET_MODULES)
def test_each_module_calls_the_correct_caches_once_and_never_warms(reset_runtime,module):
    response=Response(202,{RESET_HEADER:module});context=ctx()
    result=asyncio.run(reset_runtime.relay_reset(response,context));body=json.loads(result.text)
    assert result.status==200 and body['module']==module and body['page_cache']=='accepted'
    assert body['data_cache']==('not_applicable' if module=='home' else 'accepted')
    assert result.headers.get(RESET_HEADER) is None and result.headers.get('cache-control')=='no-store'
    response.body.cancel.assert_awaited_once()
    for name in ['PublicPage'] if module=='home' else ['PublicPage','PublicData']:
        rpc=getattr(context.exports,name).update_public_cache;rpc.assert_awaited_once()
        assert json.loads(rpc.call_args.args[0])=={'invalidate':[],'purge':['public-'+module.replace('_','-')]}
    if module=='home':context.exports.PublicData.update_public_cache.assert_not_awaited()

@pytest.mark.parametrize('failure',['rejected','exception','timeout'])
def test_partial_failure_keeps_independent_outcomes_and_no_retry(reset_runtime,failure,capsys):
    context=ctx()
    if failure=='rejected':context.exports.PublicData.update_public_cache=AsyncMock(return_value=False)
    elif failure=='exception':context.exports.PublicData.update_public_cache=AsyncMock(side_effect=RuntimeError('unavailable'))
    else:
        async def slow(*args):await asyncio.sleep(1)
        context.exports.PublicData.update_public_cache=AsyncMock(side_effect=slow)
    result=asyncio.run(reset_runtime.relay_reset(Response(202,{RESET_HEADER:'profiles'}),context));data=json.loads(result.text)
    assert result.status==(503 if failure in ('exception','timeout') else 502)
    assert data['page_cache']=='accepted' and data['data_cache']==('unknown' if failure in ('exception','timeout') else 'failed')
    assert context.exports.PublicPage.update_public_cache.await_count==context.exports.PublicData.update_public_cache.await_count==1
    logs=capsys.readouterr().out
    assert 'public-profiles' in logs and 'request_id' in logs and 'page_cache' in logs and 'data_cache' in logs

@pytest.mark.parametrize('module,status',[('public-layout',202),('all',202),('profiles',500)])
def test_untrusted_or_invalid_markers_never_trigger_rpc(reset_runtime,module,status):
    context=ctx();result=asyncio.run(reset_runtime.relay_reset(Response(status,{RESET_HEADER:module}),context))
    assert result.status==502 and result.headers.get(RESET_HEADER) is None
    context.exports.PublicPage.update_public_cache.assert_not_awaited();context.exports.PublicData.update_public_cache.assert_not_awaited()

def test_normal_admin_responses_remain_unchanged(reset_runtime):
    original=Response(303,{'location':'/admin'});assert asyncio.run(reset_runtime.relay_reset(original,ctx())) is original

def test_main_relay_preserves_maintenance_failure_json_outside_recovery(entry,reset_runtime,monkeypatch):
    import worker_runtime.admin_recovery as recovery
    async def direct(binding,request):return await binding.fetch(request)
    monkeypatch.setattr(recovery,'forward',direct)
    worker=entry.Default();worker.env=NS(SITE_ADMIN=NS(fetch=AsyncMock(return_value=Response(202,{RESET_HEADER:'profiles'}))));worker.ctx=ctx(data=False)
    result=asyncio.run(entry.Default._dynamic_fetch.__wrapped__(worker,NS(method='POST',url='https://site.test/api/admin/public-cache/reset',headers={})))
    assert result.status==502 and json.loads(result.text)['data_cache']=='failed'
    worker.env.SITE_ADMIN.fetch.assert_awaited_once()
