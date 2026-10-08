"""Same privileged role with stale saved scope: reproduce the user's 12/20 split."""
import asyncio,json,time
from unittest.mock import patch,AsyncMock
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from backend.app.native.web import create_app
from site_sync.tests_website import test_integration as fixture
from site_sync.integration.host import adapter,grant_id,refresh_scopes,scopes
from site_sync.integration.catalog import BASE_SCOPES
from site_sync.core.selection import RESTORE_SCOPES,normalize
from site_sync.admin.service import Admin,Actor
from site_sync.adapters.tasks import Tasks
from site_sync.integration.proposals import receive
from site_sync.core.authority import AuthorizationError
from site_sync.transport.protocol import encode,request_headers
run=asyncio.run

@pytest.fixture
def site():
 f=fixture.IntegrationTests();f.setUp();r=f.target
 with TestClient(create_app(lambda req:r),base_url=r.config.origin) as client:
  client.cookies.set(r.config.name('session'),'test-token')
  async def candidates(q):
   from site_sync.integration.capabilities import published
   return await published(f.source)
  remote=SimpleNamespace(peer_factory=AsyncMock(return_value=SimpleNamespace(candidates=candidates)))
  transport=patch('site_sync.integration.host.runtime',return_value=remote);transport.start()
  try:yield r,client,{'origin':r.config.origin,'x-csrf-token':r.p['csrf']}
  finally:transport.stop();f.tearDown()

def stale(r):
 run(r.sql.batch([('UPDATE sync_grants SET scopes_json=?',(json.dumps(list(BASE_SCOPES)),)),('UPDATE sync_connections SET export_scope_json=?',(json.dumps(list(BASE_SCOPES)),))]))
def saved(r):return run(r.sql.query('SELECT * FROM sync_grants'))

@pytest.mark.parametrize('platform',['local','worker'])
def test_catalog_is_same_with_stale_grant_and_get_is_read_only(site,platform):
 r,c,h=site;stale(r);before=saved(r)
 api=Admin(Tasks(adapter(r),platform=platform),lambda:int(time.time()),catalog=RESTORE_SCOPES,principal_scopes=scopes(r.p))
 result=run(api.options(Actor(r.p['uid'],grant_id(r.p))))
 assert result['modules']==list(RESTORE_SCOPES) and len(result['modules'])==20
 assert result['authorization']['needs_refresh'] and all(not x['enabled'] for x in result['scope_details'].values())
 assert saved(r)==before and r.p['is_system']==1

def test_explicit_refresh_repairs_export_and_preserves_task_and_policy(site):
 r,c,h=site;stale(r)
 task=c.post('/admin/site-sync/api/tasks',json={'peer_id':'peer','scope':['news'],'request_id':'existing-task-044'},headers=h).json()['task_id']
 before=run(r.sql.query('SELECT * FROM sync_tasks WHERE task_id=?',(task,)))[0];revision=saved(r)[0]['revision']
 policy=run(r.sql.query('SELECT incoming_auto_scope,incoming_auto_delete FROM sync_connections'))
 body=encode({'kind':'probe','version':'probe-v1','scope':['restore_media_assets']})
 def probe():return c.post('/sync/v1/read',content=body,headers=request_headers(bytes.fromhex('6a'*32),body))
 assert probe().status_code==403
 url='/api/admin/site-sync/authorization/refresh'
 assert c.post(url,json={}).status_code==403
 assert c.post(url,json={'scope':['restore_auth_users']},headers=h).status_code==400
 assert c.post(url,json={},headers=h).status_code==200
 assert saved(r)[0]['revision']==revision
 assert run(r.sql.query('SELECT * FROM sync_tasks WHERE task_id=?',(task,)))[0]==before
 assert run(r.sql.query('SELECT incoming_auto_scope,incoming_auto_delete FROM sync_connections'))==policy
 assert probe().status_code==200
 result=c.get('/admin/site-sync/api/options').json()
 assert len(result['modules'])==20 and all(x['enabled'] for x in result['scope_details'].values())
 assert not result['authorization']['needs_refresh']
 assert c.get('/admin/site-sync').status_code==200

def test_non_system_role_cannot_refresh_into_account_export(site):
 r,c,h=site;stale(r)
 run(r.sql.batch([('UPDATE auth_roles SET is_system=0',())]))
 assert c.get('/admin/site-sync/api/options').status_code==403
 api=Admin(Tasks(adapter(r)),lambda:int(time.time()),catalog=RESTORE_SCOPES,principal_scopes=scopes(r.p))
 result=run(api.options(Actor(r.p['uid'],grant_id(r.p))))
 assert len(result['modules'])==20 and not result['scope_details']['restore_auth_users']['enabled']
 response=c.post('/api/admin/site-sync/authorization/refresh',json={},headers=h)
 assert response.status_code==403
 assert 'restore_auth_users' not in json.loads(saved(r)[0]['scopes_json'])
 denied=c.post('/admin/site-sync/api/tasks',json={'peer_id':'peer','scope':['restore_auth_users'],'request_id':'no-elevation-044'},headers=h)
 assert denied.status_code==403

