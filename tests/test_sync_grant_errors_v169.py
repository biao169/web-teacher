"""A stale task error must not hide a new grant/receipt failure."""
import asyncio,json
import pytest
from backend.app.native import site_sync_manual as manual,site_sync_schedule as schedule,site_sync_work as work
from backend.app.native.catalog import Error
from tests.test_site_sync_v121 import pair
from tests.test_sync_platform_v131 import pair as platform_pair,local_pair
run=asyncio.run

def seed(api,r,status='paused'):
 uid=api('start',{'preview_mode':'brief','direction':'pull','scopes':['students'],'background':True})['uid']
 value={'status':status,'operation':'advance','attempt':3,'retryable':True,'error_code':'1102','retry_count':0,
        'retry_after':'2000-01-01T00:00:00.000Z','recover_after':'2000-01-01T00:00:00.000Z','failed_at':'2000-01-01T00:00:00.000Z'}
 run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?)) WHERE uid=?",(json.dumps(value),uid))]))
 return uid

@pytest.mark.parametrize('status',['paused','running'])
def test_revoked_owner_disables_grant_despite_old_recoverable_error(pair,status):
 api,_,r,*_=pair;uid=seed(api,r,status)
 old=run(schedule.load(r.sql,manual.PREFIX+uid))
 run(r.sql.batch([('UPDATE auth_roles SET is_active=0 WHERE uid=?',(old['owner']['role_uid'],))]))
 before=run(work.position(r.sql,uid))
 result=run(schedule.tick(r,prune_history=False))
 assert result['status']=='paused'
 assert not run(schedule.load(r.sql,manual.PREFIX+uid))['enabled']
 assert run(work.position(r.sql,uid))==before

@pytest.mark.parametrize('code',['1102','sync_http_403'])
def test_fresh_receipt_error_uses_its_own_retry_state(pair,monkeypatch,code):
 api,_,r,*_=pair;uid=seed(api,r)
 async def receipt_failure(*args):raise Error('new receipt failure',503 if code=='1102' else 403,code)
 monkeypatch.setattr(manual,'step',receipt_failure)
 run(schedule.tick(r,prune_history=False))
 saved=run(schedule.load(r.sql,manual.PREFIX+uid))
 if code=='1102':
  assert saved['enabled'] and saved['retry_count']==1
  from backend.app.native.catalog import now
  assert saved['due']>now()
 else:assert not saved['enabled']

def test_repeated_receipt_errors_exhaust_their_own_allowance(pair,monkeypatch):
 api,_,r,*_=pair;uid=seed(api,r)
 async def failure(*args):raise Error('receipt unavailable',503,'1102')
 monkeypatch.setattr(manual,'step',failure)
 for attempt in range(1,10):
  run(schedule.tick(r,prune_history=False))
  saved=run(schedule.load(r.sql,manual.PREFIX+uid))
  assert saved['retry_count']==attempt and saved['enabled']==(attempt<=8)
  run(r.sql.batch([("UPDATE service_meta SET value=json_set(value,'$.due','2000-01-01T00:00:00.000Z') WHERE key=?",(manual.PREFIX+uid,))]))
 assert run(schedule.tick(r,prune_history=False))=={'skipped':'disabled'}

def test_task_exhaustion_also_stops_its_background_grant(platform_pair,monkeypatch):
 api,_,r,*_=platform_pair;uid=seed(api,r)
 limit=8 if r.kind=='local' else 30
 @work.step('advance')
 async def no_progress(*args):raise Error('resource failure without progress',503,'1102')
 monkeypatch.setattr(manual.tasks,'advance',no_progress)
 for _ in range(limit+1):
  run(schedule.tick(r,prune_history=False))
  run(r.sql.batch([
   ("UPDATE service_meta SET value=json_set(value,'$.due','2000-01-01T00:00:00.000Z') WHERE key=?",(manual.PREFIX+uid,)),
   ("UPDATE sync_tasks SET state=json_set(state,'$.work.retry_after','2000-01-01T00:00:00.000Z') WHERE uid=?",(uid,)),
  ]))
 saved=run(work.position(r.sql,uid))['work']
 assert not saved['retryable'] and saved['retry_count']==limit+1
 assert not run(schedule.load(r.sql,manual.PREFIX+uid))['enabled']
