"""Production sync entry with real sessions/CSRF and isolated SQLite test data."""
import asyncio,re
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from fastapi.testclient import TestClient
from test_startup_lazy import entry
from tests.test_site_sync_v121 import pair

@pytest.fixture
def lean(pair,entry,monkeypatch):
 from worker_runtime import sync_http
 from backend.app.adapters.d1 import sql as d1
 api,_,r,remote,client,*_=pair
 monkeypatch.setattr(d1,'D1SQL',lambda binding:r.sql)
 html=client.get('/admin/data-tools/sync').text
 headers={'Accept':'application/json','Origin':str(client.base_url).rstrip('/'),'X-CSRF-Token':re.search('id="site-sync" data-csrf="([^"]+)"',html)[1]}
 env=SimpleNamespace(DB=object(),TEACHER_ORIGIN=r.config.origin,TEACHER_DATABASE_BINDING='DB')
 clients=[]
 def make(monitor=True):
  app=sync_http.build(monitor)
  async def bound(scope,receive,send):
   await app({**scope,'env':env},receive,send)
  c=TestClient(bound,base_url=str(client.base_url));c.cookies.update(client.cookies);clients.append(c);return c
 yield make,headers,r,api,env
 for c in clients:c.close()

def test_monitor_without_media_binding_or_full_app(lean,entry,monkeypatch):
 make,h,r,_,env=lean
 monkeypatch.setattr(entry,'build_application',Mock(side_effect=AssertionError('full app forbidden')))
 c=make();v=c.post('/api/admin/site-sync/monitor',headers=h,json={})
 assert v.status_code==200,v.text
 assert v.json()['runtime_version']=='0.15.181' and v.json()['browser_wake_available']
 assert v.headers['cache-control']=='no-store' and not hasattr(env,'MEDIA')
 assert entry.application.application is None

@pytest.mark.parametrize('change,expected',[('csrf',403),('origin',403),('host',400),('session',401),('permission',403)])
def test_monitor_preserves_authorization(lean,change,expected):
 make,h,r,*_=lean;c=make();h=dict(h)
 if change=='csrf':h['X-CSRF-Token']='wrong'
 if change=='origin':h['Origin']='https://evil.example'
 if change=='host':h['Host']='evil.example'
 if change=='session':c.cookies.clear()
 if change=='permission':asyncio.run(r.sql.batch([("UPDATE auth_permissions SET can_edit=0 WHERE module='data_tools'",())]))
 v=c.post('/api/admin/site-sync/monitor',headers=h,json={})
 assert v.status_code==expected,v.text
 assert v.headers['cache-control']=='no-store'

def test_monitor_error_response_is_small_and_redacted(lean,monkeypatch):
 make,h,r,*_=lean;c=make()
 from backend.app.native import site_sync_status
 async def fail(*args):raise RuntimeError('PRIVATE password payload')
 monkeypatch.setattr(site_sync_status,'read',fail)
 v=c.post('/api/admin/site-sync/monitor',headers=h,json={})
 assert v.status_code==503 and 'PRIVATE' not in v.text
 assert v.json()['code']=='worker_request_failed' and v.headers['retry-after']=='60'


def test_sync_business_api_runs_without_web_or_media_initialization(lean):
 make,h,r,api,_=lean;c=make(False)
 uid=api('start',{'preview_mode':'brief','direction':'pull','scopes':['students']})['uid']
 v=c.post('/api/admin/site-sync/advance',headers=h,json={'uid':uid})
 assert v.status_code==200,v.text
 assert v.json()['uid']==uid and v.json()['work']['completed_steps']==1
 assert v.json()['request_interval_ms']==5000

def test_wake_keeps_paused_grant_paused_and_throttles(lean):
 make,h,r,api,_=lean;c=make()
 uid=api('start',{'preview_mode':'brief','direction':'pull','scopes':['students'],'background':True})['uid']
 api('manual-pause',{'uid':uid})
 v=c.post('/api/admin/site-sync/wake',headers=h,json={})
 assert v.status_code==200,v.text
 assert v.json().get('skipped')=='disabled'
 again=c.post('/api/admin/site-sync/wake',headers=h,json={})
 assert again.json()['skipped']=='wake-cooldown'
 from backend.app.native.site_sync_gate import load
 grant=asyncio.run(load(r.sql,'site-sync:manual:'+uid))
 assert not grant['enabled'] and grant['paused_by_user']

def test_wake_advances_existing_grant(lean):
 make,h,r,api,_=lean;c=make()
 uid=api('start',{'preview_mode':'brief','direction':'pull','scopes':['students'],'background':True})['uid']
 v=c.post('/api/admin/site-sync/wake',headers=h,json={})
 assert v.status_code==200 and v.json()['status']=='ok',v.text
 from backend.app.native.site_sync_work import position
 assert asyncio.run(position(r.sql,uid))['work']['completed_steps']==1

@pytest.mark.parametrize('code',['1101','1102'])
def test_manual_progress_then_resource_error_keeps_background_recovery(lean,monkeypatch,code):
 from backend.app.native import site_sync_tasks as tasks
 from backend.app.native.catalog import Error
 from backend.app.native.site_sync_gate import load
 from backend.app.native.site_sync_work import position
 make,h,r,api,_=lean;c=make(False);monitor=make(True)
 uid=api('start',{'preview_mode':'brief','direction':'pull','scopes':['students'],'background':True})['uid']
 persist=tasks.persist
 async def interrupted(*args,**kwargs):
  await persist(*args,**kwargs)
  raise Error('simulated resource limit',503,code)
 monkeypatch.setattr(tasks,'persist',interrupted)
 result=c.post('/api/admin/site-sync/advance',headers=h,json={'uid':uid})
 assert result.status_code==503 and result.json()['code']==code
 saved=asyncio.run(position(r.sql,uid));assert saved['work']['retryable'] and saved['work']['retry_count']==0
 assert asyncio.run(load(r.sql,'site-sync:manual:'+uid))['enabled']
 monkeypatch.setattr(tasks,'persist',persist)
 asyncio.run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work.retry_after','2000-01-01T00:00:00.000Z','$.work.pace_after','2000-01-01T00:00:00.000Z') WHERE uid=?",(uid,))]))
 result=monitor.post('/api/admin/site-sync/wake',headers=h,json={})
 assert result.status_code==200 and result.json()['status']=='ok',result.text
 after=asyncio.run(position(r.sql,uid))
 assert after['checkpoint']!=saved['checkpoint'] and after['work']['retry_count']==0
 assert asyncio.run(load(r.sql,'site-sync:manual:'+uid))['enabled']