def test_other_owner_cannot_refresh(site):
 r,c,h=site;before=saved(r);r.p=dict(r.p,uid='another-user')
 with pytest.raises(AuthorizationError):run(refresh_scopes(r))
 assert saved(r)==before

@pytest.mark.parametrize('extra,field',[
 ({'scope':['news','restore_news']},'scope'),
 ({'auto_delete':False},'auto_delete'),
 ({'settings':{'slice_bytes':'2KiB'}},'settings.slice_bytes'),
 ({'settings':{'slice_bytes':'4KiB','min_slice_bytes':'8KiB'}},'settings.min_slice_bytes'),
 ({'settings':{'fast_retries':-1}},'settings.fast_retries'),
 ({'settings':['invalid']},'settings'),
 ({'auto_confirm':'true'},'auto_confirm'),
])
def test_400_has_field_code_trace_and_does_not_create_task(site,extra,field):
 r,c,h=site
 body={'peer_id':'peer','scope':['restore_media_assets'],'request_id':'invalid-044','auto_confirm':True,'auto_delete':True,**extra}
 response=c.post('/admin/site-sync/api/tasks',json=body,headers=h);data=response.json()
 assert response.status_code==400,data
 assert data['code']=='SYNC_INPUT_INVALID' and data['field']==field and data['expected']
 assert data['request_id']==response.headers['x-request-id']
 assert run(r.sql.query('SELECT task_id FROM sync_tasks'))==[]

def test_manual_and_proposal_share_receiver_and_keep_receiver_approval_policy(site):
 r,c,h=site
 from site_sync.core import receiver
 original=receiver.create_receiver;calls=[]
 async def spy(repo,**values):calls.append(values['mode']);return await original(repo,**values)
 with patch('site_sync.admin.service.create_receiver',spy),patch('site_sync.integration.proposals.create_receiver',spy):
  response=c.post('/admin/site-sync/api/tasks',json={'peer_id':'peer','scope':['restore_auth_users'],'request_id':'manual-044','settings':{'slice_bytes':'4m'}},headers=h)
  assert response.status_code==200,response.text
  manual=run(r.sql.query('SELECT * FROM sync_tasks'))[0]
  assert manual['slice_bytes']==4194304 and manual['auto_confirm']==1
  run(r.sql.batch([("UPDATE sync_tasks SET status='done',phase='done'",())]))
  proposal=run(receive(r,{'kind':'proposal','version':'proposal-v1','scope':['restore_auth_users'],'request_id':'proposal-044'}))
  incoming=run(r.sql.query('SELECT * FROM sync_tasks WHERE task_id=?',(proposal['task_id'],)))[0]
  assert incoming['scope_json']==manual['scope_json'] and set(json.loads(incoming['scope_json']))==set(normalize(['restore_auth_users']))
  assert proposal['approval_required'] and incoming['auto_confirm']==0
  assert calls==['manual','proposal']

def test_refresh_uses_same_transaction_through_d1_adapter(site):
 r,c,h=site;stale(r)
 from site_sync.adapters.d1 import D1
 from site_sync.tests.test_database import Binding
 db=D1(Binding(adapter(r)))
 with patch('site_sync.integration.host.adapter',return_value=db):
  result=run(refresh_scopes(r))
 assert result['scope_count']==20 and set(RESTORE_SCOPES)<=set(json.loads(saved(r)[0]['scopes_json']))

def test_refresh_lost_commit_receipt_is_safe_to_retry(site):
 r,c,h=site;stale(r)
 from site_sync.adapters.d1 import D1
 from site_sync.tests.test_database import Binding
 binding=Binding(adapter(r));binding.lose=True;db=D1(binding);revision=saved(r)[0]['revision']
 with patch('site_sync.integration.host.adapter',return_value=db):
  with pytest.raises(RuntimeError):run(refresh_scopes(r))
  assert run(refresh_scopes(r))['scope_count']==20
 assert saved(r)[0]['revision']==revision

def test_malformed_body_does_not_echo_sensitive_input(site):
 r,c,h=site
 response=c.post('/admin/site-sync/api/tasks',json={'secret':'DO-NOT-ECHO-THIS','request_id':'invalid-body'},headers=h)
 assert response.status_code==400 and 'DO-NOT-ECHO-THIS' not in response.text
 assert response.json()['request_id']
