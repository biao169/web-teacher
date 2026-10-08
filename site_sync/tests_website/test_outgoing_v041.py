import asyncio,json
from types import SimpleNamespace
from unittest.mock import patch,AsyncMock
import pytest
import test_integration as fixtures
run=fixtures.run
from site_sync.integration.proposals import send,receive
from site_sync.integration.outgoing import listing
from site_sync.integration.capabilities import published
from site_sync.core.authority import ConflictError

@pytest.fixture
def pair():
    f=fixtures.IntegrationTests();f.setUp()
    try:yield f
    finally:f.tearDown()

def test_lost_remote_reply_retry_returns_same_task_and_persistent_receipt(pair):
    count=0
    async def candidates(q):
        nonlocal count
        if q['kind']=='probe':return await published(pair.target)
        value=await receive(pair.target,q);count+=1
        if count==1:raise TimeoutError('lost reply')
        return value
    rt=SimpleNamespace(peer_factory=AsyncMock(return_value=SimpleNamespace(candidates=candidates)))
    data={'request_id':'stable-proposal-041','scope':['profiles']}
    with patch('site_sync.integration.host.runtime',return_value=rt):
        with pytest.raises(TimeoutError):run(send(pair.source,data))
        first=run(listing(pair.source))['items'][0];assert first['status']=='unknown'
        result=run(send(pair.source,data));assert result['approval_required']
        again=run(send(pair.source,data));assert again==result and count==2
    assert len(run(pair.target.sql.query('SELECT task_id FROM sync_tasks')))==1
    receipt=run(listing(pair.source))['items'][0];assert receipt['status']=='confirmed' and receipt['result']['task_id']==result['task_id']

def test_request_id_cannot_change_scope_and_receipts_are_actor_scoped(pair):
    async def candidates(q):return await published(pair.target) if q['kind']=='probe' else await receive(pair.target,q)
    rt=SimpleNamespace(peer_factory=AsyncMock(return_value=SimpleNamespace(candidates=candidates)))
    with patch('site_sync.integration.host.runtime',return_value=rt):
        run(send(pair.source,{'request_id':'stable-proposal-042','scope':['profiles']}))
        with pytest.raises(ConflictError):run(send(pair.source,{'request_id':'stable-proposal-042','scope':['news']}))
    pair.source.p=dict(pair.source.p,uid='different-user');assert run(listing(pair.source))['items']==[]

def test_confirmed_receipt_not_overwritten_by_concurrent_error(pair):
    from site_sync.integration import outgoing
    data={'request_id':'stable-proposal-043','scope':['profiles']}
    key,row=run(outgoing.begin(pair.source,data,'https://peer.example'))
    run(outgoing.save(pair.source,key,row,status='confirmed',result={'task_id':'a'*32,'approval_required':True}))
    run(outgoing.save(pair.source,key,row,status='unknown'))
    assert run(listing(pair.source))['items'][0]['status']=='confirmed'

def test_receiver_returns_original_completed_task_even_if_new_proposal_pending(pair):
    q={'kind':'proposal','version':'proposal-v1','request_id':'first-receiver-041','scope':['profiles']}
    one=run(receive(pair.target,q))
    run(pair.target.sql.batch([("UPDATE sync_tasks SET status='done',phase='done' WHERE task_id=?",(one['task_id'],))]))
    two=run(receive(pair.target,dict(q,request_id='second-receiver-041')))
    assert one['task_id']!=two['task_id'] and run(receive(pair.target,q))==one

def test_receipts_bounded_even_if_sending_never_finishes(pair):
    from site_sync.integration import outgoing
    for i in range(60):run(outgoing.begin(pair.source,{'request_id':f'pending-request-{i:03d}','scope':['profiles']},'https://peer.example'))
    assert run(pair.source.sql.query("SELECT count(*) n FROM service_meta WHERE key LIKE 'sync:outgoing:%'"))[0]['n']==50
    assert len(run(listing(pair.source))['items'])==20

def test_proposal_endpoint_returns_structured_native_failure_without_secret(pair):
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    from fastapi.testclient import TestClient
    from backend.app.native.catalog import Error
    from site_sync.integration.web import install
    from site_sync.runtime.bridge import NativeError
    app=FastAPI()
    async def resources(request):return pair.source
    def csrf(request,r,data):
        if request.headers.get('x-csrf-token')!='test':raise Error('CSRF',403)
    async def err(request,e):return JSONResponse({'error':e.message},status_code=e.status)
    app.add_exception_handler(Error,err);install(app,resources,csrf,None,shared_middleware=False)
    failure=NativeError('credential');failure.http_status=403;failure.code='SYNC_SIGNATURE_INVALID';failure.reason='PRIVATE-KEY'
    with TestClient(app) as client,patch('site_sync.integration.proposals.send',new=AsyncMock(side_effect=failure)) as send_call:
        denied=client.post('/api/admin/site-sync/proposal',json={'scope':['profiles'],'request_id':'endpoint-041'});assert denied.status_code==403;send_call.assert_not_awaited()
        response=client.post('/api/admin/site-sync/proposal',headers={'x-csrf-token':'test'},json={'scope':['profiles'],'request_id':'endpoint-041'})
        assert response.status_code==503
        body=response.json();assert body['code']=='SYNC_SIGNATURE_INVALID' and len(body['request_id'])==32 and body['diagnostic']['causes'][0]['http_status']==403
        assert 'PRIVATE-KEY' not in response.text

def test_new_push_has_explicit_pending_code(pair):
    q={'kind':'proposal','version':'proposal-v1','request_id':'pending-receiver-041','scope':['profiles']}
    run(receive(pair.target,q))
    with pytest.raises(ConflictError) as caught:run(receive(pair.target,dict(q,request_id='pending-receiver-042')))
    assert caught.value.code=='SYNC_PROPOSAL_PENDING'
