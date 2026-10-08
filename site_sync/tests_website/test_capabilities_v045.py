"""Actual signed endpoint plus production admission: absent grants never create jobs."""
import asyncio,json
from types import SimpleNamespace
from unittest.mock import patch,AsyncMock
import pytest
from fastapi.testclient import TestClient
from backend.app.native.web import create_app
from site_sync.tests_website import test_integration as fixtures
from site_sync.integration.capabilities import handshake,preflight,PreflightError
from site_sync.core.selection import RESTORE_SCOPES
from site_sync.transport.protocol import encode,request_headers,verify_response
from site_sync.core.authority import CredentialRetryError
run=asyncio.run
KEY=bytes.fromhex('6a'*32)

@pytest.fixture
def pair():
 f=fixtures.IntegrationTests();f.setUp();r=f.target;calls=[]
 with TestClient(create_app(lambda req:f.source),base_url=f.source.config.origin) as source,TestClient(create_app(lambda req:r),base_url=r.config.origin) as target:
  target.cookies.set(r.config.name('session'),'test-token')
  class Peer:
   async def candidates(self,q):
    calls.append(q);body=encode(q);headers=request_headers(KEY,body)
    response=source.post('/sync/v1/read',content=body,headers=headers)
    if response.status_code!=200:raise CredentialRetryError('HTTP '+str(response.status_code))
    verify_response(KEY,headers['x-sync-nonce'],200,response.headers,response.content)
    return response.json()
  rt=SimpleNamespace(peer_factory=AsyncMock(return_value=Peer()))
  with patch('site_sync.integration.host.runtime',return_value=rt),patch('site_sync.admin.connectivity.runtime',return_value=rt):
   try:yield f,source,target,{'origin':r.config.origin,'x-csrf-token':r.p['csrf']},calls,rt
   finally:f.tearDown()

def allow(f,scope):
 run(f.source.sql.batch([('UPDATE sync_connections SET export_scope_json=?',(json.dumps(scope),))]))
def create(c,h,scope,request_id='capability-task-045'):
 return c.post('/admin/site-sync/api/tasks',json={'peer_id':'peer','scope':scope,'request_id':request_id},headers=h)

def test_signed_handshake_works_without_export_and_never_reads_business(pair):
 f,s,c,h,calls,rt=pair
 run(f.source.sql.batch([('UPDATE sync_peers SET enabled=0',())]))
 with patch('site_sync.integration.website.TeacherWebsite.source_candidates',side_effect=AssertionError('must not scan')):
  response=c.post('/api/admin/site-sync/connectivity',json={},headers=h)
 data=response.json();assert data['ok'] and data['connectivity_ok'] and data['authorization_ok'] is False
 assert data['steps'][-1]['export_enabled'] is False
 assert len(data['steps'][-1]['missing_scopes'])==20
 assert calls==[{'kind':'probe','version':'probe-v2'}]
 assert not run(f.target.sql.query('SELECT task_id FROM sync_tasks'))

def test_scope_missing_includes_implicit_dependencies_and_no_mutation(pair):
 f,s,c,h,calls,rt=pair;allow(f,['restore_auth_users'])
 result=create(c,h,['restore_auth_users']);data=result.json()
 assert result.status_code==409 and data['code']=='SYNC_PEER_SCOPE_MISSING'
 assert data['connectivity_ok'] and data['missing_scopes']==['restore_auth_roles','restore_auth_permissions']
 assert [x['label'] for x in data['missing_scope_details']]==['角色','权限']
 assert data['request_id']==result.headers['x-request-id']
 assert not run(f.target.sql.query('SELECT task_id FROM sync_tasks'))
 assert not run(f.target.sql.query('SELECT event_id FROM sync_events'))
 allow(f,list(RESTORE_SCOPES));ok=create(c,h,['restore_auth_users']);assert ok.status_code==200,ok.text
 before=len(calls);rt.peer_factory.side_effect=OSError('offline')
 repeated=create(c,h,['restore_auth_users']);assert repeated.json()==ok.json() and len(calls)==before
 assert len(run(f.target.sql.query('SELECT task_id FROM sync_tasks')))==1

