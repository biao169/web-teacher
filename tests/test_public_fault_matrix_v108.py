"""Application fault contracts; does not simulate Cloudflare CPU limits or eviction."""
import asyncio
from types import SimpleNamespace
import pytest
from backend.app.native.public_read_api import generate,error_reply
from backend.app.public_performance import PUBLIC_EDGE_POLICY
from test_accounts_regression import fixture

@pytest.mark.parametrize('status',[400,401,403,404,405,429,500,502,503,504])
def test_data_error_has_no_success_object_metadata(status):
    reply=error_reply(status,'FAULT_ACCEPTANCE')
    assert not reply.cacheable
    assert reply.headers['Cache-Control']==reply.headers['Cloudflare-CDN-Cache-Control']=='no-store'
    assert not any(key in reply.headers for key in ('ETag','Cache-Tag','X-Teacher-Data-OK'))

@pytest.mark.parametrize('fault',[RuntimeError('D1 unavailable'),TimeoutError('deadline')])
def test_generation_fault_is_uncached_and_does_not_purge(monkeypatch,fault):
    import backend.app.native.public_read_model as models
    calls=[]
    async def fail(*args):calls.append('build');raise fault
    monkeypatch.setattr(models,'build',fail)
    request=SimpleNamespace(url='https://site.test/api/public/data/en/profiles',method='GET',headers={})
    result=asyncio.run(generate(request,SimpleNamespace()))
    assert result.status==503 and not result.cacheable and calls==['build']
    assert result.headers['Cache-Control']=='no-store' and 'Cache-Tag' not in result.headers
    # No cache object exists in the resource context: fault code cannot delete success objects.

@pytest.mark.parametrize('fault',[RuntimeError('D1 unavailable'),TimeoutError('deadline')])
def test_unknown_identity_is_503_not_anonymous(fixture,monkeypatch,fault):
    c,r=fixture
    async def fail(*args,**kwargs):raise fault
    monkeypatch.setattr(r.sql,'query',fail)
    response=c.get('/api/public/session-summary')
    assert response.status_code==503 and 'authenticated' not in response.json()
    assert 'no-store' in response.headers['cache-control']
    assert response.headers['cloudflare-cdn-cache-control']=='no-store'


def test_edge_policy_retains_stale_without_forcing_revalidation():
    assert 'stale-if-error=86400' in PUBLIC_EDGE_POLICY
    assert 'stale-while-revalidate=300' in PUBLIC_EDGE_POLICY
    assert all(token not in PUBLIC_EDGE_POLICY for token in ('s-maxage','must-revalidate','proxy-revalidate'))
