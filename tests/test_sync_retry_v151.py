import asyncio,json
from types import SimpleNamespace
import pytest
from backend.app.native import site_sync_work as work,site_sync_tasks as tasks
from backend.app.native.catalog import Error
from tests.test_site_sync_v121 import pair
run=asyncio.run

@pytest.mark.parametrize('kind,delays',[('r2',(60,180,600)),('local',(5,15,60))])
def test_platform_delays(kind,delays,monkeypatch):
 monkeypatch.setattr(work,'now',lambda **kw:kw.get('seconds',0))
 for n,delay in enumerate(delays):
  value=work.retry_state(Error('timeout',502,'sync_timeout'),{'retry_count':n},SimpleNamespace(kind=kind))
  assert value['retry_after']==delay and value['retryable']
 assert not work.retry_state(Error('timeout',502,'sync_timeout'),{'retry_count':3},SimpleNamespace(kind=kind))['retryable']

@pytest.mark.parametrize('status,key',[('paused','retry_after'),('running','recover_after')])
def test_cooldown_preserves_checkpoint(pair,status,key):
 api,preview,r,*_=pair;uid=api('start',{'direction':'pull','scopes':['students'],'preview_mode':'brief'})['uid']
 checkpoint={'operation':'advance','status':status,key:'9999-01-01T00:00:00.000Z','retryable':True,'retry_count':1}
 run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?)) WHERE uid=?",(json.dumps(checkpoint),uid))]))
 before=run(tasks.get(r.sql,uid))['_raw_state']
 for action in ('advance','resume'):
  response=api(action,{'uid':uid},ok=False)
  assert response.status_code==429 and response.json()['code']=='sync_retry_wait'
 assert run(tasks.get(r.sql,uid))['_raw_state']==before
 assert not run(r.sql.query("SELECT uid FROM admin_mutation_guards WHERE uid LIKE 'site-sync:task:%'"))


def test_manual_resume_clears_only_linked_schedule(pair):
 api,preview,r,*_=pair;uid=api('start',{'direction':'pull','scopes':['students'],'preview_mode':'brief'})['uid']
 checkpoint={'operation':'advance','status':'paused','retryable':False,'retry_count':4}
 run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?)) WHERE uid=?",(json.dumps(checkpoint),uid)),
 ("INSERT OR REPLACE INTO service_meta(key,value) VALUES('site-sync:schedule-state',?)",(json.dumps({'preview_uid':uid,'retry_after':'9999','next_due':'9999'}),))]))
 response=api('advance',{'uid':uid},ok=False)
 assert response.json()['code']=='sync_retry_exhausted'
 api('resume',{'uid':uid})
 state=json.loads(run(r.sql.query("SELECT value FROM service_meta WHERE key='site-sync:schedule-state'"))[0]['value'])
 assert 'retry_after' not in state and state['preview_uid']==uid
 assert run(tasks.get(r.sql,uid))['state']['work']['status']=='saved'


def test_unexpected_exception_is_saved_without_details(pair):
 api,preview,r,*_=pair;uid=api('start',{'direction':'pull','scopes':['students'],'preview_mode':'brief'})['uid']
 # Decorator itself is exercised through the same authorization context used by scheduler.
 from backend.app.native import site_sync_schedule as scheduler
 from tests.test_site_sync_v123 import enable
 enable(api)
 base=run(scheduler.context(r,run(scheduler.load(r.sql))))
 @work.step('advance')
 async def broken(*args):raise RuntimeError('secret-diagnostic-do-not-expose')
 with pytest.raises(Error):run(broken(base,uid))
 w=run(tasks.get(r.sql,uid))['state']['work']
 assert w['status']=='paused' and w['error_code']=='sync_server' and not w['retryable']
 assert 'secret-diagnostic' not in w['error']