def test_enabled_schedule_checked_but_pause_delete_work_offline(pair):
 f,s,c,h,calls,rt=pair;allow(f,[])
 body={'schedule_id':None,'revision':None,'peer_id':'peer','scope':['restore_media_assets'],'interval_seconds':600,'enabled':True,'request_id':'schedule-045'}
 failed=c.post('/admin/site-sync/api/schedules',json=body,headers=h)
 assert failed.status_code==409 and not run(f.target.sql.query('SELECT schedule_id FROM sync_schedules'))
 allow(f,list(RESTORE_SCOPES));assert c.post('/admin/site-sync/api/schedules',json=body,headers=h).status_code==200
 row=c.get('/admin/site-sync/api/schedules').json()['items'][0]
 rt.peer_factory.side_effect=OSError('offline')
 paused=c.post('/admin/site-sync/api/schedules',json=dict(body,schedule_id=row['schedule_id'],revision=row['revision'],enabled=False),headers=h)
 assert paused.status_code==200,paused.text
 row=c.get('/admin/site-sync/api/schedules').json()['items'][0]
 assert c.post('/admin/site-sync/api/schedules/'+row['schedule_id']+'/delete',json={'revision':row['revision']},headers=h).status_code==200

def test_network_failure_is_unknown_authorization_not_missing_scopes(pair):
 f,s,c,h,calls,rt=pair;rt.peer_factory.side_effect=OSError('PRIVATE-URL-SECRET')
 result=create(c,h,['restore_media_assets']);data=result.json()
 assert result.status_code==503 and data['code']=='SYNC_PREFLIGHT_UNAVAILABLE'
 assert data['stage']=='signed_handshake' and 'missing_scopes' not in data
 assert 'PRIVATE-URL-SECRET' not in result.text and not run(f.target.sql.query('SELECT task_id FROM sync_tasks'))

def test_unsigned_cannot_read_capabilities_and_wrong_key_not_scope_failure(pair):
 f,s,c,h,calls,rt=pair;body=encode({'kind':'probe','version':'probe-v2'})
 assert s.post('/sync/v1/read',content=body).status_code==403
 bad=s.post('/sync/v1/read',content=body,headers=request_headers(b'z'*32,body))
 assert bad.status_code==403 and bad.headers['x-sync-error']=='SYNC_SIGNATURE_INVALID'
 assert 'allowed_scopes' not in bad.text

def test_push_reports_receiver_missing_before_creating_receipt(pair):
 f,s,c,h,calls,rt=pair;allow(f,['restore_auth_users'])
 result=c.post('/api/admin/site-sync/proposal',json={'scope':['restore_auth_users'],'request_id':'push-missing-045'},headers=h)
 assert result.status_code==409 and result.json()['missing_scopes']==['restore_auth_roles','restore_auth_permissions']
 assert c.get('/api/admin/site-sync/proposals').json()['items']==[]
 assert not run(f.source.sql.query('SELECT task_id FROM sync_tasks'))

@pytest.mark.parametrize('value',[{}, {'ok':True,'protocol':'probe-v1'}, {'ok':True,'protocol':'probe-v2','export_enabled':True,'allowed_scopes':['x']*65}])
def test_old_or_malformed_peer_contract_fails_closed(value):
 with pytest.raises(Exception):run(handshake(SimpleNamespace(candidates=AsyncMock(return_value=value))))

def test_invalid_local_fields_do_not_contact_peer(pair):
 f,s,c,h,calls,rt=pair
 result=c.post('/admin/site-sync/api/tasks',json={'peer_id':'peer','scope':['restore_media_assets'],'request_id':'bad-settings-045','settings':{'slice_bytes':1}},headers=h)
 assert result.status_code==400 and calls==[]
